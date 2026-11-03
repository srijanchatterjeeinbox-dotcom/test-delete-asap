const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let token = localStorage.getItem('drpandey_token') || localStorage.getItem('dental_token') || '';
let current = 'dashboard';
let activeMessengerTab = 'quick';

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
    dashboard: 'Clinic Overview',
    leads: 'Patient Records CRM',
    campaigns: 'Bulk Messenger & Broadcasts',
    inbox: 'Communication Audit Log',
    followups: 'Follow-up & Recall Rules',
    tasks: 'Clinic Staff Tasks',
    surveys: 'Patient Feedback',
    research: 'Ayurvedic Treatment Planner',
    receptionist: 'AI WhatsApp Receptionist',
    settings: 'Clinic Settings'
  };

  $('#page-title').textContent = labels[view] || 'Overview';
  $('#crumb').textContent = 'CLINIC / ' + (labels[view] || view).toUpperCase();

  const v = $('#view');
  v.innerHTML = '<div class="panel"><div class="empty">Loading Dr. Pandey Healthcare Clinic workspace…</div></div>';

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
    if (view === 'receptionist') {
      renderSimulatorChat();
    }
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
        <h3>Welcome to Dr. Pandey’s Advanced Multi-Speciality Clinic.</h3>
        <p>Ayurvedic Pulse Diagnosis (Nadi Parikshan), Classical Panchkarma, Homeopathy & WhatsApp AI Receptionist.</p>
      </div>
      <div class="date-label">
        ◷ &nbsp; ${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    </div>

    <!-- Clinic Quick Info Banner -->
    <div class="panel" style="background:linear-gradient(135deg, #fbf7ee 0%, #edf8f6 100%);border-color:#bce3de;margin-bottom:20px">
      <div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between">
        <div>
          <span class="pill green" style="margin-bottom:8px">16+ YEARS CLINICAL EXPERTISE</span>
          <h3 style="margin:4px 0 6px;color:#0e4a44;font-size:18px">Dr. A. K. Pandey (BAMS, MD - Ayurveda)</h3>
          <p class="muted" style="margin:0;font-size:13px;max-width:680px">
            Former Senior Physician at <b>Patanjali Ayurveda Centre</b>. Master of Nadi Parikshan (Pulse Diagnosis), Prakriti Analysis, authentic Panchkarma, Uttar Basti for Infertility/PCOS, and constitutional Homeopathy. Over <b>250,000+ Happy Patients</b> and <b>200,000+ Successful Treatments</b>.
          </p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;min-width:260px">
          <div style="font-size:12px;background:#ffffff;padding:8px 12px;border-radius:8px;border:1px solid #cbeae5">
            <b>📍 Clinic 1 (Delta 1):</b> F-615, Delta 1, Greater Noida
          </div>
          <div style="font-size:12px;background:#ffffff;padding:8px 12px;border-radius:8px;border:1px solid #cbeae5">
            <b>📍 Clinic 2 (Omicron 3):</b> D-401, Omicron 3, Greater Noida
          </div>
          <div style="font-size:12px;background:#ffffff;padding:8px 12px;border-radius:8px;border:1px solid #cbeae5">
            <b>📞 Central Helpline / WhatsApp:</b> +91 9990947134
          </div>
        </div>
      </div>
    </div>

    <div class="stats">
      ${stat('TOTAL PATIENTS', d.leads, '◎', d.newLeads + ' new inquiries')}
      ${stat('BROADCAST CAMPAIGNS', d.campaigns, '↗', 'Panchkarma & Nadi health camps')}
      ${stat('MESSAGES LOGGED', d.messages, '▤', 'Inbound & outbound WhatsApp chats')}
      ${stat('FEEDBACK & TASKS', d.responses, '▦', d.tasks + ' pending staff clinical tasks')}
    </div>

    <div class="dashboard-grid">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Recent WhatsApp Communications</h3>
            <p>Latest live inbound inquiries and outbound receptionist replies</p>
          </div>
          <button class="secondary" data-go="inbox">View Full Audit Log ↗</button>
        </div>
        ${recent.length ? table(
          ['DIRECTION', 'PATIENT / NUMBER', 'MESSAGE SNIPPET', 'TIME'],
          recent.map(m => [
            `<span class="pill ${m.direction === 'inbound' ? 'orange' : 'green'}">${m.direction}</span>`,
            `<b>${esc(m.phone || 'Unknown')}</b>`,
            esc((m.body || '').slice(0, 65) + (m.body?.length > 65 ? '…' : '')),
            `<small class="muted">${fmtDate(m.created_at)}</small>`
          ])
        ) : empty('▤', 'No message records yet', 'Incoming WhatsApp inquiries and campaign broadcasts will appear here in real time.')}
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Quick Clinic Actions</h3>
            <p>Direct shortcuts for patient care and receptionist workflows</p>
          </div>
          <span class="stat-icon">⚡</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <button class="secondary" data-action="add-lead" style="text-align:left;padding:14px">
            <b style="display:block;font-size:14px;color:var(--ink)">＋ Add Patient Record</b>
            <span class="muted" style="font-size:11px">Register new walk-in or phone consultation</span>
          </button>
          <button class="secondary" data-go="receptionist" style="text-align:left;padding:14px">
            <b style="display:block;font-size:14px;color:var(--ink)">⌘ AI WhatsApp Receptionist</b>
            <span class="muted" style="font-size:11px">Test triage questions and live patient replies</span>
          </button>
          <button class="secondary" data-go="campaigns" style="text-align:left;padding:14px">
            <b style="display:block;font-size:14px;color:var(--ink)">↗ Health Camp Broadcast</b>
            <span class="muted" style="font-size:11px">Send Nadi Parikshan camp invites via WhatsApp</span>
          </button>
          <button class="secondary" data-go="research" style="text-align:left;padding:14px">
            <b style="display:block;font-size:14px;color:var(--ink)">✳ Ayurvedic Treatment Planner</b>
            <span class="muted" style="font-size:11px">Generate Dosha-based care & Panchkarma plan</span>
          </button>
        </div>

        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <b style="font-size:13px">Specialized Medical Departments</b>
            <span class="subtle" style="font-size:11px">Greater Noida Clinics</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span class="tag-chip" style="cursor:default">Pulse Diagnosis (Nadi Parikshan)</span>
            <span class="tag-chip" style="cursor:default">Authentic Panchkarma</span>
            <span class="tag-chip" style="cursor:default">Uttar Basti (PCOS / Infertility)</span>
            <span class="tag-chip" style="cursor:default">Joint Pain & Arthritis</span>
            <span class="tag-chip" style="cursor:default">Type 2 Diabetes Reversal</span>
            <span class="tag-chip" style="cursor:default">Digestive Disorders & IBS</span>
            <span class="tag-chip" style="cursor:default">Chronic Eczema & Psoriasis</span>
            <span class="tag-chip" style="cursor:default">Homeopathy for Allergic Sneezing</span>
            <span class="tag-chip" style="cursor:default">Migraine & Tension Headaches</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* LEADS / PATIENTS CRM */
async function leads() {
  const d = await api('/leads');
  return shell(
    'Patient Records CRM',
    'Comprehensive patient directory, clinical concerns, preferred clinic branch, and WhatsApp communication consent.',
    `
      <div class="table-panel">
        <div class="table-tools">
          <input id="lead-search" placeholder="Search patients by name, phone, health concern, or branch…" style="max-width:300px">
          <select id="lead-filter-status" style="max-width:170px">
            <option value="">All Patient Stages</option>
            <option>New Inquiry</option>
            <option>Appointment Scheduled</option>
            <option>Consultation Done</option>
            <option>Under Treatment</option>
            <option>Follow-up Due</option>
            <option>Completed</option>
          </select>
          <span style="flex:1"></span>
          <button class="secondary" id="clear-leads" style="color:#b91c1c;border-color:#fca5a5" title="Permanently delete all patient records">🗑 Clear All Records</button>
          <button class="secondary" id="import-leads">⬆ Import Records</button>
          <button class="primary" id="add-lead">＋ Add Patient</button>
        </div>
        ${d.length ? table(
          ['PATIENT NAME', 'PHONE / WHATSAPP', 'HEALTH CONCERN / DEPARTMENT', 'PREFERRED BRANCH / SOURCE', 'STAGE', 'CONSENT', 'ACTIONS'],
          d.map(l => [
            `<b>${esc(l.name)}</b>`,
            l.phone ? `<a href="https://wa.me/${l.phone.replace(/\\D/g, '')}" target="_blank" class="contact-link" title="Open WhatsApp chat">📱 ${esc(l.phone)}</a>` : '—',
            `<span style="font-weight:600;color:#0d5c58">${esc(l.company || 'General Consultation')}</span>`,
            `<small>${esc(l.segment || l.source || 'Delta 1 / Omicron 3')}</small>`,
            `<span class="pill ${l.status === 'Under Treatment' ? 'green' : l.status === 'New Inquiry' ? 'orange' : 'purple'}">${esc(l.status)}</span>`,
            `<span class="pill ${l.consent ? 'green' : 'gray'}">${l.consent ? 'Consented' : 'Pending'}</span>`,
            `<div style="display:flex;gap:6px">
              <button class="secondary edit-btn" data-edit-lead="${l.id}" title="Edit patient details">Edit</button>
              <button class="secondary delete-btn" data-delete-lead="${l.id}" style="color:#dc2626" title="Delete this patient record">Delete</button>
            </div>`
          ])
        ) : empty('◎', 'No patient records found', 'Add new patient inquiries or import an existing clinic patient roster.')}
      </div>
    `
  );
}

function addLead() {
  modal(
    'Register Patient Record',
    `
      <div class="form-grid">
        ${field('Full Name', 'name', 'e.g. Ramesh Chandra', true)}
        ${field('Phone (with country code)', 'phone', '+91 99909 47134')}
        ${field('Email Address', 'email', 'patient@gmail.com', false, 'email')}
        ${field('Health Concern / Department', 'company', 'e.g. Chronic Joint Pain, Nadi Parikshan, IBS, Skin Eczema, Migraine, PCOS', true)}
        ${selectField('Preferred Clinic Branch', 'segment', [
          'Clinic 1: F-615 Delta 1, Greater Noida',
          'Clinic 2: D-401 Omicron 3, Greater Noida',
          'Online Video Consultation'
        ])}
        ${selectField('Inquiry Source', 'source', [
          'Website Inquiry (drpandeyhealthcare.in)',
          'WhatsApp AI Receptionist',
          'Walk-in (Delta 1)',
          'Walk-in (Omicron 3)',
          'Patient Referral',
          'Google Search / Maps',
          'Instagram / Facebook'
        ])}
        ${selectField('Patient Stage', 'status', [
          'New Inquiry',
          'Appointment Scheduled',
          'Consultation Done',
          'Under Treatment',
          'Follow-up Due',
          'Completed'
        ])}
        ${area('Clinical Notes & Chief Symptoms', 'notes', 'Duration of complaints, current medications, pulse diagnosis notes, allergies…', true)}
        <div class="wide">
          <label class="consent"><input type="checkbox" name="consent" checked value="1"> Patient has consented to receiving WhatsApp appointment reminders & health advice</label>
        </div>
      </div>
    `,
    'Save Patient Record',
    async d => {
      d.consent = d.consent ? 1 : 0;
      await api('/leads', { method: 'POST', body: JSON.stringify(d) });
      toast('Patient record saved');
      render('leads');
    }
  );
}

async function editLead(id) {
  const l = await api('/leads/' + id);
  modal(
    'Edit Patient Record: ' + l.name,
    `
      <div class="form-grid">
        ${field('Full Name', 'name', '', true, 'text', l.name)}
        ${field('Phone (with country code)', 'phone', '', false, 'text', l.phone || '')}
        ${field('Email Address', 'email', '', false, 'email', l.email || '')}
        ${field('Health Concern / Department', 'company', '', true, 'text', l.company || '')}
        ${selectField('Preferred Clinic Branch', 'segment', [
          'Clinic 1: F-615 Delta 1, Greater Noida',
          'Clinic 2: D-401 Omicron 3, Greater Noida',
          'Online Video Consultation'
        ], false, l.segment)}
        ${selectField('Inquiry Source', 'source', [
          'Website Inquiry (drpandeyhealthcare.in)',
          'WhatsApp AI Receptionist',
          'Walk-in (Delta 1)',
          'Walk-in (Omicron 3)',
          'Patient Referral',
          'Google Search / Maps',
          'Instagram / Facebook'
        ], false, l.source)}
        ${selectField('Patient Stage', 'status', [
          'New Inquiry',
          'Appointment Scheduled',
          'Consultation Done',
          'Under Treatment',
          'Follow-up Due',
          'Completed'
        ], false, l.status)}
        ${area('Clinical Notes & Symptoms', 'notes', '', true, l.notes || '')}
        <div class="wide">
          <label class="consent"><input type="checkbox" name="consent" ${l.consent ? 'checked' : ''} value="1"> Patient has consented to receiving WhatsApp health updates</label>
        </div>
      </div>
    `,
    'Save Updates',
    async d => {
      d.consent = d.consent ? 1 : 0;
      await api('/leads/' + id, { method: 'PATCH', body: JSON.stringify(d) });
      toast('Patient record updated');
      render('leads');
    }
  );
}

/* CAMPAIGNS & BULK MESSENGER */
async function campaigns() {
  const [d, leadsData, waStatus] = await Promise.all([
    api('/campaigns'),
    api('/leads').catch(() => []),
    api('/whatsapp/status').catch(() => ({ connected: false }))
  ]);

  const uniqueSegments = [...new Set(leadsData.map(l => l.segment || l.company).filter(Boolean))];
  const consentedCount = leadsData.filter(l => l.consent && !l.opted_out).length;

  return `
    <div class="welcome">
      <div>
        <h3>Bulk Messenger & Health Broadcasts</h3>
        <p>Broadcast camp invitations, Panchkarma wellness reminders, and follow-up notices to consented patients via WhatsApp.</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="${activeMessengerTab === 'quick' ? 'primary' : 'secondary'}" id="tab-quick-messenger">⚡ Quick Broadcast</button>
        <button class="${activeMessengerTab === 'campaigns' ? 'primary' : 'secondary'}" id="tab-saved-campaigns">📂 Stored Campaigns (${d.length})</button>
      </div>
    </div>

    ${activeMessengerTab === 'quick' ? `
      <div class="split">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Compose Patient Broadcast</h3>
              <p>Direct broadcast via linked WhatsApp (${waStatus.connected ? '🟢 Connected' : '🔴 Offline'})</p>
            </div>
            <span class="stat-icon">↗</span>
          </div>

          <div style="margin-bottom:14px">
            <label style="font-weight:600">Broadcast Target Group</label>
            <div style="display:flex;gap:12px;margin:8px 0">
              <label class="radio-label"><input type="radio" name="bulk_mode" value="all" checked> All Consented Patients (${consentedCount})</label>
              <label class="radio-label"><input type="radio" name="bulk_mode" value="segment"> Filter by Department / Branch</label>
              <label class="radio-label"><input type="radio" name="bulk_mode" value="numbers"> Direct Numbers</label>
            </div>
          </div>

          <div id="segment-filter-box" style="display:none;margin-bottom:14px">
            <label>Filter by Department or Health Concern</label>
            <select id="bulk-batch-select">
              <option value="">All Departments & Branches</option>
              ${uniqueSegments.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
            </select>
          </div>

          <div id="numbers-filter-box" style="display:none;margin-bottom:14px">
            <label>Paste Phone Numbers (comma or newline separated)</label>
            <textarea id="bulk-raw-numbers" rows="3" placeholder="+91 99909 47134&#10;+91 98112 34567"></textarea>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <label style="font-weight:600">Message Body</label>
              <span class="subtle" style="font-size:11px">Use tags:</span>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:8px">
              <button type="button" class="tag-chip" data-tag="{{name}}">{{name}}</button>
              <button type="button" class="tag-chip" data-tag="{{company}}">{{health_concern}}</button>
              <button type="button" class="tag-chip" data-tag="{{phone}}">{{phone}}</button>
            </div>
            <textarea id="bulk-message-text" rows="6" placeholder="Namaste {{name}}, Dr. Pandey’s Advanced Multi-Speciality Clinic is hosting a Free Ayurvedic Pulse Diagnosis (Nadi Parikshan) Camp this Sunday at our Delta 1 Clinic (F-615, Greater Noida). Reserve your slot: Call/WhatsApp +91 9990947134. 🌿"></textarea>
          </div>

          <div style="display:flex;gap:12px;align-items:center;margin-top:14px">
            <label style="font-size:12px;display:flex;align-items:center;gap:6px">
              <input type="checkbox" id="bulk-consent-chk" checked> Only send to consented patients
            </label>
            <span style="flex:1"></span>
            <select id="bulk-rate-select" style="max-width:140px;font-size:12px">
              <option value="6">6 msg/min (Safe)</option>
              <option value="10" selected>10 msg/min (Standard)</option>
              <option value="15">15 msg/min (Fast)</option>
            </select>
          </div>

          <div style="margin-top:16px">
            <button class="primary full" id="btn-dispatch-bulk">🚀 Dispatch WhatsApp Broadcast</button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Live Message Preview</h3>
              <p>How the patient reads your WhatsApp message</p>
            </div>
            <span class="stat-icon">💬</span>
          </div>

          <div class="wa-preview-card">
            <div class="wa-preview-header">
              <div class="wa-preview-avatar">DP</div>
              <div>
                <b>Dr. Pandey Healthcare Clinic</b>
                <small>Official WhatsApp Desk • Greater Noida</small>
              </div>
            </div>
            <div class="wa-preview-body" id="bulk-live-preview">
              Namaste Rahul ji, Dr. Pandey’s Advanced Multi-Speciality Clinic is hosting a Free Ayurvedic Pulse Diagnosis (Nadi Parikshan) Camp this Sunday at our Delta 1 Clinic (F-615, Greater Noida). Reserve your slot: Call/WhatsApp +91 9990947134. 🌿
            </div>
            <div class="wa-preview-time">10:30 AM ✓✓</div>
          </div>

          <div style="margin-top:20px;padding:12px;background:#fbf7ee;border:1px solid #ebd8b7;border-radius:10px">
            <b style="font-size:12px;color:#7c4f1c">Clinic Communication Notice:</b>
            <p class="muted" style="font-size:11px;margin:4px 0 0">
              Only send broadcast notifications to patients who have visited the clinic or requested updates. Avoid high-frequency unprompted messages.
            </p>
          </div>
        </div>
      </div>
    ` : `
      <div class="table-panel">
        <div class="table-tools">
          <span class="subtle">${d.length} STORED CAMPAIGNS</span>
          <span style="flex:1"></span>
          <button class="primary" id="new-campaign">＋ Create New Campaign Draft</button>
        </div>
        ${d.length ? table(
          ['CAMPAIGN NAME', 'TARGET DEPARTMENT', 'STATUS', 'MESSAGE SNIPPET', 'ACTIONS'],
          d.map(c => [
            `<b>${esc(c.name)}</b>`,
            esc(c.segment || 'All Registered Patients'),
            `<span class="pill ${c.status === 'Completed' ? 'green' : c.status === 'Draft' ? 'gray' : 'orange'}">${c.status}</span>`,
            `<small class="muted">${esc((c.message || '').slice(0, 60))}…</small>`,
            `
              <div style="display:flex;gap:6px">
                <button class="secondary" data-queue="${c.id}">Queue</button>
                <button class="primary" data-send="${c.id}">Send</button>
              </div>
            `
          ])
        ) : empty('↗', 'No stored campaigns', 'Draft seasonal Panchkarma camps, diabetes wellness drives, and health follow-ups.')}
      </div>
    `}
  `;
}

function updateBulkPreview() {
  const ta = $('#bulk-message-text');
  const preview = $('#bulk-live-preview');
  if (ta && preview) {
    let text = ta.value.trim() || 'Your message preview will appear here…';
    text = text.replace(/{{name}}/g, 'Rahul Kumar').replace(/{{company}}/g, 'Joint Pain & Arthritis').replace(/{{phone}}/g, '+91 98112 34567');
    preview.textContent = text;
  }
}

function addCampaign() {
  modal(
    'Draft WhatsApp Health Campaign',
    `
      <div class="form-grid">
        ${field('Campaign Title', 'name', 'e.g. Free Nadi Parikshan Health Camp – Delta 1 Clinic', true)}
        ${field('Target Department / Condition', 'segment', 'e.g. Joint Care & Arthritis (leave blank for all patients)')}
        ${area('Message Content', 'message', 'Namaste {{name}}, Dr. Pandey’s Advanced Multi-Speciality Clinic is hosting a Free Ayurvedic Pulse Diagnosis Camp this Sunday at our Delta 1 Clinic (F-615, Greater Noida). Reserve your slot: Call/WhatsApp +91 9990947134. 🌿', true)}
      </div>
    `,
    'Save Campaign Draft',
    async d => {
      await api('/campaigns', { method: 'POST', body: JSON.stringify(d) });
      toast('Campaign draft saved');
      activeMessengerTab = 'campaigns';
      render('campaigns');
    }
  );
}

/* COMMUNICATION AUDIT LOG */
async function inbox() {
  const d = await api('/messages');
  return shell(
    'Communication Audit Log',
    'Real-time verification log of all inbound inquiries and outbound receptionist messages tracked by Baileys.',
    `
      <div class="table-panel">
        <div class="table-tools">
          <input id="inbox-search" placeholder="Search message history by text or phone…" style="max-width:320px">
          <span style="flex:1"></span>
          <span class="subtle">${d.length} LOGGED MESSAGES</span>
        </div>
        ${d.length ? table(
          ['DIRECTION', 'PHONE / PATIENT', 'MESSAGE BODY', 'STATUS', 'DATE & TIME'],
          d.map(m => [
            `<span class="pill ${m.direction === 'inbound' ? 'orange' : 'green'}">${m.direction}</span>`,
            `<b>${esc(m.phone || 'Unknown')}</b>`,
            `<div style="max-width:480px;white-space:pre-wrap;font-size:12px">${esc(m.body || '')}</div>`,
            `<span class="pill gray">${esc(m.status || 'logged')}</span>`,
            `<small class="muted">${fmtDate(m.created_at)}</small>`
          ])
        ) : empty('▤', 'No communications recorded yet', 'All incoming patient chats and receptionist replies are preserved here for auditing.')}
      </div>
    `
  );
}

/* CLINIC STAFF TASKS */
async function tasks() {
  const d = await api('/tasks');
  return shell(
    'Clinic Staff Tasks',
    'Action items for doctors, therapists, pharmacists, and reception coordinators across Delta 1 and Omicron 3 clinics.',
    `
      <div class="table-panel">
        <div class="table-tools">
          <span class="subtle">${d.length} CLINIC TASKS</span>
          <span style="flex:1"></span>
          <button class="primary" id="new-task">＋ New Task</button>
        </div>
        ${d.length ? table(
          ['TASK DESCRIPTION', 'PRIORITY', 'DUE DATE', 'STATUS', 'ACTION'],
          d.map(t => [
            `<b>${esc(t.title)}</b>`,
            `<span class="pill ${t.priority === 'High' ? 'red' : 'gray'}">${esc(t.priority)}</span>`,
            fmtDate(t.due_date),
            `<span class="pill ${t.status === 'Done' ? 'green' : 'orange'}">${esc(t.status)}</span>`,
            t.status !== 'Done' ? `<button class="secondary" data-done="${t.id}">✓ Complete</button>` : '—'
          ])
        ) : empty('✓', 'No tasks logged', 'Add clinical tasks for patient follow-ups, Panchkarma therapy setups, and medicine inventory.')}
      </div>
    `
  );
}

function addTask() {
  modal(
    'Create Clinic Task',
    `
      <div class="form-grid">
        ${field('Task Title', 'title', 'e.g. Prepare medicated herbal oils for afternoon Janu Basti at Delta 1 branch', true)}
        ${field('Due Date', 'due_date', '', false, 'date')}
        ${selectField('Priority', 'priority', ['Normal', 'High', 'Low'])}
      </div>
    `,
    'Save Task',
    async d => {
      await api('/tasks', { method: 'POST', body: JSON.stringify(d) });
      toast('Task added');
      render('tasks');
    }
  );
}

/* PATIENT FEEDBACK & QUESTIONNAIRES */
async function surveys() {
  const d = await api('/surveys');
  return shell(
    'Patient Feedback & Questionnaires',
    'Public online portals for patient healing testimonials, clinical feedback, and Ayurvedic Prakriti questionnaires.',
    `
      <div class="table-panel">
        <div class="table-tools">
          <span class="subtle">${d.length} ACTIVE FORMS</span>
          <span style="flex:1"></span>
          <button class="primary" id="new-survey">＋ Create New Questionnaire</button>
        </div>
        ${d.length ? table(
          ['FORM TITLE', 'QUESTIONS COUNT', 'RESPONSES', 'STATUS', 'ACTIONS'],
          d.map(s => [
            `<b>${esc(s.title)}</b><br><small class="muted">${esc(s.description || '')}</small>`,
            (s.questions ? JSON.parse(s.questions).length : 0) + ' questions',
            `<b>${s.response_count || 0}</b> submitted`,
            `<span class="pill ${s.active ? 'green' : 'gray'}">${s.active ? 'Active' : 'Closed'}</span>`,
            `
              <div style="display:flex;gap:6px">
                <button class="secondary" data-survey-link="${s.id}">Copy Public Link ↗</button>
                <button class="secondary" data-responses="${s.id}">View Responses</button>
              </div>
            `
          ])
        ) : empty('▦', 'No questionnaires created', 'Create patient feedback or pre-consultation medical intake questionnaires.')}
      </div>
    `
  );
}

function addSurvey() {
  modal(
    'Create Questionnaire',
    `
      <div class="form-grid">
        ${field('Form Title', 'title', 'e.g. Patient Care Experience & Healing Feedback', true)}
        ${area('Description', 'description', 'Helps Dr. A. K. Pandey and clinical staff improve patient outcomes and clinic hospitality…', true)}
        <div class="wide">
          <label>Questions (one question per line)</label>
          <textarea name="questions_raw" rows="5" placeholder="How thoroughly did Dr. Pandey explain your pulse diagnosis?&#10;How would you rate your symptom improvement?&#10;How likely are you to recommend our clinic to family?"></textarea>
        </div>
      </div>
    `,
    'Publish Questionnaire',
    async d => {
      d.questions = JSON.stringify((d.questions_raw || '').split('\n').map(x => x.trim()).filter(Boolean));
      delete d.questions_raw;
      const s = await api('/surveys', { method: 'POST', body: JSON.stringify(d) });
      toast('Form published! Link: ' + location.origin + s.publicUrl);
      render('surveys');
    }
  );
}

/* FOLLOW-UP & RECALL RULES */
async function followups() {
  const d = await api('/followups');
  return shell(
    'Follow-up & Patient Recall Rules',
    'Standard operating message templates and recall schedules for patient healing continuity.',
    `
      <div class="notice">
        Automated background sending is kept as a draft to allow clinic staff to review messages before delivery.
      </div>
      <div class="table-panel">
        <div class="table-tools">
          <span class="subtle">${d.length} RECALL RULES</span>
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
            `<span class="pill ${r.active ? 'green' : 'orange'}">${r.active ? 'Active' : 'Draft'}</span>`,
            `<button class="secondary" data-toggle-rule="${r.id}" data-active="${r.active ? 0 : 1}">${r.active ? 'Disable' : 'Enable'}</button>`
          ])
        ) : empty('◷', 'No recall rules set up', 'Draft standard recall messages to automate patient care check-ins.')}
      </div>
    `
  );
}

function addRule() {
  modal(
    'Create Follow-up Rule',
    `
      <div class="form-grid">
        ${field('Rule Name', 'name', 'e.g. 24h Post-Panchkarma Rest & Diet Check', true)}
        ${selectField('Trigger Stage', 'trigger_status', [
          'New Inquiry',
          'Appointment Scheduled',
          'Consultation Done',
          'Under Treatment',
          'Follow-up Due'
        ])}
        ${field('Delay (hours)', 'delay_hours', '24')}
        ${area('Message Template', 'message', 'Namaste {{name}}, we hope you are recovering well after your session at Dr. Pandey’s Clinic. Please follow the prescribed Pathya-Apathya diet…', true)}
        <p class="wide muted" style="font-size:11px">
          Saves as a staff review template. Automatic background dispatch is disabled.
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

/* AYURVEDIC & CLINICAL TREATMENT PLANNER */
async function research() {
  return shell(
    'Ayurvedic & Clinical Treatment Planner',
    'Design comprehensive holistic care plans, constitutional balancing regimens, and Panchkarma schedules using Clinic AI.',
    `
      <div class="dashboard-grid">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Holistic Care Plan Generator</h3>
              <p>Generate a structured care plan tailored to individual patient constitution and disease pathology.</p>
            </div>
            <span class="stat-icon">✳</span>
          </div>
          <form id="research-form" class="form-grid">
            ${field('Health Concern / Diagnosis', 'course', 'e.g. Osteoarthritis Knee, Irritable Bowel Syndrome, PCOS Infertility, Chronic Migraine, Psoriasis', true)}
            ${field('Primary Symptoms & Triggers', 'subject', 'e.g. Severe morning stiffness, burning sensation, aggravated by cold wind, indigestion')}
            ${selectField('Constitutional Imbalance (Dosha)', 'batch', [
              'Vata Prakopa (Joint, nerve & dryness disorders)',
              'Pitta Prakopa (Inflammation, acidity, skin burning)',
              'Kapha Prakopa (Sluggish metabolism, congestion, obesity)',
              'Vata-Pitta Sannipata',
              'Tridoshic Imbalance'
            ])}
            ${selectField('Prescribed Modalities', 'level', [
              'Ayurvedic Herbs + Nadi-Diet Regimen',
              'Authentic Classical Panchkarma (Basti, Nasya, Shirodhara)',
              'Uttar Basti (Gynecology / Fertility)',
              'Personalized Constitutional Homeopathy',
              'Integrative Ayurveda + Homeopathy'
            ])}
            ${selectField('Clinic Branch', 'hours', [
              'Clinic 1: F-615, Delta 1, Greater Noida',
              'Clinic 2: D-401, Omicron 3, Greater Noida',
              'Online Tele-Consultation Care Plan'
            ])}
            <div class="wide form-actions">
              <button class="primary">Generate Treatment Plan ↗</button>
            </div>
          </form>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Clinical Care Plan Output</h3>
              <p>Review, adapt, and share with Dr. A.K. Pandey or the patient.</p>
            </div>
          </div>
          <div class="ai-output" id="research-output">Your comprehensive Ayurvedic and Homeopathic treatment plan will appear here.</div>
          <button class="secondary" id="copy-brief" style="margin-top:12px">Copy Care Plan</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Dr. Pandey Healthcare Clinic Clinical Standards Checklist</h3>
            <p>Mandatory holistic quality standards prior to initiating chronic therapies or Panchkarma</p>
          </div>
        </div>
        ${[
          'Perform thorough Ayurvedic Pulse Diagnosis (Nadi Parikshan) and record baseline Vata-Pitta-Kapha status',
          'Review available modern diagnostic reports (blood profile, HbA1c, LFT/KFT, ultrasound, X-ray/MRI)',
          'Assess digestive capacity (Agni) and presence of toxic metabolic residue (Ama) before prescribing Rasayanas',
          'Educate patient on customized dietary guidelines (Pathya-Apathya) and food compatibility (Viruddha Ahara)',
          'Explain the step-by-step bio-purification procedure for Panchkarma/Uttar Basti and obtain informed consent',
          'Schedule periodic follow-up consultations to adjust medicine potency as symptom relief progresses'
        ].map(x => `<label class="consent" style="margin:13px 0"><input type="checkbox"> ${x}</label>`).join('')}
      </div>
    `
  );
}

/* AI WHATSAPP RECEPTIONIST WITH OFFICIAL CONTEXT WINDOW (drpandeyhealthcare.com) */
window._simulatorHistory = window._simulatorHistory || [];

function renderSimulatorChat() {
  const container = $('#simulator-chat-pane');
  const countBadge = $('#simulator-context-count');
  if (!container) return;

  const history = window._simulatorHistory || [];
  if (countBadge) {
    countBadge.textContent = `${history.length} turn${history.length === 1 ? '' : 's'} in memory`;
  }

  if (history.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:28px 14px;color:#8a7560">
        <div style="font-size:32px;margin-bottom:8px">💬</div>
        <b style="color:#2b1808;font-size:14px;display:block">WhatsApp AI Receptionist Live Conversation Window</b>
        <p style="font-size:12px;margin:6px 0 10px;line-height:1.5;color:#5a3c1c">
          Ask a patient health question below or click any of the FAQ questions above.<br>
          The receptionist keeps the <b>multi-turn conversational context window</b> in memory and references clinical knowledge directly from 
          <a href="https://drpandeyhealthcare.com/" target="_blank" style="color:#b07d3a;font-weight:700">drpandeyhealthcare.com</a>.
        </p>
        <span class="context-window-badge">⚡ Context Window: Initialized from drpandeyhealthcare.com</span>
      </div>
    `;
    return;
  }

  container.innerHTML = history.map(item => {
    const isBot = item.role === 'model' || item.role === 'assistant';
    return `
      <div class="chat-turn ${isBot ? 'bot' : 'patient'}">
        <div class="chat-sender-label">
          ${isBot ? '<span>🩺 Dr. Pandey Clinic AI Receptionist</span>' : '<span>👤 Inquiring Patient</span>'}
        </div>
        <div class="chat-bubble">
          ${esc(item.text)}
          <div class="chat-timestamp">${esc(item.time || '')}</div>
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

async function receptionist() {
  const cw = await api('/whatsapp/context-window').catch(() => ({
    referenceUrl: 'https://drpandeyhealthcare.com/',
    secondaryUrl: 'https://drpandeyhealthcare.in/',
    title: 'Dr. Pandey Healthcare Clinic Official Clinical Context Window',
    summary: 'Clinical knowledge base and context window referenced from https://drpandeyhealthcare.com/.',
    doctors: [
      { name: 'Dr. Amit Pandey', qualification: 'BHMS, MD', role: 'Senior Homeopathic Physician & Medical Director' },
      { name: 'Dr. A. K. Pandey', qualification: 'BAMS, MD', role: 'Senior Ayurvedic Physician & Nadi Parikshan Specialist' }
    ],
    branches: [
      { name: 'Clinic 1 (Delta 1 Branch)', address: 'F-615, Delta 1, Greater Noida, UP' },
      { name: 'Clinic 2 (Omicron 3 Branch)', address: 'D-401, Omicron 3, Greater Noida, UP' }
    ],
    text: ''
  }));

  return shell(
    'AI WhatsApp Receptionist & Clinical Triage',
    'Intelligent 24/7 patient coordinator for Dr. Pandey’s Clinic with multi-turn conversation memory and clinical context window referenced from https://drpandeyhealthcare.com/.',
    `
      <!-- Official Context Window Reference Card -->
      <div class="context-window-card">
        <div class="context-window-header">
          <div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap">
              <h3 style="color:#5a3c1c;margin:0;font-size:17px;font-family:'Playfair Display', serif">
                Official Clinical Context Window
              </h3>
              <span class="context-window-badge">● Active in Gemini 3.8 Flash & WhatsApp Gateway</span>
            </div>
            <p style="color:#7c4f1c;margin:0;font-size:12px">
              Primary Knowledge Base & Operating Context Reference:
              <a href="${esc(cw.referenceUrl || 'https://drpandeyhealthcare.com/')}" target="_blank" class="context-ref-pill" style="margin-left:6px">
                🌐 ${esc(cw.referenceUrl || 'https://drpandeyhealthcare.com/')} ↗
              </a>
              <span class="muted" style="font-size:11px;margin-left:8px">(Mirror: ${esc(cw.secondaryUrl || 'https://drpandeyhealthcare.in/')})</span>
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="secondary" id="btn-toggle-raw-cw" style="font-size:12px">Inspect Full Context Window 🔍</button>
            <button class="secondary" id="btn-copy-raw-cw" style="font-size:12px">Copy Context Window 📋</button>
          </div>
        </div>

        <div class="context-meta-grid">
          <div class="context-meta-item">
            <b>👨‍⚕️ Doctors & Service Map (DPHC v1.1)</b>
            <p>
              • <b>Dr. A. K. Pandey:</b> MD, FMC (Germany) — Senior Homoeopathic Consultant & Family Physician (15+ yrs exp, Purodha Samman 2025). Advanced Homoeopathy (CKD, CLD, diabetes, arthritis, skin, asthma). <i>(NOT Ayurveda/Nadi Pariksha)</i><br>
              • <b>Dr. Bhanu Priya Mishra:</b> BAMS, MD, CGO (Reg. UP74731) — Gynaecologist, Ayurveda, Nadi Pariksha<br>
              • <b>Dr. Shuddhatam Jain:</b> MBBS, MS — General & Laparoscopic Surgery<br>
              • <b>Dr. Shrey Shrivastava:</b> MBBS, MD — General Physician
            </p>
          </div>
          <div class="context-meta-item">
            <b>📍 Clinic Location & Contact</b>
            <p>
              • <b>Address:</b> Shivam Plaza Market, 3rd Floor, Delta 1, Greater Noida, Uttar Pradesh, India<br>
              • <b>Phone / WhatsApp:</b> 9990947134<br>
              • <b>Website:</b> www.drpandeyhealthcare.com<br>
              • <b>Modes:</b> Clinic visit, telephone, WhatsApp (confirm with clinic)
            </p>
          </div>
          <div class="context-meta-item">
            <b>🔒 Safety & Ethics Rules</b>
            <p>
              Never promise cure • Never stop prescribed allopathic medicines • No diagnosis or prescription • Serious conditions require specialist monitoring • Timings confirmed by clinic staff only.
            </p>
          </div>
        </div>

        <!-- Collapsible Raw Context Window Drawer -->
        <div id="raw-cw-drawer" class="hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;margin-bottom:6px">
            <span style="font-size:11px;font-family:'DM Mono',monospace;color:#dfc69f">DPHC AI KNOWLEDGE BASE (v1.1) PROMPT INJECTION</span>
          </div>
          <pre class="context-raw-drawer" id="raw-cw-content">${esc(cw.text || '')}</pre>
        </div>
      </div>

      <!-- Quick Click Test Questions Library (v1.1) -->
      <div class="panel" style="margin-bottom:20px">
        <div class="panel-head">
          <div>
            <h3>Frequently Asked Patient Questions (DPHC v1.1 FAQ Library)</h3>
            <p>Click any question below to test how the AI responds according to DPHC Knowledge Base v1.1:</p>
          </div>
          <span class="stat-icon">💬</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px" id="quick-questions-box">
          <button type="button" class="tag-chip question-chip" data-q="Who is Dr. A. K. Pandey and what is his speciality?">👨‍⚕️ Who is Dr. A. K. Pandey & his speciality?</button>
          <button type="button" class="tag-chip question-chip" data-q="Does Dr. A. K. Pandey provide Ayurvedic treatment?">🌿 Does he provide Ayurvedic treatment?</button>
          <button type="button" class="tag-chip question-chip" data-q="Who is Dr. Bhanu Priya Mishra and what does she treat?">👩‍⚕️ Who is Dr. Bhanu Priya Mishra?</button>
          <button type="button" class="tag-chip question-chip" data-q="Does Dr. Pandey consult CKD (chronic kidney disease) patients?">🩺 Does he consult CKD patients?</button>
          <button type="button" class="tag-chip question-chip" data-q="Does he consult chronic liver disease (CLD) and fatty liver patients?">🥣 Liver disease & fatty liver consultation?</button>
          <button type="button" class="tag-chip question-chip" data-q="Does he consult diabetes and thyroid patients?">🩸 Diabetes & thyroid consultation?</button>
          <button type="button" class="tag-chip question-chip" data-q="Does he treat skin diseases like eczema, psoriasis and alopecia?">✨ Eczema, psoriasis & alopecia consultation?</button>
          <button type="button" class="tag-chip question-chip" data-q="Which award has Dr. A. K. Pandey received?">🏆 Homoeopathy Purodha Samman 2025 Award?</button>
          <button type="button" class="tag-chip question-chip" data-q="Where is the clinic located?">📍 Clinic Address (Shivam Plaza, Delta 1)?</button>
          <button type="button" class="tag-chip question-chip" data-q="How do I book an appointment?">📅 How do I book an appointment?</button>
          <button type="button" class="tag-chip question-chip" data-q="Who performs general and laparoscopic surgery at DPHC?">🏥 Surgery by Dr. Shuddhatam Jain?</button>
          <button type="button" class="tag-chip question-chip" data-q="Is online consultation available?">📲 Is online consultation available?</button>
        </div>
      </div>

      <!-- Multi-Turn Conversational WhatsApp Receptionist Simulator -->
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Interactive WhatsApp Receptionist Simulator (Multi-Turn Context Window)</h3>
            <p>Test real-time multi-turn conversations. The receptionist remembers earlier turns and references <a href="https://drpandeyhealthcare.com/" target="_blank" style="color:var(--primary);font-weight:600">drpandeyhealthcare.com</a>.</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span class="context-window-badge" id="simulator-context-count">0 turns in memory</span>
            <button class="secondary" id="btn-reset-context" style="font-size:12px">Reset Context Window 🔄</button>
            <button class="secondary" id="btn-copy-chat" style="font-size:12px">Copy Conversation 📋</button>
          </div>
        </div>

        <!-- Chat messages viewport -->
        <div class="simulator-chat-pane" id="simulator-chat-pane"></div>

        <!-- Message input form -->
        <form id="ai-form" class="form-grid">
          <div class="wide">
            <label>Patient WhatsApp Message</label>
            <textarea name="prompt" id="receptionist-prompt" required rows="3" placeholder="e.g. Namaste doctor, I have severe knee joint pain for 2 years and difficulty walking. Do you treat this at Delta 1 clinic?"></textarea>
          </div>
          <div class="wide">
            <label>Patient Clinical Context (optional)</label>
            <input name="context" placeholder="Patient name, preferred branch (Delta 1 / Omicron 3), past lab tests, or previous treatment details…">
          </div>
          <div class="wide form-actions" style="display:flex;justify-content:space-between;align-items:center">
            <span class="muted" style="font-size:12px">Powered by Gemini Cloud with fallback & Context Window from https://drpandeyhealthcare.com/</span>
            <button class="primary" id="btn-submit-ai">Send via Context Window ↗</button>
          </div>
        </form>
      </div>
    `
  );
}

/* CLINIC WORKSPACE SETTINGS */
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
                <div class="qr-step-item"><span class="step-num">1</span> Open WhatsApp on clinic phone (+91 99909 47134)</div>
                <div class="qr-step-item"><span class="step-num">2</span> Tap Settings (iOS) or ⋮ (Android) → Linked Devices</div>
                <div class="qr-step-item"><span class="step-num">3</span> Tap <b>Link a Device</b> and point camera at this QR code</div>
                <div class="qr-step-item"><span class="step-num">4</span> AI Receptionist activates automatically once connected</div>
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
    'Clinic Workspace Settings',
    'Configure the Baileys WhatsApp Gateway, QR code pairing, and AI WhatsApp Receptionist directives.',
    `
      <div class="split">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>WhatsApp Gateway & QR Code</h3>
              <p>Baileys multi-device pairing · Links Dr. Pandey Clinic WhatsApp phone</p>
            </div>
            <span class="stat-icon">📱</span>
          </div>

          <div class="metric-row">
            <div class="metric-chip">
              <b style="color:${s.connected ? '#16a34a' : s.qr ? '#ca8a04' : '#8a7560'}">
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
              AI Receptionist
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
                <h3 style="color:#15803d;margin:0 0 6px">WhatsApp Gateway Active</h3>
                <p style="font-size:13px;color:#166534;margin:0 0 10px">
                  Linked to <b>${esc(s.phone || '+91 9990947134')}</b> (${esc(s.name || 'Dr. Pandey Healthcare Clinic')})
                </p>
                <p class="muted" style="font-size:12px;margin:0">
                  • AI Receptionist is actively answering patient inquiries 24/7.<br>
                  • Bulk Messenger is ready for health camp broadcasts.
                </p>
              </div>
            ` : s.qr ? `
              <div class="qr-container">
                <div class="qr-box">
                  <img class="qr-img" src="${s.qr}" alt="WhatsApp QR Code">
                </div>
                <div class="qr-steps">
                  <div class="qr-step-item"><span class="step-num">1</span> Open WhatsApp on clinic phone</div>
                  <div class="qr-step-item"><span class="step-num">2</span> Tap Settings (iOS) or ⋮ (Android) → Linked Devices</div>
                  <div class="qr-step-item"><span class="step-num">3</span> Tap <b>Link a Device</b> and point camera at this QR code</div>
                  <div class="qr-step-item"><span class="step-num">4</span> Session connects automatically once scanned</div>
                </div>
              </div>
            ` : s.starting ? `
              <div class="qr-container">
                <div class="qr-loading-box">
                  <div class="spinner"></div>
                  <b>Initializing WhatsApp Gateway…</b>
                  <p>Generating pairing QR code (takes 2–3 seconds). Please wait.</p>
                </div>
              </div>
            ` : `
              <div class="qr-container">
                <div class="qr-loading-box" style="padding:24px 16px">
                  <div style="font-size:32px;margin-bottom:8px">🌿</div>
                  <b>WhatsApp Gateway Inactive</b>
                  <p class="muted" style="font-size:12px;max-width:320px;margin:0 auto">
                    Click "Start WhatsApp & Generate QR" below to link Dr. Pandey Clinic WhatsApp phone via Baileys.
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
            <b>Clinic Communication Notice:</b> Use an authorised clinic phone number (+91 9990947134). Always ensure patient confidentiality and informed consent.
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>AI Receptionist Directives & Custom Knowledge</h3>
              <p>Automated 24/7 patient triage and consultation answering powered by Gemini</p>
            </div>
            <span class="stat-icon">🤖</span>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#faf6ef;border:1px solid var(--line);border-radius:10px;margin-bottom:14px">
            <div>
              <b style="display:block;font-size:13px;color:#1c1208">AI WhatsApp Receptionist Auto-Reply</b>
              <small class="muted">Replies to 1-on-1 patient inquiries on WhatsApp</small>
            </div>
            <label class="switch">
              <input type="checkbox" id="toggle-chatbot" ${botConfig.enabled ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>

          <div style="background:#fdfaf5;border:1px solid #dfc69f;border-radius:10px;padding:12px 14px;margin-bottom:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <div>
                <b style="display:block;font-size:12px;color:#7c4f1c">Official Context Window Anchor:</b>
                <span style="font-size:12px;color:#2b1808">Dr. Pandey Healthcare Clinic Knowledge Base</span>
              </div>
              <a href="https://drpandeyhealthcare.com/" target="_blank" class="context-ref-pill" style="font-size:11px">
                🌐 https://drpandeyhealthcare.com/ ↗
              </a>
            </div>
            <p class="muted" style="font-size:11px;margin:8px 0 0;line-height:1.4">
              Context window provides comprehensive knowledge on Nadi Parikshan, Classical Panchkarma, Uttar Basti, Homeopathy, Delta 1 & Omicron 3 branches, and Dr. Amit Pandey & Dr. A.K. Pandey credentials.
            </p>
          </div>

          <p class="muted" style="font-size:12px;line-height:1.6">
            The receptionist uses Dr. Pandey Clinic’s knowledge base (Pulse Diagnosis / Nadi Parikshan, classical Panchkarma, Homeopathy, Delta 1 & Omicron 3 branches, Dr. A.K. Pandey's 16+ yrs background) to guide patients accurately around the clock.
          </p>

          <div style="margin-top:12px">
            <label>Custom Receptionist Directives & Branch Updates</label>
            <textarea id="chatbot-prompt" rows="3" placeholder="Add specific doctor leave schedules, special health camp dates, fee updates, or holiday timings…" style="font-size:12px;margin-top:6px">${esc(botConfig.prompt || '')}</textarea>
            <button class="secondary" id="btn-save-chatbot" style="margin-top:8px">Save Directives</button>
          </div>
        </div>
      </div>

      <div class="split" style="margin-top:16px">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>AI Intelligence Status</h3>
              <p>Server-side API key configuration</p>
            </div>
            <span class="stat-icon">✳</span>
          </div>
          <p class="muted" style="font-size:12px;line-height:1.8">
            Dr. Pandey Clinic AI uses Google Gemini (<code>gemini-3.8-flash</code> / <code>gemini-2.5-flash</code>) when <code>GEMINI_API_KEY</code> is configured, Anthropic when configured, and authentic built-in clinic triage responses otherwise.
          </p>
          <div class="notice">
            Mode: <b>${health.mode}</b> • Target: Dr. Pandey’s Advanced Multi-Speciality Clinic
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div>
              <h3>Patient Confidentiality & Clinical Safety</h3>
              <p>Guidelines for clinic staff handling digital health records</p>
            </div>
            <span class="stat-icon">🔒</span>
          </div>
          ${[
            'Never share individual patient diagnosis or pulse reading records without explicit patient consent.',
            'Keep backups of database files in data/ in a secure encrypted drive.',
            'Confirm that patients opting in for WhatsApp campaigns have expressed consent.',
            'All inbound inquiries and receptionist auto-replies are recorded in the Communication Audit Log.'
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
    $('#wa-sub').textContent = s.connected ? 'Dr. Pandey Clinic Active' : 'Connection inactive';
  } catch {}
}

function logout(call = true) {
  if (call) api('/logout', { method: 'POST' }).catch(() => {});
  token = '';
  localStorage.removeItem('drpandey_token');
  localStorage.removeItem('dental_token');
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
      if (!confirm(`Import ${p.count} patient records from spreadsheet?`)) return;

      const d = await api('/leads/import', { method: 'POST', body: JSON.stringify({ rows: p.rows }) });
      toast(`Imported ${d.imported} patient records`);
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
    localStorage.setItem('drpandey_token', token);
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
    if (b.dataset.deleteLead) {
      if (!confirm('Are you sure you want to delete this patient record?')) return;
      await api(`/leads/${b.dataset.deleteLead}`, { method: 'DELETE' });
      toast('Patient record deleted');
      return render('leads');
    }
    if (b.id === 'clear-leads') {
      if (!confirm('⚠️ Are you sure you want to permanently delete ALL patient records from the CRM? This cannot be undone.')) return;
      await api('/leads/clear-all', { method: 'POST' });
      toast('All patient records have been cleared');
      return render('leads');
    }
    if (b.dataset.action === 'campaign' || b.id === 'new-campaign') return addCampaign();
    if (b.dataset.action === 'survey' || b.id === 'new-survey') return addSurvey();
    if (b.id === 'new-task') return addTask();
    if (b.id === 'new-rule') return addRule();
    if (b.id === 'import-leads') return importLeads();

    // Quick questions chips in AI Receptionist
    if (b.classList.contains('question-chip') && b.dataset.q) {
      const promptTa = $('#receptionist-prompt');
      if (promptTa) {
        promptTa.value = b.dataset.q;
        $('#btn-submit-ai')?.click();
      }
      return;
    }

    if (b.id === 'btn-copy-triage') {
      const triageText = `You can contact Dr. Pandey's Healthcare & Research Centre on call or WhatsApp at 9990947134. Address: Shivam Plaza Market, 3rd Floor, Delta 1, Greater Noida, Uttar Pradesh. Appointment timings will be confirmed by the clinic team.`;
      return copyText(triageText);
    }

    if (b.id === 'btn-reset-context') {
      window._simulatorHistory = [];
      renderSimulatorChat();
      return toast('Conversation context window reset.');
    }

    if (b.id === 'btn-copy-chat') {
      const history = window._simulatorHistory || [];
      if (history.length === 0) return toast('No conversation turns to copy.', true);
      const text = history.map(h => `[${(h.role === 'user' || h.role === 'inbound') ? 'Patient' : 'Receptionist'}]: ${h.text}`).join('\n\n');
      return copyText(text);
    }

    if (b.id === 'btn-toggle-raw-cw') {
      const drawer = $('#raw-cw-drawer');
      if (drawer) {
        const isHidden = drawer.classList.contains('hidden');
        drawer.classList.toggle('hidden');
        b.textContent = isHidden ? 'Hide Full Context Window ▲' : 'Inspect Full Context Window 🔍';
      }
      return;
    }

    if (b.id === 'btn-copy-raw-cw') {
      const text = $('#raw-cw-content')?.textContent || '';
      return copyText(text);
    }

    if (b.id === 'copy-ai') {
      const text = $('#ai-output')?.textContent || '';
      return copyText(text);
    }

    if (b.id === 'copy-brief') {
      const text = $('#research-output')?.textContent || '';
      return copyText(text);
    }

    if (b.dataset.queue) {
      const d = await api(`/campaigns/${b.dataset.queue}/queue`, { method: 'POST', body: '{}' });
      toast(`${d.queued} consented patients queued for broadcast`);
      return render('campaigns');
    }

    if (b.dataset.send) {
      if (!confirm('Send this queued campaign now? Only consented patients will receive it.')) return;
      const rate = Number(prompt('Maximum messages per minute (1–30)', '10')) || 10;
      const d = await api(`/campaigns/${b.dataset.send}/send`, { method: 'POST', body: JSON.stringify({ messagesPerMinute: rate }) });
      toast(`Campaign finished: ${d.sent} sent, ${d.failed} failed`);
      return render('campaigns');
    }

    if (b.dataset.done) {
      await api(`/tasks/${b.dataset.done}`, { method: 'PATCH', body: JSON.stringify({ status: 'Done' }) });
      toast('Task marked as completed');
      return render('tasks');
    }

    if (b.dataset.toggleRule) {
      await api(`/followups/${b.dataset.toggleRule}`, { method: 'PATCH', body: JSON.stringify({ active: b.dataset.active === '1' }) });
      toast('Recall rule updated');
      return render('followups');
    }

    if (b.dataset.surveyLink) {
      await navigator.clipboard.writeText(location.origin + '/s/' + b.dataset.surveyLink);
      toast('Public form link copied to clipboard');
    }

    if (b.dataset.responses) {
      const d = await api(`/surveys/${b.dataset.responses}/responses`);
      modal(
        'Patient Responses',
        `
          <div>
            ${d.length ? d.map(r => `
              <div class="panel" style="margin-bottom:12px">
                <b>${esc(r.respondent || 'Anonymous Patient')}</b>
                <small class="muted" style="display:block;margin-bottom:8px">${fmtDate(r.created_at)}</small>
                <pre style="white-space:pre-wrap;font:12px inherit;background:#faf6ef;padding:12px;border-radius:8px">${esc(JSON.stringify(r.answers, null, 2))}</pre>
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
      const mode = $('input[name="bulk_mode"]:checked')?.value || 'all';
      const msg = ($('#bulk-message-text')?.value || '').trim();
      if (!msg) return toast('Please enter a message to broadcast', true);

      b.disabled = true;
      const originalText = b.textContent;
      b.textContent = '⏳ Dispatching WhatsApp Messages…';

      try {
        const payload = {
          mode,
          segment: $('#bulk-batch-select')?.value,
          rawNumbers: $('#bulk-raw-numbers')?.value,
          message: msg,
          onlyConsented: $('#bulk-consent-chk')?.checked,
          messagesPerMinute: Number($('#bulk-rate-select')?.value) || 10
        };

        const res = await api('/bulk/send', { method: 'POST', body: JSON.stringify(payload) });
        modal(
          'Broadcast Results',
          `
            <div style="text-align:center;padding:12px">
              <div style="font-size:36px;margin-bottom:8px">🌿</div>
              <h3 style="margin:0 0 8px">Broadcast Finished</h3>
              <p style="font-size:14px;color:var(--ink)">
                <b>${res.sent}</b> messages sent successfully.<br>
                ${res.failed ? `<span style="color:#dc2626"><b>${res.failed}</b> failed.</span>` : ''}
              </p>
              ${res.errors?.length ? `
                <div style="text-align:left;max-height:120px;overflow-y:auto;background:#fee2e2;padding:8px;border-radius:6px;font-size:11px;margin-top:10px">
                  ${res.errors.map(err => `<div>• ${esc(err)}</div>`).join('')}
                </div>
              ` : ''}
            </div>
          `,
          'Done',
          async () => {}
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
      b.textContent = 'Starting…';
      try {
        await api('/whatsapp/start', { method: 'POST', body: '{}' });
        toast('Starting WhatsApp Gateway… Please wait for QR code');
        setTimeout(() => render('settings'), 800);
      } catch (e) {
        toast(e.message, true);
        b.disabled = false;
        b.textContent = 'Start WhatsApp & Generate QR';
      }
      return;
    }

    if (b.id === 'wa-disconnect') {
      await api('/whatsapp/disconnect', { method: 'POST', body: '{}' });
      toast('WhatsApp Disconnected');
      return render('settings');
    }

    if (b.id === 'wa-reset') {
      if (!confirm('Reset WhatsApp credentials and generate a fresh QR code?')) return;
      await api('/whatsapp/reset', { method: 'POST', body: '{}' });
      toast('WhatsApp credentials cleared');
      return render('settings');
    }

    if (b.id === 'btn-save-chatbot') {
      const prompt = $('#chatbot-prompt')?.value || '';
      await api('/whatsapp/chatbot', { method: 'POST', body: JSON.stringify({ prompt }) });
      toast('Chatbot directives saved');
      return;
    }
  } catch (err) {
    toast(err.message, true);
  }
};

$('#view').oninput = e => {
  if (e.target.id === 'bulk-message-text') {
    updateBulkPreview();
  }

  if (e.target.name === 'bulk_mode') {
    const val = e.target.value;
    const segBox = $('#segment-filter-box');
    const numBox = $('#numbers-filter-box');
    if (segBox) segBox.style.display = val === 'segment' ? 'block' : 'none';
    if (numBox) numBox.style.display = val === 'numbers' ? 'block' : 'none';
  }

  if (e.target.id === 'lead-search' || e.target.id === 'lead-filter-status') {
    const q = ($('#lead-search')?.value || '').toLowerCase();
    const st = ($('#lead-filter-status')?.value || '').toLowerCase();
    $$('.data-table tbody tr').forEach(tr => {
      const text = tr.textContent.toLowerCase();
      const matchQ = !q || text.includes(q);
      const matchSt = !st || text.includes(st);
      tr.style.display = (matchQ && matchSt) ? '' : 'none';
    });
  }

  if (e.target.id === 'inbox-search') {
    const q = e.target.value.toLowerCase();
    $$('.data-table tbody tr').forEach(tr => {
      tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  }
};

$('#view').onchange = async e => {
  if (e.target.name === 'bulk_mode') {
    const val = e.target.value;
    const segBox = $('#segment-filter-box');
    const numBox = $('#numbers-filter-box');
    if (segBox) segBox.style.display = val === 'segment' ? 'block' : 'none';
    if (numBox) numBox.style.display = val === 'numbers' ? 'block' : 'none';
  }

  if (e.target.id === 'toggle-chatbot') {
    try {
      await api('/whatsapp/chatbot', { method: 'POST', body: JSON.stringify({ enabled: e.target.checked }) });
      toast(`AI Receptionist ${e.target.checked ? 'Enabled' : 'Paused'}`);
    } catch (err) {
      toast(err.message, true);
      e.target.checked = !e.target.checked;
    }
  }
};

$('#view').onsubmit = async e => {
  if (e.target.id === 'ai-form') {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const promptInput = $('#receptionist-prompt');
    const prompt = (promptInput?.value || '').trim();
    if (!prompt) return;

    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = 'Consulting Context Window (drpandeyhealthcare.com)…';

    window._simulatorHistory = window._simulatorHistory || [];

    // Append patient inquiry turn to context window
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    window._simulatorHistory.push({
      role: 'user',
      text: prompt,
      time: nowStr
    });
    renderSimulatorChat();

    // Clear textarea for next message
    if (promptInput) promptInput.value = '';

    try {
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.prompt = prompt;
      data.history = window._simulatorHistory.map(h => ({ role: h.role, text: h.text }));

      const res = await api('/whatsapp/chatbot/test', {
        method: 'POST',
        body: JSON.stringify(data)
      });

      const reply = res.reply || res.answer || 'Dr. Pandey Healthcare Clinic AI Receptionist active.';

      // Append bot response turn to context window
      window._simulatorHistory.push({
        role: 'model',
        text: reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      renderSimulatorChat();
    } catch (err) {
      toast('Simulator Error: ' + err.message, true);
      window._simulatorHistory.push({
        role: 'model',
        text: `⚠️ Response generation note: ${err.message}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      renderSimulatorChat();
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
    return;
  }

  if (e.target.id === 'research-form') {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const out = $('#research-output');
    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = 'Synthesizing Holistic Treatment Plan…';
    out.textContent = 'Analyzing constitutional factors, Dosha imbalance, and Panchkarma protocols…';

    try {
      const data = Object.fromEntries(new FormData(e.target).entries());
      const prompt = `Generate a detailed Ayurvedic and Homeopathic clinical care plan for:
Condition / Health Concern: ${data.course}
Symptoms / Specific Focus: ${data.subject}
Dosha Imbalance: ${data.batch}
Treatment Modalities: ${data.level}
Clinic Location: ${data.hours}

Format the response clearly with:
1. Constitutional & Nadi Assessment summary (Vata/Pitta/Kapha balance & Agni status)
2. Phase 1: Bio-purification / Panchkarma therapy protocol (procedures, duration, instructions)
3. Phase 2: Herbal Formulations & Homeopathic Remedies
4. Pathya-Apathya: Essential Dietary Do's & Don'ts for the patient
5. Post-therapy lifestyle guidelines & follow-up review timeline`;

      const res = await api('/ai/chat', { method: 'POST', body: JSON.stringify({ prompt }) });
      out.textContent = res.reply || 'No treatment plan returned';
    } catch (err) {
      out.textContent = 'Error: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
    return;
  }
};

// Auto-login check on page load
if (token) {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  render('dashboard');
}
