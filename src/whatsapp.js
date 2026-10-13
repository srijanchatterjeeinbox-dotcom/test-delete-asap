const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./db');
const ai = require('./ai');

let sock = null;
let qrText = null;
let connected = false;
let starting = false;
let lastError = null;
let connectedUser = null;
const seenMessageIds = new Set();

const authDir = path.join(__dirname, '..', 'data', 'wa-auth');

function cleanAuthDir() {
  try {
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
    fs.mkdirSync(authDir, { recursive: true });
  } catch (e) {
    console.error('Failed to clean auth dir:', e.message);
  }
}

function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  return digits;
}

function isChatbotEnabled() {
  const dbSetting = db.getSetting('chatbot_enabled', 'true');
  const envSetting = process.env.ENABLE_WHATSAPP_CHATBOT;
  if (envSetting === 'false') return false;
  return dbSetting === 'true' || dbSetting === '1';
}

function setChatbotEnabled(enabled) {
  db.setSetting('chatbot_enabled', enabled ? 'true' : 'false');
  return isChatbotEnabled();
}

function getChatbotConfig() {
  return {
    enabled: isChatbotEnabled(),
    prompt: db.getSetting('chatbot_prompt', ''),
    welcome: db.getSetting('chatbot_welcome', '')
  };
}

function setChatbotConfig(config) {
  if (typeof config.enabled !== 'undefined') {
    db.setSetting('chatbot_enabled', config.enabled ? 'true' : 'false');
  }
  if (typeof config.prompt === 'string') {
    db.setSetting('chatbot_prompt', config.prompt.slice(0, 3000));
  }
  if (typeof config.welcome === 'string') {
    db.setSetting('chatbot_welcome', config.welcome.slice(0, 1000));
  }
  return getChatbotConfig();
}

function status() {
  const phone = connectedUser?.id
    ? String(connectedUser.id).split(':')[0].replace('@s.whatsapp.net', '')
    : null;

  return {
    enabled: process.env.ENABLE_WHATSAPP === 'true',
    connected,
    starting,
    qr: qrText,
    phone: phone ? '+' + phone : null,
    name: connectedUser?.name || 'Capital Institute',
    lastError,
    chatbotEnabled: isChatbotEnabled()
  };
}

async function startWhatsApp() {
  if (process.env.ENABLE_WHATSAPP !== 'true') {
    throw new Error('WhatsApp integration is disabled. Set ENABLE_WHATSAPP=true in .env to enable it.');
  }

  if (connected && sock) {
    return status();
  }

  if (starting) {
    return status();
  }

  starting = true;
  lastError = null;

  fs.mkdirSync(authDir, { recursive: true });

  return new Promise(async (resolve, reject) => {
    let hasResolved = false;
    const safeResolve = () => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(status());
      }
    };

    // Auto-resolve after 4s if socket is still initializing
    const timer = setTimeout(() => {
      safeResolve();
    }, 4000);

    try {
      const pino = require('pino');
      const baileys = await import('@whiskeysockets/baileys');
      const makeWASocket = baileys.default || baileys.makeWASocket;
      const {
        useMultiFileAuthState,
        makeCacheableSignalKeyStore,
        DisconnectReason,
        fetchLatestBaileysVersion,
        Browsers
      } = baileys;

      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      let version;
      try {
        const v = await fetchLatestBaileysVersion();
        version = v.version;
      } catch (_) {}

      const silentLogger = pino({ level: 'silent' });

      sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, silentLogger)
        },
        ...(version ? { version } : {}),
        logger: silentLogger,
        printQRInTerminal: false,
        browser: Browsers.windows('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async update => {
        if (update.qr) {
          try {
            qrText = await QRCode.toDataURL(update.qr, {
              margin: 2,
              scale: 6,
              color: { dark: '#0f172a', light: '#ffffff' }
            });
            starting = false;
            lastError = null;
            clearTimeout(timer);
            safeResolve();
          } catch (qrErr) {
            console.error('Failed to encode QR code:', qrErr.message);
          }
        }

        if (update.connection === 'open') {
          connected = true;
          qrText = null;
          starting = false;
          lastError = null;
          connectedUser = sock?.user || null;
          console.log('[WhatsApp Gateway] Connected successfully as', connectedUser?.id || 'Institute');
          clearTimeout(timer);
          safeResolve();
        }

        if (update.connection === 'close') {
          connected = false;
          starting = false;
          sock = null;
          connectedUser = null;

          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

          lastError = update.lastDisconnect?.error?.message ||
            (isLoggedOut ? 'Logged out from WhatsApp device.' : `Connection closed${statusCode ? ` (${statusCode})` : ''}`);

          if (isLoggedOut) {
            cleanAuthDir();
            qrText = null;
          } else if (process.env.ENABLE_WHATSAPP === 'true') {
            setTimeout(() => {
              startWhatsApp().catch(e => { lastError = e.message; });
            }, 5000);
          }
        }
      });

      // WhatsApp AI Chatbot - Message Handler
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const m of messages) {
          try {
            if (!m.message || m.key.fromMe) continue;

            const msgId = m.key.id;
            if (msgId && seenMessageIds.has(msgId)) continue;
            if (msgId) {
              seenMessageIds.add(msgId);
              if (seenMessageIds.size > 1000) {
                const first = seenMessageIds.values().next().value;
                seenMessageIds.delete(first);
              }
            }

            const remoteJid = m.key.remoteJid || '';
            // Only handle 1-on-1 private chats with students/parents
            if (!remoteJid || remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@newsletter') || remoteJid.endsWith('@g.us')) {
              continue;
            }

            const incomingText = (
              m.message.conversation ||
              m.message.extendedTextMessage?.text ||
              m.message.imageMessage?.caption ||
              m.message.videoMessage?.caption ||
              ''
            ).trim();

            if (!incomingText) continue;

            const rawDigits = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
            const formattedPhone = '+' + rawDigits;

            // Look up student in database
            let lead = db.prepare(
              'SELECT * FROM leads WHERE phone LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 1'
            ).get(`%${rawDigits.slice(-10)}%`, `%${rawDigits}%`);

            if (!lead) {
              // Auto-create lead inquiry for new incoming WhatsApp contacts
              const ins = db.prepare(`
                INSERT INTO leads (name, phone, email, company, source, status, segment, notes, consent, opted_out)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                `WhatsApp Student (${rawDigits.slice(-4)})`,
                formattedPhone,
                '',
                'General Coaching Inquiry',
                'WhatsApp AI Bot',
                'New Inquiry',
                'Direct Inquirer',
                `Initial WhatsApp message: "${incomingText.slice(0, 150)}"`,
                1,
                0
              );
              lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(ins.lastInsertRowid);
            }

            // Log incoming message to messages audit log
            db.prepare(`
              INSERT INTO messages (lead_id, phone, direction, body, status)
              VALUES (?, ?, 'inbound', ?, 'received')
            `).run(lead ? lead.id : null, formattedPhone, incomingText);

            // Check if AI Chatbot is enabled
            if (!isChatbotEnabled()) {
              console.log(`[WhatsApp] Inbound message from ${formattedPhone} logged. Chatbot auto-reply is currently paused.`);
              continue;
            }

            // Build student context for AI
            const studentContext = lead
              ? `Student Inquirer: ${lead.name}. Course Interest / Target: ${lead.company || lead.segment || 'Competitive Exams'}. Current Status: ${lead.status}. Phone: ${lead.phone}. Notes: ${lead.notes || 'None'}.`
              : `New student inquiring on WhatsApp with phone ${formattedPhone}.`;

            const customInstruction = db.getSetting('chatbot_prompt', '');

            // Generate AI Chatbot response
            const aiReply = await ai.answerForWhatsApp(incomingText, studentContext, customInstruction);

            if (sock && connected && aiReply) {
              await sock.sendMessage(remoteJid, { text: aiReply }, { quoted: m });

              // Log outgoing bot reply in messages audit log
              db.prepare(`
                INSERT INTO messages (lead_id, phone, direction, body, status)
                VALUES (?, ?, 'outbound', ?, 'bot_reply')
              `).run(lead ? lead.id : null, formattedPhone, aiReply);

              console.log(`[WhatsApp AI Chatbot] Replied to ${formattedPhone}`);
            }
          } catch (msgErr) {
            console.error('Error handling WhatsApp message upsert:', msgErr.message);
          }
        }
      });
    } catch (e) {
      clearTimeout(timer);
      starting = false;
      lastError = e.message;
      if (!hasResolved) {
        hasResolved = true;
        reject(e);
      }
    }
  });
}

async function sendMessage(phone, message) {
  if (!connected || !sock) {
    throw new Error('WhatsApp is not connected. Open Settings to connect WhatsApp.');
  }

  const digits = normalizePhone(phone);
  if (digits.length < 10) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  const result = await sock.sendMessage(`${digits}@s.whatsapp.net`, {
    text: String(message)
  });

  return { id: result?.key?.id || null };
}

async function disconnectWhatsApp(clearSession = true) {
  try {
    if (sock) {
      await sock.logout().catch(() => {});
    }
  } catch (_) {}

  sock = null;
  connected = false;
  starting = false;
  qrText = null;
  connectedUser = null;

  if (clearSession) {
    cleanAuthDir();
  }

  return status();
}

async function resetSession() {
  await disconnectWhatsApp(true);
  return await startWhatsApp();
}

module.exports = {
  startWhatsApp,
  disconnectWhatsApp,
  resetSession,
  status,
  sendMessage,
  isChatbotEnabled,
  setChatbotEnabled,
  getChatbotConfig,
  setChatbotConfig
};
