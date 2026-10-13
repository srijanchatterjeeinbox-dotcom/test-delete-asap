const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let token = localStorage.getItem('capital_token') || localStorage.getItem('VERMORA_token') || '';
let current = 'dashboard';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

const fmtDate = s => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString() : '—';

async function api(url, opts = {}) {
  const res = await fetch('/api' + url, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {})
    }
  });

  let data = {};
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    if (res.status === 401 && url !== '/login') logout(false);
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function toast(msg, bad = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3600);
}

function modal(title, body, submitLabel, fn) {
  const old = $('#modal');
  if (old) old.remove();

  const m = document.createElement('div');
  m.id = 'modal';
  m.className = 'modal';
  m.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button class="close" type="button">✕</button>
      </div>
      <form id="modal-form">
        ${body}
        <div class="form-actions">
          <button type="button" class="secondary cancel">Cancel</button>
          <button class="primary">${esc(submitLabel || 'Save')}</button>
        </div>
      </form>
    </div>
  `;

  document.body.append(m);
  m.querySelectorAll('.close, .cancel').forEach(b => b.onclick = () => m.remove());
  m.onclick = e => { if (e.target === m) m.remove(); };

  m.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await fn(data, e.target);
      m.remove();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function field(label, name, placeholder = '', wide = false, type = 'text', value = '') {
  return `
    <div class="${wide ? 'wide' : ''}">
      <label>${esc(label)}</label>
      <input name="${name}" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}">
    </div>
  `;
}

function area(label, name, placeholder = '', wide = true, value = '') {
  return `
    <div class="${wide ? 'wide' : ''}">
      <label>${esc(label)}</label>
      <textarea name="${name}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
    </div>
  `;
}

function selectField(label, name, opts, wide = false, selected = '') {
  return `
    <div class="${wide ? 'wide' : ''}">
      <label>${esc(label)}</label>
      <select name="${name}">
        ${opts.map(x => `<option ${x === selected ? 'selected' : ''}>${esc(x)}</option>`).join('')}
      </select>
    </div>
  `;
}

function shell(title, sub, html, actions = '') {
  return `
    <div class="welcome">
      <div>
        <h3>${esc(title)}</h3>
        <p>${esc(sub)}</p>
      </div>
      ${actions}
    </div>
    ${html}
  `;
}

function empty(icon, title, sub) {
  return `
    <div class="empty">
      <div class="big">${icon}</div>
      <b>${title}</b>
      <p>${sub}</p>
    </div>
  `;
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(r => `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function render(view = current) {
  if (window._waPollInterval && view !== 'settings') {
    clearInterval(window._waPollInterval);
    window._waPollInterval = null;
  }
  current = view;
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));

  const labels = {
    dashboard: 'Institute Overview',
    leads: 'Student Admissions CRM',
    campaigns: 'Bulk Messenger & Broadcasts',
    inbox: 'Communication Audit Log',
    followups: 'Counseling & Follow-ups',
    tasks: 'Faculty & Staff Tasks',
    surveys: 'Feedback & Forms',
    research: 'Academic Planner',
    receptionist: 'AI Academic Counselor',
    settings: 'Institute Settings'
  };

  $('#page-title').textContent = labels[view] || 'Overview';
  $('#crumb').textContent = 'INSTITUTE / ' + (labels[view] || view).toUpperCase();

  const v = $('#view');
  v.innerHTML = '<div class="panel"><div class="empty">Loading Capital Institute workspace…</div></div>';

  try {
    const renderers = {
      dashboard: dashboard,
      leads: leads,
      campaigns: campaigns,
      inbox: inbox,
      followups: followups,
      tasks: tasks,
      surveys: surveys,
      research: research,
      receptionist: receptionist,
      settings: settings
    };

    v.innerHTML = await renderers[view]();
    await updateWA();
  } catch (e) {
    v.innerHTML = `
      <div class="panel">
        <div class="empty">
          ${esc(e.message)}<br><br>
          <button class="secondary" onclick="render('${view}')">Retry</button>
        </div>
      </div>
    `;
  }
}

/* DASHBOARD / OVERVIEW */
async function dashboard() {
  const d = await api('/overview');
  const stat = (label, value, icon, note) => `
    <div class="stat">
      <div class="stat-top">
        <span>${label}</span>
        <span class="stat-icon">${icon}</span>
      </div>
      <strong>${value}</strong>
      <small>${note}</small>
    </div>
  `;

  const messages = await api('/messages');
  const recent = messages.slice(0, 5);

  return `
    <div class="welcome">
      <div>
        <h3>Welcome to Capital Institute.</h3>
        <p>Student admissions, batch broadcasts, and academic operations at a glance.</p>
      </div>
      <div class="date-label">
        ◷ &nbsp; ${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    </div>

    <div class="stats">
      ${stat('TOTAL INQUIRIES', d.leads, '◎', d.newLeads + ' new inquiries')}
      ${stat('BATCH CAMPAIGNS', d.campaigns, '↗', 'Outreach & announcements')}
      ${stat('COMMUNICATION LOG', d.messages, '▤', 'Logged parent & student messages')}
      ${stat('FORM RESPONSES', d.responses, '▦', d.tasks + ' open staff tasks')}
    </div>

    <div class="dashboard-grid">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Recent message activity</h3>
            <p>Latest outbound and inbound communications</p>
          </div>
          <button class="secondary" data-go="inbox">View audit log ↗</button>
        </div>
        ${recent.length ? table(
          ['STUDENT / PARENT', 'MESSAGE', 'DIRECTION', 'DATE'],
          recent.map(m => [
            `<b>${esc(m.lead_name || m.phone || 'Unknown')}</b>`,
            `<span title="${esc(m.body)}">${esc((m.body || '').slice(0, 48))}${(m.body || '').length > 48 ? '…' : ''}</span>`,
            `<span class="pill ${m.direction === 'outbound' ? 'purple' : 'green'}">${esc(m.direction)}</span>`,
            fmtDate(m.created_at)
          ])
        ) : empty('▤', 'No communications logged yet', 'Batch broadcasts and inquiry replies will appear here.')}
      </div>

      <div>
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Quick actions</h3>
              <p>Direct coaching desk actions</p>
            </div>
          </div>
          <div class="quick-grid">
            <button class="quick" data-action="add-lead">
              <span class="qicon">＋</span>
              <span><b>New Inquiry</b><small>Record student lead</small></span>
            </button>
            <button class="quick" data-action="campaign">
              <span class="qicon">↗</span>
              <span><b>Batch Broadcast</b><small>Announce schedule/test</small></span>
            </button>
            <button class="quick" data-action="survey">
              <span class="qicon">▦</span>
              <span><b>Create Form</b><small>Feedback & test portal</small></span>
            </button>
            <button class="quick" data-go="research">
              <span class="qicon">✳</span>
              <span><b>Academic Planner</b><small>Design study roadmap</small></span>
            </button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Institute Gateway Health</h3>
              <p>Integrations and operating mode</p>
            </div>
          </div>
          <div class="metric-row">
            <div class="metric-chip"><b>${d.wa.connected ? 'Connected' : 'Offline'}</b>WhatsApp</div>
            <div class="metric-chip"><b>${d.wa.enabled ? 'Enabled' : 'Disabled'}</b>Gateway status</div>
            <div class="metric-chip"><b>${await api('/health').then(x => x.mode === 'AI configured' ? 'AI Live' : 'Demo')}</b>Assistant mode</div>
          </div>
          <p class="muted" style="font-size:11px;margin:14px 0 0">
            Configure WhatsApp alerts from Settings. Broadcast messages require verified student/parent consent.
          </p>
        </div>
      </div>
    </div>
  `;
}

/* LEADS / STUDENT ADMISSIONS CRM */
async function leads() {
  const data = await api('/leads');
  return shell(
    'Student Admissions & Inquiries CRM',
    'Track student inquiries, target courses, demo attendance, counseling notes, and enrollment.',
    `
      <div class="table-panel">
        <div class="table-tools">
          <input class="search" id="lead-search" placeholder="Search student name, phone, course or batch…">
          <button class="secondary" id="import-leads">⇧ Import Student List (CSV/Excel)</button>
          <button class="primary" id="add-lead">＋ New Student Inquiry</button>
        </div>
        <div id="lead-table">${leadTable(data)}</div>
      </div>
    `
  );
}

function leadTable(data) {
  if (!data.length) {
    return empty('◎', 'No student inquiries yet', 'Add an inquiry manually or import a batch spreadsheet.');
  }

  const rows = data.map(l => {
    const statusClass = 
      l.status === 'Enrolled' || l.status === 'Qualified' ? 'green' :
      l.status === 'Demo Scheduled' || l.status === 'Fee Pending' ? 'orange' : 'purple';

    const consentPill = l.opted_out
      ? `<span class="pill orange">Opted out</span>`
      : l.consent
        ? `<span class="pill green">Verified</span>`
        : `<span class="pill">Pending</span>`;

    return [
      `<b>${esc(l.name)}</b><small>${esc(l.company || 'Course not specified')}</small>`,
      esc(l.phone || '—'),
      esc(l.source || 'Walk-in'),
      `<span class="pill ${statusClass}">${esc(l.status || 'New Inquiry')}</span>`,
      consentPill,
      `<button class="secondary" data-edit-lead="${l.id}">Edit</button>`
    ];
  });

  return table(['STUDENT / TARGET COURSE', 'PHONE', 'SOURCE', 'ADMISSION STATUS', 'WHATSAPP CONSENT', 'ACTIONS'], rows)
    .replace('<table', '<table id="lead-data-table"');
}

function addLead() {
  modal(
    'Record New Student Inquiry',
    `
      <div class="form-grid">
        ${field('Student Full Name', 'name', 'e.g. Aryan Sharma', false, 'text')}
        ${field('Primary Contact Number', 'phone', 'e.g. +91 98123 45678', false, 'text')}
        ${field('Email Address', 'email', 'student@example.com', false, 'email')}
        ${field('Target Course / Grade', 'company', 'e.g. JEE Main 2026 / NEET Dropper / Class 10 Boards')}
        ${selectField('Inquiry Source', 'source', [
          'Walk-in',
          'Website Inquiry',
          'Referral',
          'School Seminar',
          'Social Media',
          'Demo Class',
          'Import',
          'Other'
        ])}
        ${selectField('Admission Status', 'status', [
          'New Inquiry',
          'Contacted',
          'Counseling Done',
          'Demo Scheduled',
          'Enrolled',
          'Fee Pending',
          'Not Interested'
        ])}
        ${field('Batch / Stream', 'segment', 'e.g. JEE Batch A / Morning Intensive')}
        ${area('Counseling Notes & Next Action', 'notes', 'Academic goals, previous score, parent discussion, follow-up date')}
        <div class="wide">
          <label class="consent">
            <input type="checkbox" name="consent" value="1">
            Student/Parent consented to receive Capital Institute batch notices and academic updates via WhatsApp.
          </label>
        </div>
      </div>
    `,
    'Save Student Inquiry',
    async d => {
      d.consent = !!d.consent;
      await api('/leads', { method: 'POST', body: JSON.stringify(d) });
      toast('Student inquiry saved');
      render('leads');
    }
  );
}

async function editLead(id) {
  const leads = await api('/leads');
  const l = leads.find(x => String(x.id) === String(id));
  if (!l) return toast('Student inquiry not found', true);

  modal(
    'Update Student Inquiry — ' + l.name,
    `
      <div class="form-grid">
        ${field('Student Full Name', 'name', '', false, 'text', l.name)}
        ${field('Primary Contact Number', 'phone', '', false, 'text', l.phone)}
        ${field('Email Address', 'email', '', false, 'email', l.email)}
        ${field('Target Course / Grade', 'company', '', false, 'text', l.company)}
        ${selectField('Inquiry Source', 'source', [
          'Walk-in',
          'Website Inquiry',
          'Referral',
          'School Seminar',
          'Social Media',
          'Demo Class',
          'Import',
          'Other'
        ], false, l.source)}
        ${selectField('Admission Status', 'status', [
          'New Inquiry',
          'Contacted',
          'Counseling Done',
          'Demo Scheduled',
          'Enrolled',
          'Fee Pending',
          'Not Interested'
        ], false, l.status)}
        ${field('Batch / Stream', 'segment', '', false, 'text', l.segment)}
        ${area('Counseling Notes', 'notes', '', true, l.notes)}
        <div class="wide">
          <label class="consent">
            <input type="checkbox" name="consent" value="1" ${l.consent ? 'checked' : ''}>
            Student/Parent has verified WhatsApp broadcast consent.
          </label>
        </div>
        <div class="wide">
          <label class="consent">
            <input type="checkbox" name="opted_out" value="1" ${l.opted_out ? 'checked' : ''}>
            Student/Parent requested to opt out of broadcast messages.
          </label>
        </div>
      </div>
    `,
    'Update Details',
    async d => {
      d.consent = !!d.consent;
      d.opted_out = !!d.opted_out;
      await api('/leads/' + id, { method: 'PATCH', body: JSON.stringify(d) });
      toast('Student details updated');
      render('leads');
    }
  );
}

/* BULK MESSENGER & BATCH BROADCASTS */
let activeMessengerTab = 'quick';

async function campaigns() {
  const [data, leads, waStatus] = await Promise.all([
    api('/campaigns').catch(() => []),
    api('/leads').catch(() => []),
    api('/whatsapp/status').catch(() => ({ connected: false }))
  ]);

  const uniqueBatches = [...new Set(leads.map(l => l.segment).filter(Boolean))];
  const uniqueStatuses = [...new Set(leads.map(l => l.status).filter(Boolean))];

  return shell(
    'Bulk Messenger & Batch Broadcasts',
    'High-speed, permission-controlled WhatsApp messaging for batch schedules, exam alerts, and scholarship notifications.',
    `
      ${waStatus.connected ? `
        <div class="notice" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534;margin-bottom:18px">
          🟢 <b>WhatsApp Gateway Online (${esc(waStatus.phone || 'Connected')})</b> · Bulk messages will be dispatched through your connected official device.
        </div>
      ` : `
        <div class="notice" style="background:#fffbeb;border-color:#fef3c7;color:#92400e;margin-bottom:18px">
          ⚠️ <b>WhatsApp Gateway is Offline</b> · Messages cannot be sent until your device is linked. 
          <button class="secondary" style="margin-left:12px;padding:4px 10px;font-size:11px" onclick="render('settings')">Open Settings to Scan QR ↗</button>
        </div>
      `}

      <div class="sub-tabs">
        <button class="sub-tab ${activeMessengerTab === 'quick' ? 'active' : ''}" id="tab-quick-messenger">⚡ Direct Bulk Messenger</button>
        <button class="sub-tab ${activeMessengerTab === 'campaigns' ? 'active' : ''}" id="tab-saved-campaigns">📁 Broadcast Campaigns (${data.length})</button>
      </div>

      ${activeMessengerTab === 'quick' ? `
        <div class="split">
          <div class="panel">
            <div class="panel-head">
              <div>
                <h3>Compose Bulk WhatsApp Outreach</h3>
                <p>Send personalized notices to students by batch or direct numbers</p>
              </div>
              <span class="stat-icon">↗</span>
            </div>

            <div style="margin-bottom:14px">
              <label>Audience Source</label>
              <div style="display:flex;gap:16px;margin-top:6px">
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:normal;cursor:pointer">
                  <input type="radio" name="bulk_mode" value="segment" checked> Select by Batch / CRM Filter
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:normal;cursor:pointer">
                  <input type="radio" name="bulk_mode" value="raw"> Paste Phone Numbers Directly
                </label>
              </div>
            </div>

            <div id="bulk-segment-controls">
              <div class="form-grid" style="margin-bottom:12px">
                <div>
                  <label>Target Batch / Stream</label>
                  <select id="bulk-batch-select">
                    <option value="All">All Registered Batches (${leads.length} students)</option>
                    ${uniqueBatches.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label>Admission Status</label>
                  <select id="bulk-status-select">
                    <option value="All">All Statuses</option>
                    ${uniqueStatuses.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
                  </select>
                </div>
              </div>
            </div>

            <div id="bulk-raw-controls" style="display:none;margin-bottom:12px">
              <label>Paste Phone Numbers (comma or newline separated)</label>
              <textarea id="bulk-raw-numbers" placeholder="+919811234567&#10;+919822345678&#10;9833456789" style="min-height:75px"></textarea>
            </div>

            <div style="margin:12px 0 6px">
              <label>Pre-written Academy Templates</label>
              <select id="bulk-template-select">
                <option value="">-- Choose a template to load --</option>
                <option value="cast">Scholarship Test (CAST) Invitation</option>
                <option value="timing">Batch Timings & Classroom Update</option>
                <option value="mock">Sunday All-India Mock Test Reminder</option>
                <option value="fee">Term Fee Installment Notice</option>
                <option value="doubt">1-on-1 Doubt-Clearing Clinic Notice</option>
              </select>
            </div>

            <div style="margin:10px 0 6px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <label>Message Content</label>
                <small class="muted">Dynamic tags replace automatically per student</small>
              </div>
              <div class="tag-bar">
                <span style="font-size:11px;color:#64748b;margin-right:4px">Insert:</span>
                <button type="button" class="tag-chip" data-tag="{name}">{name}</button>
                <button type="button" class="tag-chip" data-tag="{course}">{course}</button>
                <button type="button" class="tag-chip" data-tag="{batch}">{batch}</button>
                <button type="button" class="tag-chip" data-tag="{phone}">{phone}</button>
              </div>
              <textarea id="bulk-message-text" rows="5" placeholder="Dear {name}, greetings from Capital Institute. We are pleased to announce..." style="margin-top:6px">Dear {name}, greetings from Capital Institute. Reminder that your {course} session for {batch} is scheduled for tomorrow. Please be on time.</textarea>
            </div>

            <div class="form-grid" style="margin-top:14px;align-items:center">
              <div>
                <label>Dispatch Rate Throttling</label>
                <select id="bulk-rate-select">
                  <option value="6">6 messages/min (Safest pace)</option>
                  <option value="10" selected>10 messages/min (Standard recommended)</option>
                  <option value="20">20 messages/min (Faster queue)</option>
                </select>
              </div>
              <div style="padding-top:18px">
                <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;cursor:pointer">
                  <input type="checkbox" id="bulk-consent-chk" checked>
                  Require verified student broadcast consent
                </label>
              </div>
            </div>

            <div class="form-actions" style="margin-top:20px">
              <button class="primary full" id="btn-dispatch-bulk" style="padding:14px;font-size:14px">
                🚀 Dispatch Bulk WhatsApp Messages ↗
              </button>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div>
                <h3>Live Message Preview</h3>
                <p>Simulated recipient view with sample student data</p>
              </div>
              <span class="stat-icon">💬</span>
            </div>

            <div class="wa-preview-wrap">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                <div style="width:34px;height:34px;background:#2563eb;color:#fff;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px">CI</div>
                <div>
                  <b style="font-size:13px;display:block">Capital Institute Official</b>
                  <small style="color:#64748b;font-size:11px">Recipient: Aryan Sharma · +91 98112 34567</small>
                </div>
              </div>
              <div class="wa-preview-bubble">
                <div id="bulk-preview-content">Dear Aryan Sharma, greetings from Capital Institute. Reminder that your JEE Advanced 2026 session for JEE Batch A is scheduled for tomorrow. Please be on time.</div>
                <div class="wa-preview-time">10:30 AM ✓✓</div>
              </div>
            </div>

            <div class="notice" style="margin-top:18px">
              <b>Safe Messaging Standards:</b><br>
              • Keep rate limiting at 6–10 messages per minute to prevent WhatsApp automated spam detection.<br>
              • Include opt-out instructions for marketing outreach.<br>
              • Messages are permanently audited in the Communication Audit Log.
            </div>

            <div class="metric-row" style="margin-top:14px">
              <div class="metric-chip"><b>${leads.length}</b>Total Contacts in CRM</div>
              <div class="metric-chip"><b>${leads.filter(l => l.consent && !l.opted_out).length}</b>Consented Contacts</div>
            </div>
          </div>
        </div>
      ` : `
        <div class="table-panel">
          <div class="table-tools">
            <span class="subtle">${data.length} BATCH BROADCAST CAMPAIGNS</span>
            <span style="flex:1"></span>
            <button class="primary" id="new-campaign">＋ New Broadcast Draft</button>
          </div>
          ${data.length ? table(
            ['BROADCAST TITLE', 'TARGET BATCH / STREAM', 'STATUS', 'RECIPIENTS', 'CREATED', 'ACTIONS'],
            data.map(c => [
              `<b>${esc(c.name)}</b><small>${esc((c.message || '').slice(0, 55))}</small>`,
              esc(c.segment || 'All registered students'),
              `<span class="pill ${c.status === 'Completed' ? 'green' : 'purple'}">${esc(c.status)}</span>`,
              c.recipients,
              fmtDate(c.created_at),
              `<button class="secondary" data-queue="${c.id}">Queue</button> <button class="primary" data-send="${c.id}">Send Queued</button>`
            ])
          ) : empty('↗', 'No batch broadcasts drafted', 'Draft an announcement, queue consented student contacts, and review before sending.')}
        </div>
      `}
    `
  );
}

function addCampaign() {
  modal(
    'Draft Batch Broadcast',
    `
      <div class="form-grid">
        ${field('Broadcast Title', 'name', 'e.g. Scholarship Entrance Test (CAST 2026) Reminder', true)}
        ${field('Target Batch / Stream (optional)', 'segment', 'e.g. JEE Batch A (leave blank for all registered students)', true)}
        ${area('Announcement Message', 'message', 'Draft message with date, timing, venue, and Capital Institute helpline.', true)}
        <p class="wide muted" style="font-size:11px">
          Dispatched only to contacts who have verified consent. Unverified contacts will not receive messages.
        </p>
      </div>
    `,
    'Save Broadcast Draft',
    async d => {
      await api('/campaigns', { method: 'POST', body: JSON.stringify(d) });
      toast('Broadcast draft saved');
      render('campaigns');
    }
  );
}


/* MESSAGE AUDIT LOG */
async function inbox() {
  const d = await api('/messages');
  return shell(
    'Communication Audit Log',
    'Audit trail of messages sent and received across Capital Institute workflows.',
    `
      <div class="table-panel">
        ${d.length ? table(
          ['STUDENT / PARENT', 'PHONE', 'DIRECTION', 'MESSAGE', 'STATUS', 'DATE'],
          d.map(m => [
            `<b>${esc(m.lead_name || 'Unknown')}</b>`,
            esc(m.phone),
            `<span class="pill ${m.direction === 'outbound' ? 'purple' : 'green'}">${esc(m.direction)}</span>`,
            esc((m.body || '').slice(0, 100)),
            esc(m.status),
            fmtDate(m.created_at)
          ])
        ) : empty('▤', 'No message history logged', 'Messages sent via Capital Institute will appear here.')}
      </div>
    `
  );
}

/* TASKS / FACULTY & STAFF ACTIONS */
async function tasks() {
  const d = await api('/tasks');
  const openCount = d.filter(t => t.status !== 'Done').length;

  return shell(
    'Faculty & Staff Tasks',
    'Track counselor follow-ups, test paper preparation, study material dispatch, and fee verification.',
    `
      <div class="table-panel">
        <div class="table-tools">
          <span class="subtle">${openCount} PENDING TASKS</span>
          <span style="flex:1"></span>
          <button class="primary" id="new-task">＋ New Task</button>
        </div>
        ${d.length ? table(
          ['TASK & STUDENT', 'DUE DATE', 'PRIORITY', 'STATUS', 'ACTION'],
          d.map(t => [
            `<b>${esc(t.title)}</b><small>${esc(t.lead_name || 'Institute Operations')}</small>`,
            esc(t.due_date || '—'),
            `<span class="pill ${t.priority === 'High' ? 'orange' : ''}">${esc(t.priority)}</span>`,
            `<span class="pill">${esc(t.status)}</span>`,
            t.status === 'Done' ? '—' : `<button class="secondary" data-done="${t.id}">Mark Done</button>`
          ])
        ) : empty('✓', 'All tasks cleared', 'Add a task after student counseling, faculty meetings, or batch reviews.')}
      </div>
    `
  );
}

function addTask() {
  modal(
    'Add Faculty / Staff Task',
    `
      <div class="form-grid">
        ${field('Task Title', 'title', 'e.g. Call Aryan Sharma parents regarding JEE weekend batch timing', true)}
        ${field('Due Date', 'due_date', '', false, 'date')}
        ${selectField('Priority', 'priority', ['Normal', 'High', 'Low'])}
      </div>
    `,
    'Create Task',
    async d => {
      await api('/tasks', { method: 'POST', body: JSON.stringify(d) });
      toast('Task created');
      render('tasks');
    }
  );
}

/* SURVEYS / FEEDBACK & TEST FORMS */
async function surveys() {
  const d = await api('/surveys');
  return shell(
    'Student Feedback & Test Forms',
    'Create public online registration forms, faculty ratings, and student satisfaction surveys.',
    `
      <div class="table-panel">
        <div class="table-tools">
          <span class="subtle">${d.length} PUBLISHED FORMS</span>
          <span style="flex:1"></span>
          <button class="primary" id="new-survey">＋ Create New Form</button>
        </div>
        ${d.length ? table(
          ['FORM / SURVEY TITLE', 'RESPONSES', 'STATUS', 'CREATED', 'ACTIONS'],
          d.map(s => [
            `<b>${esc(s.title)}</b><small>${esc(s.description)}</small>`,
            s.responses,
            `<span class="pill green">${s.active ? 'Active' : 'Inactive'}</span>`,
            fmtDate(s.created_at),
            `<button class="secondary" data-survey-link="${s.id}">Copy Public Link</button> <button class="secondary" data-responses="${s.id}">View Responses</button>`
          ])
        ) : empty('▦', 'No forms published yet', 'Create a feedback form or admission test registration with custom questions.')}
      </div>
    `
  );
}

function addSurvey() {
  modal(
    'Create Student Form / Survey',
    `
      <div class="form-grid">
        ${field('Form Title', 'title', 'e.g. Physics Batch A - Faculty & Concept Delivery Feedback', true)}
        ${area('Description / Purpose', 'description', 'Tell students and parents why their feedback matters to Capital Institute.', true)}
        ${area('Questions (one per line)', 'questions', 'How clearly did the teacher explain derivations?\nAre the Daily Practice Sheets (DPPs) adequate?\nWhat specific topic requires additional doubt clearing?', true)}
        <p class="wide muted" style="font-size:11px">
          The generated link is public and does not require students to sign in.
        </p>
      </div>
    `,
    'Publish Form',
    async d => {
      d.questions = d.questions.split('\n').map(x => x.trim()).filter(Boolean);
      const s = await api('/surveys', { method: 'POST', body: JSON.stringify(d) });
      toast('Form published! Link: ' + location.origin + s.publicUrl);
      render('surveys');
    }
  );
}

/* FOLLOW-UPS / COUNSELING RULES */
async function followups() {
  const d = await api('/followups');
  return shell(
    'Counseling & Follow-up Rules',
    'Standard operating message templates and follow-up schedules for student admissions.',
    `
      <div class="notice">
        Automated background sending is kept as draft to allow counselors to review messages prior to delivery.
      </div>
      <div class="table-panel">
        <div class="table-tools">
          <span class="subtle">${d.length} COUNSELING RULES</span>
          <span style="flex:1"></span>
          <button class="primary" id="new-rule">＋ New Rule</button>
        </div>
        ${d.length ? table(
          ['RULE NAME', 'TRIGGER STAGE', 'DELAY', 'MESSAGE TEMPLATE', 'STATUS', 'ACTION'],
          d.map(r => [
            `<b>${esc(r.name)}</b>`,
            esc(r.trigger_status),
            r.delay_hours + ' hours',
            esc((r.message || '').slice(0, 50)),
            `<span class="pill ${r.active ? 'green' : 'orange'}">${r.active ? 'Active Template' : 'Draft'}</span>`,
            `<button class="secondary" data-toggle-rule="${r.id}" data-active="${r.active ? 0 : 1}">${r.active ? 'Disable' : 'Enable'}</button>`
          ])
        ) : empty('◷', 'No follow-up templates', 'Draft standard counseling messages to guide your admission team.')}
      </div>
    `
  );
}

function addRule() {
  modal(
    'Create Follow-up Rule',
    `
      <div class="form-grid">
        ${field('Rule Name', 'name', 'e.g. 24h Post-Demo Class Enrollment Check', true)}
        ${selectField('Trigger Stage', 'trigger_status', [
          'New Inquiry',
          'Contacted',
          'Counseling Done',
          'Demo Scheduled',
          'Qualified'
        ])}
        ${field('Delay (hours)', 'delay_hours', '24')}
        ${area('Message Template', 'message', 'Hi {{name}}, how was your demo class at Capital Institute? Our academic counselor is available today...', true)}
        <p class="wide muted" style="font-size:11px">
          Saves as a counselor review template. Automatic background dispatch is disabled.
        </p>
      </div>
    `,
    'Save Rule Draft',
    async d => {
      d.active = false;
      await api('/followups', { method: 'POST', body: JSON.stringify(d) });
      toast('Follow-up rule saved');
      render('followups');
    }
  );
}

/* ACADEMIC & BATCH PLANNER */
async function research() {
  return shell(
    'Academic & Batch Curriculum Planner',
    'Design detailed syllabus completion roadmaps, daily problem practice (DPP) plans, and mock test schedules using Capital AI.',
    `
      <div class="dashboard-grid">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Curriculum & Batch Plan Generator</h3>
              <p>Generate a structured study roadmap tailored for competitive exam batches.</p>
            </div>
            <span class="stat-icon">✳</span>
          </div>
          <form id="research-form" class="form-grid">
            ${field('Target Course / Exam', 'course', 'e.g. JEE Main 2026, NEET Medical, Class 10 CBSE Boards, CUET', true)}
            ${field('Subject / Module Focus', 'subject', 'e.g. Physics - Mechanics & Optics / Chemistry - Organic')}
            ${selectField('Batch Structure', 'batch', [
              'Full Year Intensive',
              'Weekend Fast-Track',
              'Crash Course (60 Days)',
              'Test Series & Revision',
              'Foundation (9th-10th)'
            ])}
            ${selectField('Student Target Level', 'level', [
              'Beginner to Advanced',
              'Repeater / Dropper Batch',
              'Top 100 Rank Booster',
              'Board Exam 95%+ Focus'
            ])}
            ${selectField('Weekly Study Hours', 'hours', [
              '15–20 hours/week',
              '25–30 hours/week',
              '35+ hours/week'
            ])}
            <div class="wide form-actions">
              <button class="primary">Generate Academic Roadmap ↗</button>
            </div>
          </form>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Academic Roadmap Output</h3>
              <p>Review and adapt for faculty and students.</p>
            </div>
          </div>
          <div class="ai-output" id="research-output">Your comprehensive batch study plan will appear here.</div>
          <button class="secondary" id="copy-brief" style="margin-top:12px">Copy Academic Roadmap</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Capital Institute Academic Excellence Checklist</h3>
            <p>Mandatory standards before launching any course or batch</p>
          </div>
        </div>
        ${[
          'Establish milestone dates for completing syllabus 60 days before the target exam',
          'Distribute chapter-wise Daily Practice Problem (DPP) sheets with full solution keys',
          'Conduct bi-weekly full-syllabus mock tests with detailed rank analytics and error logs',
          'Schedule mandatory doubt-clearing clinics after every complex topic',
          'Hold monthly parent-teacher counseling sessions to review attendance and mock test trends',
          'Provide curated formula sheets, mind maps, and past 10 years question sets'
        ].map(x => `<label class="consent" style="margin:13px 0"><input type="checkbox"> ${x}</label>`).join('')}
      </div>
    `
  );
}

/* AI ACADEMIC COUNSELOR */
async function receptionist() {
  return shell(
    'Capital Institute AI Academic Counselor',
    'Draft parent communications, exam practice questions, counseling scripts, and custom study timetables.',
    `
      <div class="split">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Ask Capital Institute AI</h3>
              <p>AI provider is optional; demo mode works automatically without an API key.</p>
            </div>
            <span class="stat-icon">⌘</span>
          </div>
          <form id="ai-form" class="form-grid">
            <div class="wide">
              <label>What do you need help with?</label>
              <textarea name="prompt" required placeholder="e.g. Draft an encouraging message to a parent whose student improved their Physics mock score from 50 to 85."></textarea>
            </div>
            <div class="wide">
              <label>Context (optional)</label>
              <textarea name="context" placeholder="Student name, target batch (JEE/NEET), subject, upcoming test date, or specific student strengths/weaknesses"></textarea>
            </div>
            <div class="wide form-actions">
              <button class="primary">Generate Guidance ↗</button>
            </div>
          </form>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Counselor Output</h3>
              <p>Review factual claims before sharing with parents or students.</p>
            </div>
            <span class="code-label">OUTPUT</span>
          </div>
          <div class="ai-output" id="ai-output">Your generated response will appear here.</div>
          <button class="secondary" id="copy-ai" style="margin-top:12px">Copy Response</button>
        </div>
      </div>
    `
  );
}

/* SETTINGS / WORKSPACE CONFIG */
async function settings() {
  const [s, botConfig, health] = await Promise.all([
    api('/whatsapp/status').catch(() => ({ enabled: false, connected: false })),
    api('/whatsapp/chatbot').catch(() => ({ enabled: true, prompt: '', welcome: '' })),
    api('/health').catch(() => ({ mode: 'demo' }))
  ]);

  if (window._waPollInterval) clearInterval(window._waPollInterval);
  if (!s.connected) {
    window._waPollInterval = setInterval(async () => {
      if (current !== 'settings') {
        clearInterval(window._waPollInterval);
        return;
      }
      try {
        const up = await api('/whatsapp/status');
        const qrh = $('#qr-holder');
        if (up.connected) {
          clearInterval(window._waPollInterval);
          toast('WhatsApp Connected Successfully!');
          return render('settings');
        }
        if (qrh && up.qr && qrh.getAttribute('data-qr') !== up.qr) {
          qrh.setAttribute('data-qr', up.qr);
          qrh.innerHTML = `
            <div class="qr-container">
              <div class="qr-box">
                <img class="qr-img" src="${up.qr}" alt="WhatsApp QR Code">
              </div>
              <div class="qr-steps">
                <div class="qr-step-item"><span class="step-num">1</span> Open WhatsApp on your phone</div>
                <div class="qr-step-item"><span class="step-num">2</span> Tap Settings (iOS) or ⋮ (Android) → Linked Devices</div>
                <div class="qr-step-item"><span class="step-num">3</span> Tap <b>Link a Device</b> and point camera at this QR code</div>
                <div class="qr-step-item"><span class="step-num">4</span> Session connects automatically once scanned</div>
              </div>
            </div>
          `;
          const btn = $('#wa-connect');
          if (btn) btn.textContent = 'Scan QR Code Above';
        }
      } catch (_) {}
    }, 1800);
  }

  return shell(
    'Institute Workspace Settings',
    'Configure the Baileys WhatsApp Gateway, QR code pairing, and AI Academic Chatbot.',
    `
      <div class="split">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>WhatsApp Gateway & QR Code</h3>
              <p>Baileys multi-device pairing · Links your official institute phone</p>
            </div>
            <span class="stat-icon">📱</span>
          </div>

          <div class="metric-row">
            <div class="metric-chip">
              <b style="color:${s.connected ? '#16a34a' : s.qr ? '#ca8a04' : '#64748b'}">
                ${s.connected ? 'Connected' : s.qr ? 'Scan QR Code' : s.starting ? 'Initializing' : 'Offline'}
              </b>
              Session Status
            </div>
            <div class="metric-chip">
              <b>${s.phone || 'Not Linked'}</b>
              Linked Phone
            </div>
            <div class="metric-chip">
              <b>${botConfig.enabled ? 'Active' : 'Paused'}</b>
              Chatbot Auto-Reply
            </div>
          </div>

          ${s.lastError ? `
            <div class="notice" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;margin-top:14px">
              <b>Connection Note:</b> ${esc(s.lastError)}
            </div>
          ` : ''}

          <div id="qr-holder" data-qr="${esc(s.qr || '')}">
            ${s.connected ? `
              <div class="connected-card">
                <div class="connected-icon">✓</div>
                <h3 style="color:#15803d;margin:0 0 6px">WhatsApp Gateway Connected</h3>
                <p style="font-size:13px;color:#166534;margin:0 0 10px">
                  Linked to <b>${esc(s.phone || 'Official Phone')}</b> (${esc(s.name || 'Capital Institute')})
                </p>
                <p class="muted" style="font-size:12px;margin:0">
                  • AI Chatbot is listening for inbound student inquiries.<br>
                  • Bulk Messenger is ready to broadcast batch notices.
                </p>
              </div>
            ` : s.qr ? `
              <div class="qr-container">
                <div class="qr-box">
                  <img class="qr-img" src="${s.qr}" alt="WhatsApp QR Code">
                </div>
                <div class="qr-steps">
                  <div class="qr-step-item"><span class="step-num">1</span> Open WhatsApp on your phone</div>
                  <div class="qr-step-item"><span class="step-num">2</span> Tap Settings (iOS) or ⋮ (Android) → Linked Devices</div>
                  <div class="qr-step-item"><span class="step-num">3</span> Tap <b>Link a Device</b> and point camera at this QR code</div>
                  <div class="qr-step-item"><span class="step-num">4</span> Session connects automatically once scanned</div>
                </div>
              </div>
            ` : s.starting ? `
              <div class="qr-container">
                <div class="qr-loading-box">
                  <div class="spinner"></div>
                  <b>Initializing Baileys Gateway…</b>
                  <p>Generating pairing QR code (takes 2–3 seconds). Please wait.</p>
                </div>
              </div>
            ` : `
              <div class="qr-container">
                <div class="qr-loading-box" style="padding:24px 16px">
                  <div style="font-size:32px;margin-bottom:8px">📱</div>
                  <b>WhatsApp Gateway Inactive</b>
                  <p class="muted" style="font-size:12px;max-width:320px;margin:0 auto">
                    Click "Start WhatsApp & Generate QR" below to link your institute WhatsApp phone via Baileys.
                  </p>
                </div>
              </div>
            `}
          </div>

          <div class="form-actions" style="margin-top:16px">
            ${s.connected ? `
              <button class="secondary" id="wa-disconnect">Disconnect Session</button>
              <button class="secondary" id="wa-reset" title="Purge credentials and pair another phone">Reset & Switch Phone</button>
            ` : `
              <button class="primary" id="wa-connect">${s.starting ? 'Starting…' : 'Start WhatsApp & Generate QR'}</button>
              <button class="secondary" id="wa-reset" title="Purge session files and generate fresh QR">Reset & Fresh QR</button>
            `}
          </div>

          <div class="notice" style="margin-top:16px">
            <b>Institute Communication Policy:</b> Ensure you use an authorized institute WhatsApp account with consent. Avoid sending unsolicited messages or high-frequency spam.
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>WhatsApp AI Chatbot</h3>
              <p>Automated 24/7 student counselor powered by Baileys & Gemini</p>
            </div>
            <span class="stat-icon">🤖</span>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f8fafc;border:1px solid var(--line);border-radius:10px;margin-bottom:14px">
            <div>
              <b style="display:block;font-size:13px;color:#0f172a">WhatsApp AI Chatbot Auto-Reply</b>
              <small class="muted">Replies to 1-on-1 student inquiries on WhatsApp</small>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggle-chatbot" ${botConfig.enabled ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>

          <p class="muted" style="font-size:12px;line-height:1.6">
            The chatbot uses Capital Institute's Knowledge Base (JEE, NEET, Foundation, CAST scholarship, demo passes, batch timings) to answer prospective students and parents accurately.
          </p>

          <div style="margin-top:12px">
            <label>Custom Knowledge Directives & Admissions Notes</label>
            <textarea id="chatbot-prompt" rows="3" placeholder="Add specific fee rules, holiday announcements, or custom helpline notes..." style="font-size:12px;margin-top:6px">${esc(botConfig.prompt || '')}</textarea>
            <button class="secondary" id="btn-save-chatbot" style="margin-top:8px">Save Chatbot Directives</button>
          </div>

          <div style="margin-top:18px;border-top:1px solid var(--line);padding-top:14px">
            <label style="font-weight:700">Chatbot Interactive Simulator</label>
            <p class="muted" style="font-size:11px;margin:2px 0 8px">Test how the AI replies to student WhatsApp messages before live deployment</p>
            <div style="display:flex;gap:8px">
              <input id="bot-test-input" placeholder="e.g. What are the fees and batch timings for NEET?" value="What are the batch timings and CAST scholarship details?">
              <button class="primary" id="btn-test-bot" style="white-space:nowrap">Test Reply ↗</button>
            </div>
            <div id="bot-test-output" class="ai-output" style="margin-top:10px;min-height:60px;font-size:12px">Click 'Test Reply' to simulate a live student chat.</div>
          </div>
        </div>
      </div>

      <div class="split" style="margin-top:16px">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>AI Provider Status</h3>
              <p>Server-side API key configuration for Capital Institute</p>
            </div>
            <span class="stat-icon">✳</span>
          </div>
          <p class="muted" style="font-size:12px;line-height:1.8">
            This dashboard uses Google Gemini <code>gemini-3.5-flash-lite</code> when <code>GEMINI_API_KEY</code> is present, Anthropic API when <code>ANTHROPIC_API_KEY</code> is present, and built-in educational demo responses otherwise.
          </p>
          <div class="notice">
            Edit the local <code>.env</code> file, then restart the server. Current Mode: <b>${health.mode}</b>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Student Data Security & Compliance</h3>
              <p>Guidelines before using live student and parent information</p>
            </div>
            <span class="stat-icon">🔒</span>
          </div>
          ${[
            'Change ADMIN_PASSWORD in .env before exposing this dashboard to an institute local network.',
            'Keep backups of data/capital.db and data/wa-auth in a secure local storage drive.',
            'Verify that students and parents have explicitly consented to receiving WhatsApp broadcast notifications.',
            'All inbound and outbound chatbot conversations are permanently recorded in the Communication Audit Log.'
          ].map(x => `<p class="muted" style="font-size:12px;margin:4px 0">• ${x}</p>`).join('')}
        </div>
      </div>
    `
  );
}


/* UTILITIES & HELPERS */
async function updateWA() {
  try {
    const s = await api('/whatsapp/status');
    $('#wa-dot').classList.toggle('on', s.connected);
    $('#wa-label').textContent = s.connected ? 'WhatsApp Connected' : 'WhatsApp Offline';
    $('#wa-sub').textContent = s.connected ? 'Ready for broadcasts' : 'Connection inactive';
  } catch {}
}

function logout(call = true) {
  if (call) api('/logout', { method: 'POST' }).catch(() => {});
  token = '';
  localStorage.removeItem('capital_token');
  localStorage.removeItem('VERMORA_token');
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Clipboard permission unavailable', true);
  }
}

async function importLeads() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.csv,.xlsx,.xls';
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;

    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      const p = await api('/import/preview', { method: 'POST', body: JSON.stringify({ base64, filename: file.name }) });
      if (!confirm(`Import ${p.count} student inquiries from spreadsheet? (Imported inquiries start with broadcast consent disabled until verified)`)) return;

      const d = await api('/leads/import', { method: 'POST', body: JSON.stringify({ rows: p.rows }) });
      toast(`Imported ${d.imported} student inquiries`);
      render('leads');
    } catch (e) {
      toast(e.message, true);
    }
  };
  inp.click();
}

/* EVENT LISTENERS */
$('#login-form').onsubmit = async e => {
  e.preventDefault();
  $('#login-err').textContent = '';
  try {
    const d = await api('/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
    token = d.token;
    localStorage.setItem('capital_token', token);
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    render('dashboard');
  } catch (err) {
    $('#login-err').textContent = err.message;
  }
};

$('#logout').onclick = () => logout();

$('#nav').onclick = e => {
  const b = e.target.closest('[data-view]');
  if (b) render(b.dataset.view);
};

$('#view').onclick = async e => {
  const b = e.target.closest('button');
  if (!b) return;

  try {
    if (b.dataset.go) return render(b.dataset.go);
    if (b.dataset.action === 'add-lead' || b.id === 'add-lead') return addLead();
    if (b.dataset.editLead) return editLead(b.dataset.editLead);
    if (b.dataset.action === 'campaign' || b.id === 'new-campaign') return addCampaign();
    if (b.dataset.action === 'survey' || b.id === 'new-survey') return addSurvey();
    if (b.id === 'new-task') return addTask();
    if (b.id === 'new-rule') return addRule();
    if (b.id === 'import-leads') return importLeads();

    if (b.dataset.queue) {
      const d = await api(`/campaigns/${b.dataset.queue}/queue`, { method: 'POST', body: '{}' });
      toast(`${d.queued} consented recipients queued for broadcast`);
      return render('campaigns');
    }

    if (b.dataset.send) {
      if (!confirm('Send this queued broadcast now? Only consented students/parents will receive it.')) return;
      const rate = Number(prompt('Maximum messages per minute (1–30)', '6')) || 6;
      const d = await api(`/campaigns/${b.dataset.send}/send`, { method: 'POST', body: JSON.stringify({ messagesPerMinute: rate }) });
      toast(`Broadcast finished: ${d.sent} sent, ${d.failed} failed`);
      return render('campaigns');
    }

    if (b.dataset.done) {
      await api(`/tasks/${b.dataset.done}`, { method: 'PATCH', body: JSON.stringify({ status: 'Done' }) });
      toast('Task marked as completed');
      return render('tasks');
    }

    if (b.dataset.toggleRule) {
      await api(`/followups/${b.dataset.toggleRule}`, { method: 'PATCH', body: JSON.stringify({ active: b.dataset.active === '1' }) });
      toast('Counseling rule updated');
      return render('followups');
    }

    if (b.dataset.surveyLink) {
      await navigator.clipboard.writeText(location.origin + '/s/' + b.dataset.surveyLink);
      toast('Public form link copied to clipboard');
    }

    if (b.dataset.responses) {
      const d = await api(`/surveys/${b.dataset.responses}/responses`);
      modal(
        'Student & Parent Responses',
        `
          <div>
            ${d.length ? d.map(r => `
              <div class="panel" style="margin-bottom:12px">
                <b>${esc(r.respondent || 'Anonymous Student')}</b>
                <small class="muted" style="display:block;margin-bottom:8px">${fmtDate(r.created_at)}</small>
                <pre style="white-space:pre-wrap;font:12px inherit;background:#f8fafc;padding:12px;border-radius:8px">${esc(JSON.stringify(r.answers, null, 2))}</pre>
              </div>
            `).join('') : empty('▦', 'No responses recorded yet', 'Responses submitted through the public link will appear here.')}
          </div>
        `,
        'Close',
        async () => {}
      );
    }

    if (b.id === 'tab-quick-messenger') {
      activeMessengerTab = 'quick';
      return render('campaigns');
    }

    if (b.id === 'tab-saved-campaigns') {
      activeMessengerTab = 'campaigns';
      return render('campaigns');
    }

    if (b.classList.contains('tag-chip') && b.dataset.tag) {
      const ta = $('#bulk-message-text');
      if (ta) {
        const start = ta.selectionStart || ta.value.length;
        const end = ta.selectionEnd || ta.value.length;
        ta.value = ta.value.substring(0, start) + b.dataset.tag + ta.value.substring(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + b.dataset.tag.length;
        updateBulkPreview();
      }
      return;
    }

    if (b.id === 'btn-dispatch-bulk') {
      const mode = $('input[name="bulk_mode"]:checked')?.value || 'segment';
      const msg = ($('#bulk-message-text')?.value || '').trim();
      if (!msg) return toast('Please enter a message to broadcast', true);

      b.disabled = true;
      const originalText = b.textContent;
      b.textContent = '⏳ Dispatching WhatsApp Messages…';

      try {
        const payload = {
          mode,
          segment: $('#bulk-batch-select')?.value,
          status: $('#bulk-status-select')?.value,
          rawNumbers: $('#bulk-raw-numbers')?.value,
          message: msg,
          onlyConsented: $('#bulk-consent-chk')?.checked,
          messagesPerMinute: Number($('#bulk-rate-select')?.value) || 10
        };

        const res = await api('/bulk/send', { method: 'POST', body: JSON.stringify(payload) });
        modal(
          'Bulk Outreach Dispatched',
          `
            <div class="panel" style="margin-bottom:12px">
              <div class="metric-row">
                <div class="metric-chip"><b style="color:#16a34a">${res.sent}</b>Delivered</div>
                <div class="metric-chip"><b style="color:${res.failed ? '#dc2626' : '#64748b'}">${res.failed}</b>Failed</div>
                <div class="metric-chip"><b>${res.total}</b>Total Processed</div>
              </div>
              ${res.errors?.length ? `
                <p style="margin-top:12px;font-size:12px;color:#dc2626"><b>Delivery errors encountered:</b></p>
                <pre style="font:11px inherit;background:#fef2f2;padding:8px;border-radius:6px;max-height:120px;overflow:auto">${esc(res.errors.map(e => e.phone + ': ' + e.error).join('\n'))}</pre>
              ` : '<p style="margin-top:14px;font-size:13px;color:#16a34a">✓ All messages were dispatched cleanly to student contacts.</p>'}
            </div>
          `,
          'View Communication Log',
          async () => render('inbox')
        );
      } catch (err) {
        toast(err.message, true);
      } finally {
        b.disabled = false;
        b.textContent = originalText;
      }
      return;
    }

    if (b.id === 'wa-connect') {
      b.disabled = true;
      b.textContent = 'Starting Gateway…';
      const qrh = $('#qr-holder');
      if (qrh) {
        qrh.innerHTML = `
          <div class="qr-container">
            <div class="qr-loading-box">
              <div class="spinner"></div>
              <b>Starting Baileys & Generating QR Code…</b>
              <p>Please wait a moment while WhatsApp initializes.</p>
            </div>
          </div>
        `;
      }
      const d = await api('/whatsapp/connect', { method: 'POST', body: '{}' });
      toast(d.connected ? 'WhatsApp connected' : 'Connecting to WhatsApp; QR will appear shortly');
      return render('settings');
    }

    if (b.id === 'wa-disconnect') {
      b.disabled = true;
      await api('/whatsapp/disconnect', { method: 'POST', body: '{}' });
      toast('WhatsApp session disconnected');
      return render('settings');
    }

    if (b.id === 'wa-reset') {
      b.disabled = true;
      const qrh = $('#qr-holder');
      if (qrh) {
        qrh.innerHTML = `
          <div class="qr-container">
            <div class="qr-loading-box">
              <div class="spinner"></div>
              <b>Resetting Session & Generating Fresh QR…</b>
            </div>
          </div>
        `;
      }
      await api('/whatsapp/reset', { method: 'POST', body: '{}' });
      toast('Session reset; generating fresh QR code');
      return render('settings');
    }

    if (b.id === 'btn-save-chatbot') {
      const promptVal = $('#chatbot-prompt')?.value || '';
      await api('/whatsapp/chatbot', { method: 'POST', body: JSON.stringify({ prompt: promptVal }) });
      toast('Chatbot directives saved');
      return;
    }

    if (b.id === 'btn-test-bot') {
      const testPrompt = ($('#bot-test-input')?.value || '').trim();
      if (!testPrompt) return toast('Please enter a question to test', true);
      const out = $('#bot-test-output');
      if (out) out.textContent = 'Thinking as AI Counselor…';
      try {
        const res = await api('/whatsapp/chatbot/test', { method: 'POST', body: JSON.stringify({ prompt: testPrompt }) });
        if (out) out.textContent = res.reply || 'No response returned';
      } catch (err) {
        if (out) out.textContent = 'Error: ' + err.message;
      }
      return;
    }

    if (b.id === 'copy-ai') return copyText($('#ai-output').textContent);
    if (b.id === 'copy-brief') return copyText($('#research-output').textContent);
  } catch (err) {
    toast(err.message, true);
  }
};

function updateBulkPreview() {
  const txt = $('#bulk-message-text')?.value || '';
  const sample = txt
    .replace(/{name}/gi, 'Aryan Sharma')
    .replace(/{course}/gi, 'JEE Advanced 2026')
    .replace(/{batch}/gi, 'JEE Batch A')
    .replace(/{segment}/gi, 'JEE Batch A')
    .replace(/{phone}/gi, '+91 98112 34567');
  if ($('#bulk-preview-content')) {
    $('#bulk-preview-content').textContent = sample || '(Message text is empty)';
  }
}

$('#view').onchange = async e => {
  if (e.target.id === 'toggle-chatbot') {
    const isChecked = e.target.checked;
    await api('/whatsapp/chatbot', { method: 'POST', body: JSON.stringify({ enabled: isChecked }) });
    toast(isChecked ? 'WhatsApp AI Chatbot Enabled' : 'WhatsApp AI Chatbot Paused');
  }

  if (e.target.name === 'bulk_mode') {
    const isRaw = e.target.value === 'raw';
    if ($('#bulk-raw-controls')) $('#bulk-raw-controls').style.display = isRaw ? '' : 'none';
    if ($('#bulk-segment-controls')) $('#bulk-segment-controls').style.display = isRaw ? 'none' : '';
  }

  if (e.target.id === 'bulk-template-select') {
    const templates = {
      cast: 'Dear {name}, Capital Institute is organizing the CAST (Capital Admission & Scholarship Test) this Sunday for {course}. Win up to 90% tuition fee scholarship. Register free today: call +91 98112 34567.',
      timing: "Greetings {name}! Please note that classes for {batch} will commence tomorrow as per regular schedule. Don't forget to bring your DPP booklet. For queries: Capital Institute Helpline.",
      mock: 'Dear {name}, your All-India Mock Test Series exam for {course} is scheduled for this Sunday from 9:00 AM to 12:00 PM at Capital Institute Main Campus. Please arrive 15 minutes early.',
      fee: 'Dear Parent of {name}, this is a gentle reminder regarding the upcoming term fee installment for {course}. For payment assistance, please contact the Capital Institute Accounts Desk.',
      doubt: "Hello {name}, reminder that tomorrow's personal 1-on-1 Doubt Clearing Clinic for {batch} is open from 4:30 PM to 6:00 PM. Reserve your topic with mentor faculty."
    };
    const val = e.target.value;
    if (templates[val] && $('#bulk-message-text')) {
      $('#bulk-message-text').value = templates[val];
      updateBulkPreview();
    }
  }
};

$('#view').oninput = e => {
  if (e.target.id === 'bulk-message-text') {
    updateBulkPreview();
  }
  if (e.target.id === 'lead-search') {
    const q = e.target.value.toLowerCase();
    $$('#lead-data-table tbody tr').forEach(r => {
      r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }
};

$('#view').onsubmit = async e => {
  if (e.target.id === 'ai-form') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    $('#ai-output').textContent = 'Thinking…';
    try {
      const res = await api('/ai/answer', { method: 'POST', body: JSON.stringify(d) });
      $('#ai-output').textContent = res.answer;
    } catch (err) {
      $('#ai-output').textContent = err.message;
    }
  }

  if (e.target.id === 'research-form') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    $('#research-output').textContent = 'Generating comprehensive academic roadmap…';
    try {
      const prompt = `Create a comprehensive, professional academic curriculum and coaching study roadmap for Capital Institute:
- Target Course / Exam: ${d.course}
- Subject / Module: ${d.subject}
- Batch Structure: ${d.batch}
- Student Target Level: ${d.level}
- Weekly Study Hours: ${d.hours}

Please include:
1. Core Academic Objectives & Milestones
2. Phased Syllabus Breakdown with Week-by-Week Milestones
3. Daily Practice Problem (DPP) Guidelines & Homework Expectations
4. Bi-Weekly Assessment & Mock Test Strategy
5. Student Mentorship & Doubt Clearing Framework
6. 5 Key Conceptual Benchmark Questions`;

      const res = await api('/ai/answer', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          context: 'Format with clear markdown headings, bullet points, and actionable timelines for students and faculty.'
        })
      });
      $('#research-output').textContent = res.answer;
    } catch (err) {
      $('#research-output').textContent = err.message;
    }
  }
};

// Auto-login on load if token exists
(async () => {
  if (token) {
    try {
      await api('/overview');
      $('#login').classList.add('hidden');
      $('#app').classList.remove('hidden');
      render('dashboard');
    } catch {
      logout(false);
    }
  }
})();
