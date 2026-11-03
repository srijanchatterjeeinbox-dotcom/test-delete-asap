const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const NodeCache = require('@cacheable/node-cache').default || require('@cacheable/node-cache');
const db = require('./db');
const ai = require('./ai');

let sock = null;
let qrText = null;
let connected = false;
let starting = false;
let lastError = null;
let connectedUser = null;
const seenMessageIds = new Set();

// Cache for retries and message store to eliminate "Waiting for this message" WhatsApp decrypt errors
const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, useClones: false });
const messageStore = new Map();

function storeMessage(key, message) {
  if (!key || !key.id) return;
  const rawMsg = message?.message || message;
  if (!rawMsg) return;

  const msgId = String(key.id);
  const remoteJid = String(key.remoteJid || '');

  if (remoteJid) {
    messageStore.set(`${remoteJid}:${msgId}`, rawMsg);
  }
  messageStore.set(msgId, rawMsg);

  if (messageStore.size > 3000) {
    const firstKey = messageStore.keys().next().value;
    messageStore.delete(firstKey);
  }
}

async function getMessage(key) {
  if (!key || !key.id) return undefined;
  const msgId = String(key.id);
  const remoteJid = String(key.remoteJid || '');

  let found = (remoteJid ? messageStore.get(`${remoteJid}:${msgId}`) : null) || messageStore.get(msgId);
  if (found) {
    return found;
  }

  // Fallback: check SQLite messages table for this phone number
  try {
    const rawDigits = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
    if (rawDigits) {
      const recent = db.prepare(
        'SELECT body FROM messages WHERE phone LIKE ? ORDER BY id DESC LIMIT 1'
      ).get(`%${rawDigits.slice(-10)}%`);
      if (recent?.body) {
        return {
          conversation: recent.body
        };
      }
    }
  } catch (_) {}

  // Safe fallback to prevent WhatsApp client decrypt-fail permanent stall
  return {
    conversation: 'Dr. Pandey Healthcare Clinic AI Reception'
  };
}

const authDir = path.join(__dirname, '..', 'data', 'wa-auth');

function cleanCorruptedSessions() {
  try {
    if (fs.existsSync(authDir)) {
      const files = fs.readdirSync(authDir);
      for (const f of files) {
        if (f.startsWith('session-') || f.startsWith('app-state-sync-version-')) {
          try { fs.unlinkSync(path.join(authDir, f)); } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

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
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = '91' + digits;
  }
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
    name: connectedUser?.name || 'Dr. Pandey Healthcare Clinic',
    lastError,
    chatbotEnabled: isChatbotEnabled()
  };
}

function extractMessageContent(msg) {
  if (!msg) return '';
  let content = msg;
  if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
  if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message;
  if (content.viewOnceMessageV2?.message) content = content.viewOnceMessageV2.message;
  if (content.documentWithCaptionMessage?.message) content = content.documentWithCaptionMessage.message;

  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    content.templateButtonReplyMessage?.selectedId ||
    ''
  ).trim();
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
  cleanCorruptedSessions();

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
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        generateHighQualityLinkPreview: false,
        msgRetryCounterCache,
        getMessage
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
          console.log('[WhatsApp Gateway] Connected successfully as', connectedUser?.id || 'Dr. Pandey Healthcare Clinic');
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

      // WhatsApp Message Tracking & AI Receptionist Handler
      sock.ev.on('messages.upsert', async ({ messages }) => {
        if (!Array.isArray(messages)) return;

        for (const m of messages) {
          try {
            if (!m.message) continue;
            storeMessage(m.key, m.message);

            const msgId = m.key?.id;
            if (msgId && seenMessageIds.has(msgId)) continue;
            if (msgId) {
              seenMessageIds.add(msgId);
              if (seenMessageIds.size > 2000) {
                const first = seenMessageIds.values().next().value;
                seenMessageIds.delete(first);
              }
            }

            const remoteJid = m.key?.remoteJid || '';
            // Only handle 1-on-1 private patient chats (skip broadcasts, newsletters, groups)
            if (!remoteJid || remoteJid.endsWith('@broadcast') || remoteJid.endsWith('@newsletter') || remoteJid.endsWith('@g.us')) {
              continue;
            }

            const incomingText = extractMessageContent(m.message);
            if (!incomingText) continue;

            const isFromMe = Boolean(m.key?.fromMe);
            const rawDigits = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
            const formattedPhone = '+' + rawDigits;
            const senderName = m.pushName ? m.pushName.trim() : '';

            // Look up patient in database
            let lead = db.prepare(
              'SELECT * FROM leads WHERE phone LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 1'
            ).get(`%${rawDigits.slice(-10)}%`, `%${rawDigits}%`);

            if (!lead && !isFromMe) {
              // Auto-create patient record for new incoming WhatsApp inquiries
              const patientTitle = senderName || `WhatsApp Patient (${rawDigits.slice(-4)})`;
              const ins = db.prepare(`
                INSERT INTO leads (name, phone, email, company, source, status, segment, notes, consent, opted_out)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                patientTitle,
                formattedPhone,
                '',
                'General Health / Ayurvedic Consultation',
                'WhatsApp AI Receptionist',
                'New Inquiry',
                'Direct Inquirer',
                `Initial WhatsApp message: "${incomingText.slice(0, 150)}"`,
                1,
                0
              );
              lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(ins.lastInsertRowid);
            } else if (lead && senderName && lead.name.startsWith('WhatsApp Patient')) {
              db.prepare('UPDATE leads SET name = ? WHERE id = ?').run(senderName, lead.id);
              lead.name = senderName;
            }

            // OUTBOUND: Track messages sent from the connected phone
            if (isFromMe) {
              const recent = db.prepare(
                "SELECT id FROM messages WHERE phone = ? AND body = ? AND created_at >= datetime('now', '-10 seconds') LIMIT 1"
              ).get(formattedPhone, incomingText);

              if (!recent) {
                db.prepare(`
                  INSERT INTO messages (lead_id, phone, direction, body, status)
                  VALUES (?, ?, 'outbound', ?, 'sent')
                `).run(lead ? lead.id : null, formattedPhone, incomingText);
                console.log(`[WhatsApp] Tracked sent message from phone to ${formattedPhone}`);
              }
              continue; // Do not auto-reply to our own messages
            }

            // INBOUND: Track patient message in audit log
            db.prepare(`
              INSERT INTO messages (lead_id, phone, direction, body, status)
              VALUES (?, ?, 'inbound', ?, 'received')
            `).run(lead ? lead.id : null, formattedPhone, incomingText);
            console.log(`[WhatsApp] Received message from ${formattedPhone}: "${incomingText.slice(0, 60)}"`);

            // Check if AI Receptionist is enabled
            if (!isChatbotEnabled()) {
              console.log(`[WhatsApp] Inbound message from ${formattedPhone} logged. AI Receptionist is currently paused in settings.`);
              continue;
            }

            // Build patient context for AI
            const patientContext = lead
              ? `Patient: ${lead.name}. Health Concern / Department: ${lead.company || lead.segment || 'Ayurvedic & Homeopathic Consultation'}. Current Status: ${lead.status}. Phone: ${lead.phone}. Notes: ${lead.notes || 'None'}.`
              : `New patient inquiring on WhatsApp with phone ${formattedPhone}.`;

            const customInstruction = db.getSetting('chatbot_prompt', '');

            // Retrieve conversation history context window (last 8 messages for this patient/phone)
            let conversationHistory = [];
            try {
              const historyRows = db.prepare(`
                SELECT direction, body, created_at 
                FROM messages 
                WHERE (phone = ? OR phone LIKE ?) 
                ORDER BY id DESC LIMIT 8
              `).all(formattedPhone, `%${rawDigits.slice(-10)}%`);

              conversationHistory = historyRows.reverse().map(r => ({
                role: r.direction === 'inbound' ? 'user' : 'model',
                text: r.body
              }));
            } catch (histErr) {
              console.warn('[WhatsApp] Could not load message history context window:', histErr.message);
            }

            // Generate AI Receptionist response with conversation context window & reference context (drpandeyhealthcare.com)
            const aiReply = await ai.answerForWhatsApp(incomingText, patientContext, customInstruction, conversationHistory);

            if (sock && connected && aiReply) {
              // Send direct response to remoteJid and store the message for encryption retry requests
              const sentMsg = await sock.sendMessage(remoteJid, { text: aiReply });
              if (sentMsg?.key && sentMsg?.message) {
                storeMessage(sentMsg.key, sentMsg.message);
              }

              // Log outgoing bot reply in messages audit log
              db.prepare(`
                INSERT INTO messages (lead_id, phone, direction, body, status)
                VALUES (?, ?, 'outbound', ?, 'bot_reply')
              `).run(lead ? lead.id : null, formattedPhone, aiReply);

              console.log(`[WhatsApp AI Receptionist] Replied to ${formattedPhone}`);
            }
          } catch (msgErr) {
            console.error('Error handling WhatsApp message:', msgErr.message);
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

  if (result?.key && result?.message) {
    storeMessage(result.key, result.message);
  }

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
