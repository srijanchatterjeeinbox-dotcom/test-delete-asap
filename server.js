require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const db = require('./src/db');
const wa = require('./src/whatsapp');
const { answer, answerForWhatsApp } = require('./src/ai');

const app = express();
app.disable('x-powered-by');

app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const sessions = new Map();
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD is missing from your .env file.');
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_DURATION_MS);
  return token;
}

function auth(req, res, next) {
  if (
    req.path === '/login' ||
    req.path === '/health' ||
    req.path.startsWith('/s/')
  ) {
    return next();
  }

  const token = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '');

  const expiresAt = sessions.get(token);

  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Please sign in again.' });
  }

  next();
}

app.use('/api', auth);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'Capital Institute',
    mode: process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY
      ? 'AI configured'
      : 'demo mode'
  });
});

app.post('/api/login', (req, res) => {
  const submitted = req.body?.password;

  if (typeof submitted !== 'string' || submitted !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  res.json({ token: createSession() });
});

app.post('/api/logout', (req, res) => {
  const token = String(req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '');

  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/overview', (_req, res) => {
  const count = sql => db.prepare(sql).get().n;

  res.json({
    leads: count('SELECT COUNT(*) n FROM leads'),
    newLeads: count("SELECT COUNT(*) n FROM leads WHERE status='New'"),
    campaigns: count('SELECT COUNT(*) n FROM campaigns'),
    messages: count("SELECT COUNT(*) n FROM messages WHERE direction='outbound'"),
    responses: count('SELECT COUNT(*) n FROM survey_responses'),
    tasks: count("SELECT COUNT(*) n FROM tasks WHERE status!='Done'"),
    wa: wa.status()
  });
});

/* LEADS */

app.get('/api/leads', (req, res) => {
  const q = `%${String(req.query.q || '').slice(0, 100)}%`;

  res.json(
    db.prepare(
      'SELECT * FROM leads WHERE name LIKE ? OR phone LIKE ? OR company LIKE ? ORDER BY id DESC LIMIT 500'
    ).all(q, q, q)
  );
});

app.post('/api/leads', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();

  if (!name) {
    return res.status(400).json({ error: 'Lead name is required' });
  }

  const info = db.prepare(
    'INSERT INTO leads(name,phone,email,company,source,status,segment,notes,consent,opted_out) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(
    name,
    String(b.phone || '').slice(0, 40),
    String(b.email || '').slice(0, 200),
    String(b.company || b.course || '').slice(0, 200),
    String(b.source || 'Walk-in').slice(0, 100),
    String(b.status || 'New Inquiry').slice(0, 50),
    String(b.segment || '').slice(0, 100),
    String(b.notes || '').slice(0, 2000),
    b.consent ? 1 : 0,
    0
  );

  res.status(201).json(
    db.prepare('SELECT * FROM leads WHERE id=?').get(info.lastInsertRowid)
  );
});

app.patch('/api/leads/:id', (req, res) => {
  const allowed = [
    'name', 'phone', 'email', 'company', 'source', 'status',
    'segment', 'notes', 'consent', 'opted_out'
  ];

  const b = req.body || {};
  const sets = [];
  const vals = [];

  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(b, k)) {
      sets.push(`${k}=?`);

      if (k === 'consent' || k === 'opted_out') {
        vals.push(b[k] ? 1 : 0);
      } else {
        vals.push(String(b[k] ?? '').slice(0, k === 'notes' ? 2000 : 500));
      }
    }
  }

  if (!sets.length) {
    return res.status(400).json({ error: 'No fields supplied' });
  }

  sets.push('updated_at=CURRENT_TIMESTAMP');
  vals.push(req.params.id);

  db.prepare(`UPDATE leads SET ${sets.join(',')} WHERE id=?`).run(...vals);

  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(req.params.id);

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  res.json(lead);
});

app.delete('/api/leads/:id', (req, res) => {
  db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/leads/import', (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];

  if (rows.length > 2000) {
    return res.status(400).json({ error: 'Import is limited to 2,000 rows' });
  }

  const insert = db.prepare(
    'INSERT INTO leads(name,phone,email,company,source,status,segment,notes,consent) VALUES(?,?,?,?,?,?,?,?,?)'
  );

  let imported = 0;

  const tx = db.transaction(() => {
    for (const r of rows) {
      const name = String(
        r.name || r.Name || r.full_name || r['Full Name'] || ''
      ).trim();

      if (!name) continue;

      insert.run(
        name.slice(0, 200),
        String(r.phone || r.Phone || r.mobile || r.Mobile || '').slice(0, 40),
        String(r.email || r.Email || '').slice(0, 200),
        String(r.company || r.Company || r.course || r.Course || r.class || r.Class || '').slice(0, 200),
        'Import',
        'New Inquiry',
        String(r.segment || r.Segment || r.batch || r.Batch || '').slice(0, 100),
        '',
        0
      );

      imported++;
    }
  });

  tx();
  res.json({
    imported,
    note: 'Imported leads have consent disabled until permission is confirmed.'
  });
});

/* MESSAGES */

app.get('/api/messages', (_req, res) => {
  res.json(
    db.prepare(
      'SELECT m.*,l.name lead_name FROM messages m LEFT JOIN leads l ON l.id=m.lead_id ORDER BY m.id DESC LIMIT 300'
    ).all()
  );
});

/* CAMPAIGNS */

app.get('/api/campaigns', (_req, res) => {
  res.json(
    db.prepare(
      'SELECT c.*, (SELECT COUNT(*) FROM campaign_recipients r WHERE r.campaign_id=c.id) recipients FROM campaigns c ORDER BY c.id DESC'
    ).all()
  );
});

app.post('/api/campaigns', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const message = String(b.message || '').trim();

  if (!name || !message) {
    return res.status(400).json({
      error: 'Campaign name and message are required'
    });
  }

  const info = db.prepare(
    'INSERT INTO campaigns(name,message,segment,status) VALUES(?,?,?,?)'
  ).run(name, message, String(b.segment || ''), 'Draft');

  res.status(201).json(
    db.prepare('SELECT * FROM campaigns WHERE id=?').get(info.lastInsertRowid)
  );
});

app.post('/api/campaigns/:id/queue', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);

  if (!c) return res.status(404).json({ error: 'Campaign not found' });

  const leads = db.prepare(
    "SELECT * FROM leads WHERE consent=1 AND opted_out=0 AND phone!='' AND (?='' OR segment=?)"
  ).all(c.segment, c.segment);

  const ins = db.prepare(
    "INSERT OR IGNORE INTO campaign_recipients(campaign_id,lead_id,status) VALUES(?,?,'queued')"
  );

  let added = 0;

  const tx = db.transaction(() => {
    for (const lead of leads) {
      const result = ins.run(c.id, lead.id);
      added += result.changes;
    }
  });

  tx();

  const remaining = db.prepare(
    "SELECT COUNT(*) n FROM campaign_recipients WHERE campaign_id=? AND status='queued'"
  ).get(c.id).n;

  db.prepare("UPDATE campaigns SET status='Queued' WHERE id=?").run(c.id);

  res.json({
    queued: added,
    totalQueued: remaining,
    message: 'Only consented leads who have not opted out are eligible.'
  });
});

app.post('/api/campaigns/:id/send', async (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);

  if (!c) return res.status(404).json({ error: 'Campaign not found' });

  const cap = Math.max(1, Math.min(30, Number(req.body.messagesPerMinute) || 6));

  const recipients = db.prepare(
    "SELECT r.id recipient_id,l.* FROM campaign_recipients r JOIN leads l ON l.id=r.lead_id WHERE r.campaign_id=? AND r.status='queued' AND l.consent=1 AND l.opted_out=0 AND l.phone!='' ORDER BY r.id LIMIT 100"
  ).all(c.id);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    const lead = recipients[i];

    try {
      await wa.sendMessage(lead.phone, c.message);

      db.prepare(
        "UPDATE campaign_recipients SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(lead.recipient_id);

      db.prepare(
        "INSERT INTO messages(lead_id,phone,direction,body,status) VALUES(?,?,'outbound',?,'sent')"
      ).run(lead.id, lead.phone, c.message);

      sent++;
    } catch (e) {
      db.prepare(
        "UPDATE campaign_recipients SET status='failed',error=? WHERE id=?"
      ).run(String(e.message || 'Send failed').slice(0, 250), lead.recipient_id);

      failed++;
    }

    if (i < recipients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, Math.ceil(60000 / cap)));
    }
  }

  const remaining = db.prepare(
    "SELECT COUNT(*) n FROM campaign_recipients WHERE campaign_id=? AND status='queued'"
  ).get(c.id).n;

  const status = remaining > 0
    ? 'Queued'
    : failed > 0
      ? 'Completed with errors'
      : 'Completed';

  db.prepare('UPDATE campaigns SET status=? WHERE id=?').run(status, c.id);

  res.json({ sent, failed, remaining, status });
});

/* TASKS */

app.get('/api/tasks', (_req, res) => {
  res.json(
    db.prepare(
      "SELECT t.*,l.name lead_name FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id ORDER BY CASE priority WHEN 'High' THEN 0 WHEN 'Normal' THEN 1 ELSE 2 END, id DESC"
    ).all()
  );
});

app.post('/api/tasks', (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();

  if (!title) return res.status(400).json({ error: 'Task title is required' });

  const info = db.prepare(
    "INSERT INTO tasks(title,due_date,priority,status,lead_id) VALUES(?,?,?,'Open',?)"
  ).run(title.slice(0, 250), b.due_date || '', b.priority || 'Normal', b.lead_id || null);

  res.status(201).json(
    db.prepare('SELECT * FROM tasks WHERE id=?').get(info.lastInsertRowid)
  );
});

app.patch('/api/tasks/:id', (req, res) => {
  const status = req.body?.status;

  if (!['Open', 'In progress', 'Done'].includes(status)) {
    return res.status(400).json({ error: 'Invalid task status' });
  }

  db.prepare('UPDATE tasks SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});

/* SURVEYS */

app.get('/api/surveys', (_req, res) => {
  res.json(
    db.prepare(
      'SELECT s.*, (SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id=s.id) responses FROM surveys s ORDER BY id DESC'
    ).all()
  );
});

app.post('/api/surveys', (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();

  if (!title) return res.status(400).json({ error: 'Survey title is required' });

  const questions = Array.isArray(b.questions) ? b.questions.slice(0, 50) : [];

  const info = db.prepare(
    'INSERT INTO surveys(title,description,questions) VALUES(?,?,?)'
  ).run(title.slice(0, 250), String(b.description || '').slice(0, 2000), JSON.stringify(questions));

  res.status(201).json({
    ...db.prepare('SELECT * FROM surveys WHERE id=?').get(info.lastInsertRowid),
    publicUrl: `/s/${info.lastInsertRowid}`
  });
});

app.get('/s/:id', (req, res) => {
  const survey = db.prepare(
    'SELECT id,title,description,questions FROM surveys WHERE id=? AND active=1'
  ).get(req.params.id);

  if (!survey) return res.status(404).send('Survey not found');

  const questions = JSON.stringify(JSON.parse(survey.questions || '[]'))
    .replace(/</g, '\\u003c');

  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(survey.title)} | Capital Institute</title>
<style>
body{font:15px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f172a;margin:0;padding:32px 16px;color:#1e293b;min-height:100vh;display:flex;align-items:center;justify-content:center}
.wrapper{width:100%;max-width:660px}
.header{text-align:center;margin-bottom:24px}
.badge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.1);color:#cbd5e1;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase}
.brand-icon{display:inline-grid;place-items:center;width:22px;height:22px;background:#2563eb;color:#fff;border-radius:6px;font-weight:800;font-size:13px}
.card{background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:36px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35)}
h1{font-size:24px;font-weight:800;color:#0f172a;margin:0 0 10px;line-height:1.3}
.desc{color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px}
label{display:block;margin:20px 0 8px;font-size:13px;font-weight:700;color:#334155}
input,textarea{font:inherit;width:100%;padding:13px 14px;border:1px solid #cbd5e1;border-radius:10px;box-sizing:border-box;background:#f8fafc;color:#0f172a;transition:all .15s}
input:focus,textarea:focus{outline:none;border-color:#2563eb;background:#fff;box-shadow:0 0 0 3px rgba(37,99,235,0.15)}
textarea{min-height:90px;resize:vertical}
button{margin-top:28px;background:#2563eb;color:#ffffff;border:0;font-weight:700;font-size:15px;padding:14px;border-radius:10px;cursor:pointer;width:100%;box-shadow:0 4px 12px rgba(37,99,235,0.3);transition:background .15s}
button:hover{background:#1d4ed8}
button:disabled{background:#94a3b8;cursor:not-allowed;box-shadow:none}
.footer{text-align:center;margin-top:20px;color:#94a3b8;font-size:12px}
#msg{margin-top:16px;text-align:center;font-weight:600;font-size:14px}
.success{color:#16a34a}
.err{color:#dc2626}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="badge"><span class="brand-icon">C</span> Capital Institute • Official Portal</div>
  </div>
  <form class="card" id="f">
    <h1>${esc(survey.title)}</h1>
    <p class="desc">${esc(survey.description || '')}</p>
    <label>Student / Respondent Name (optional)</label>
    <input name="respondent" maxlength="120" placeholder="e.g. Aryan Sharma">
    <div id="qs"></div>
    <button type="submit">Submit to Capital Institute</button>
    <p id="msg"></p>
  </form>
  <div class="footer">Capital Institute · Academic Operations & Student Success</div>
</div>
<script>
const qs=${questions};
const box=document.querySelector('#qs');
qs.forEach((q,i)=>{
  const d=document.createElement('div');
  const label=document.createElement('label');
  label.textContent=String(q);
  const area=document.createElement('textarea');
  area.name='q'+i;
  area.maxLength=2000;
  area.required=true;
  d.append(label,area);
  box.appendChild(d);
});
document.querySelector('#f').onsubmit=async e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const answers={};
  qs.forEach((q,i)=>answers[q]=fd.get('q'+i));
  const r=await fetch('/s/${survey.id}',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({respondent:fd.get('respondent'),answers})
  });
  document.querySelector('#msg').textContent=
    r.ok?'Thanks, your response was recorded.':'Could not submit. Please try again.';
  if(r.ok)e.target.querySelector('button').disabled=true;
};
</script>
</body>
</html>`);
});

app.post('/s/:id', (req, res) => {
  const survey = db.prepare(
    'SELECT id,questions FROM surveys WHERE id=? AND active=1'
  ).get(req.params.id);

  if (!survey) return res.status(404).json({ error: 'Survey not found' });

  const questions = JSON.parse(survey.questions || '[]');
  const incoming = req.body?.answers || {};
  const answers = {};

  for (const question of questions) {
    if (typeof incoming[question] === 'string') {
      answers[question] = incoming[question].slice(0, 2000);
    }
  }

  db.prepare(
    'INSERT INTO survey_responses(survey_id,respondent,answers) VALUES(?,?,?)'
  ).run(
    survey.id,
    String(req.body?.respondent || '').slice(0, 120),
    JSON.stringify(answers)
  );

  res.json({ ok: true });
});

app.get('/api/surveys/:id/responses', (req, res) => {
  res.json(
    db.prepare('SELECT * FROM survey_responses WHERE survey_id=? ORDER BY id DESC')
      .all(req.params.id)
      .map(row => {
        let answers = {};
        try {
          answers = JSON.parse(row.answers);
        } catch {}
        return { ...row, answers };
      })
  );
});

/* FOLLOW-UPS */

app.get('/api/followups', (_req, res) => {
  res.json(db.prepare('SELECT * FROM followup_rules ORDER BY id DESC').all());
});

app.post('/api/followups', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const message = String(b.message || '').trim();

  if (!name || !message) {
    return res.status(400).json({ error: 'Rule name and message are required' });
  }

  const info = db.prepare(
    'INSERT INTO followup_rules(name,trigger_status,delay_hours,message,active) VALUES(?,?,?,?,?)'
  ).run(name.slice(0, 200), b.trigger_status || 'New',
    Math.max(1, Math.min(720, Number(b.delay_hours) || 24)),
    message.slice(0, 2000), b.active ? 1 : 0);

  res.status(201).json(
    db.prepare('SELECT * FROM followup_rules WHERE id=?').get(info.lastInsertRowid)
  );
});

app.patch('/api/followups/:id', (req, res) => {
  db.prepare('UPDATE followup_rules SET active=? WHERE id=?')
    .run(req.body?.active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

/* WHATSAPP GATEWAY & BAILEYS */

app.get('/api/whatsapp/status', (_req, res) => {
  res.json(wa.status());
});

app.post('/api/whatsapp/connect', async (_req, res) => {
  try {
    const s = await wa.startWhatsApp();
    res.json(s);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/whatsapp/disconnect', async (_req, res) => {
  try {
    res.json(await wa.disconnectWhatsApp(true));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/whatsapp/reset', async (_req, res) => {
  try {
    res.json(await wa.resetSession());
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/whatsapp/chatbot', (_req, res) => {
  res.json(wa.getChatbotConfig());
});

app.post('/api/whatsapp/chatbot', (req, res) => {
  try {
    res.json(wa.setChatbotConfig(req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/whatsapp/chatbot/test', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || 'Hello, what courses and batch timings do you offer?').trim();
    const reply = await answerForWhatsApp(
      prompt,
      'Test Admin Inquirer',
      db.getSetting('chatbot_prompt', '')
    );
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* BULK MESSENGER */

app.get('/api/bulk/preview', (req, res) => {
  const segment = String(req.query.segment || '').trim();
  const leadStatus = String(req.query.status || '').trim();
  const onlyConsented = req.query.onlyConsented !== 'false';

  let query = "SELECT COUNT(*) n FROM leads WHERE phone != ''";
  const params = [];

  if (segment && segment !== 'All') {
    query += ' AND segment = ?';
    params.push(segment);
  }
  if (leadStatus && leadStatus !== 'All') {
    query += ' AND status = ?';
    params.push(leadStatus);
  }
  if (onlyConsented) {
    query += ' AND consent = 1 AND opted_out = 0';
  }

  const count = db.prepare(query).get(...params).n;
  res.json({ count });
});

app.post('/api/bulk/send', async (req, res) => {
  const waStatus = wa.status();
  if (!waStatus.connected) {
    return res.status(400).json({
      error: 'WhatsApp is offline. Open Settings to connect WhatsApp before sending bulk messages.'
    });
  }

  const b = req.body || {};
  const messageTemplate = String(b.message || '').trim();
  if (!messageTemplate) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  const mode = b.mode || 'segment';
  const onlyConsented = b.onlyConsented !== false;
  const messagesPerMinute = Math.max(1, Math.min(30, Number(b.messagesPerMinute) || 10));
  const delayMs = Math.ceil(60000 / messagesPerMinute);

  let recipients = [];

  if (mode === 'raw') {
    const rawList = String(b.rawNumbers || '')
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean);

    recipients = rawList.map(ph => ({
      id: null,
      name: 'Student',
      phone: ph,
      company: 'Capital Institute',
      segment: 'General Broadcast'
    }));
  } else if (mode === 'selected') {
    const ids = Array.isArray(b.leadIds) ? b.leadIds : [];
    if (!ids.length) {
      return res.status(400).json({ error: 'Please select at least one student.' });
    }
    const placeholders = ids.map(() => '?').join(',');
    let sql = `SELECT * FROM leads WHERE id IN (${placeholders}) AND phone != ''`;
    if (onlyConsented) sql += ' AND consent = 1 AND opted_out = 0';
    recipients = db.prepare(sql).all(...ids);
  } else {
    // Segment / Filter mode
    const segment = String(b.segment || '').trim();
    const leadStatus = String(b.status || '').trim();
    let sql = "SELECT * FROM leads WHERE phone != ''";
    const params = [];

    if (segment && segment !== 'All') {
      sql += ' AND segment = ?';
      params.push(segment);
    }
    if (leadStatus && leadStatus !== 'All') {
      sql += ' AND status = ?';
      params.push(leadStatus);
    }
    if (onlyConsented) {
      sql += ' AND consent = 1 AND opted_out = 0';
    }
    sql += ' ORDER BY id DESC LIMIT 500';
    recipients = db.prepare(sql).all(...params);
  }

  if (!recipients.length) {
    return res.status(400).json({
      error: 'No recipients matched the specified criteria' + (onlyConsented ? ' (with verified consent)' : '') + '.'
    });
  }

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    const personalized = messageTemplate
      .replace(/{name}/gi, r.name || 'Student')
      .replace(/{course}/gi, r.company || 'Coaching Program')
      .replace(/{batch}/gi, r.segment || 'Upcoming Batch')
      .replace(/{segment}/gi, r.segment || 'Upcoming Batch')
      .replace(/{phone}/gi, r.phone || '');

    try {
      await wa.sendMessage(r.phone, personalized);

      db.prepare(
        "INSERT INTO messages(lead_id,phone,direction,body,status) VALUES(?,?,'outbound',?,'bulk_sent')"
      ).run(r.id || null, r.phone, personalized);

      sent++;
    } catch (err) {
      failed++;
      errors.push({ phone: r.phone, error: err.message });
    }

    if (i < recipients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  res.json({
    ok: true,
    total: recipients.length,
    sent,
    failed,
    errors: errors.slice(0, 10)
  });
});


/* AI */

app.post('/api/ai/answer', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();

    if (!prompt) return res.status(400).json({ error: 'Enter a prompt' });

    res.json({
      answer: await answer(
        prompt.slice(0, 5000),
        String(req.body?.context || '').slice(0, 1500)
      )
    });
  } catch (e) {
    console.error('AI request failed:', e.message);
    res.status(502).json({ error: 'AI request failed. Check src/ai.js and your API configuration.' });
  }
});

/* SPREADSHEET PREVIEW */

app.post('/api/import/preview', (req, res) => {
  try {
    const { base64, filename } = req.body || {};

    if (!base64 || !filename) {
      return res.status(400).json({ error: 'Upload file data and filename' });
    }

    if (!/\.(csv|xlsx|xls)$/i.test(filename)) {
      return res.status(400).json({ error: 'Use CSV or Excel (.xlsx/.xls)' });
    }

    const buf = Buffer.from(base64, 'base64');

    if (buf.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'File limit is 5 MB' });
    }

    const workbook = XLSX.read(buf, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) return res.status(400).json({ error: 'Spreadsheet has no worksheets' });

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }).slice(0, 2000);
    res.json({ rows, count: rows.length });
  } catch (e) {
    res.status(400).json({ error: 'Could not read spreadsheet' });
  }
});

/* ERROR HANDLER */

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error. Check the terminal log.' });
});

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Capital Institute dashboard: http://localhost:${port}`);
  console.log('AI mode:', process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY
    ? 'configured (live AI enabled)'
    : 'demo mode');

  if (process.env.ENABLE_WHATSAPP === 'true') {
    console.log('WhatsApp enabled in .env. Initializing Baileys session gateway & QR...');
    wa.startWhatsApp().catch(err => {
      console.log('WhatsApp startup notification:', err.message);
    });
  }
});
