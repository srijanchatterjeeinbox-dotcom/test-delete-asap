const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.join(dir, 'capital.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  source TEXT DEFAULT 'Walk-in',
  status TEXT DEFAULT 'New Inquiry',
  segment TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  consent INTEGER DEFAULT 0,
  opted_out INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  phone TEXT,
  direction TEXT,
  body TEXT,
  status TEXT DEFAULT 'logged',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  segment TEXT DEFAULT '',
  status TEXT DEFAULT 'Draft',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  status TEXT DEFAULT 'queued',
  error TEXT,
  sent_at TEXT,
  UNIQUE(campaign_id, lead_id),
  FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  due_date TEXT,
  priority TEXT DEFAULT 'Normal',
  status TEXT DEFAULT 'Open',
  lead_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  questions TEXT NOT NULL DEFAULT '[]',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL,
  respondent TEXT DEFAULT '',
  answers TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS followup_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_status TEXT DEFAULT 'New Inquiry',
  delay_hours INTEGER DEFAULT 24,
  message TEXT DEFAULT '',
  active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Seed initial coaching institute records if empty
try {
  const leadCount = db.prepare('SELECT COUNT(*) n FROM leads').get().n;
  if (leadCount === 0) {
    const insertLead = db.prepare(`
      INSERT INTO leads (name, phone, email, company, source, status, segment, notes, consent, opted_out)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertLead.run(
      'Aryan Sharma',
      '+91 98112 34567',
      'aryan.sharma@gmail.com',
      'JEE Advanced 2026',
      'Website Inquiry',
      'Qualified',
      'JEE Batch A',
      'Scored 94% in Class 10 Boards. Interested in weekend intensive batch. Father is an engineer.',
      1,
      0
    );

    insertLead.run(
      'Priya Patel',
      '+91 98223 45678',
      'priya.patel@outlook.com',
      'NEET Medical 2025',
      'Walk-in',
      'Demo Scheduled',
      'NEET Dropper Batch',
      'Attended demo physics lecture on optics. Counselor recommended Target 650+ program.',
      1,
      0
    );

    insertLead.run(
      'Rohan Verma',
      '+91 98334 56789',
      'rohan.v@gmail.com',
      'Class 10 Board Foundation',
      'School Seminar',
      'Enrolled',
      'Foundation Batch',
      'Enrolled for Math & Science combo. Fee installment 1 received. Orientation this Saturday.',
      1,
      0
    );

    insertLead.run(
      'Ananya Sen',
      '+91 98445 67890',
      'ananya.sen@gmail.com',
      'CUET General + Commerce',
      'Referral',
      'New Inquiry',
      'CUET 2026',
      'Referred by batch student Ritu. Inquired about weekend mock test series.',
      1,
      0
    );

    insertLead.run(
      'Kabir Mehta',
      '+91 98556 78901',
      'kabir.m@yahoo.com',
      'NDA & Defense Exam Prep',
      'Social Media',
      'Contacted',
      'NDA Batch',
      'Physical fitness clear; requires mathematics booster sessions.',
      0,
      0
    );

    insertLead.run(
      'Sneha Roy',
      '+91 98667 89012',
      'sneha.roy@gmail.com',
      'JEE Main Target 2025',
      'Walk-in',
      'Enrolled',
      'JEE Batch A',
      'Awarded 20% scholarship via Capital Admission Test (CAST).',
      1,
      0
    );

    const insertCampaign = db.prepare(`
      INSERT INTO campaigns (name, message, segment, status)
      VALUES (?, ?, ?, ?)
    `);

    insertCampaign.run(
      'Scholarship Admission Test (CAST 2026) Alert',
      'Dear Student/Parent, Capital Institute\'s Annual Scholarship Admission Test (CAST) is scheduled for this Sunday at 10 AM. Up to 100% tuition waiver for top 50 rankers. Register now: capitalinstitute.in/cast | Capital Institute Admissions',
      '',
      'Completed'
    );

    insertCampaign.run(
      'New NEET 2026 Intensive Batch Commencement',
      'Hello! New weekday intensive batch for NEET Medical 2026 starts this Monday. Limited seats to ensure personalized faculty attention. Reply DEMO for free class pass. Capital Institute',
      'NEET Dropper Batch',
      'Draft'
    );

    const insertTask = db.prepare(`
      INSERT INTO tasks (title, due_date, priority, status, lead_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertTask.run(
      "Call Priya Patel's parents regarding NEET batch schedule & seat confirmation",
      '2026-10-15',
      'High',
      'Open',
      2
    );

    insertTask.run(
      "Dispatch JEE Advanced Mathematics Module 2 to Batch A students",
      '2026-10-16',
      'Normal',
      'Open',
      1
    );

    insertTask.run(
      "Conduct Sunday All-India Mock Test 4 & upload rank analysis",
      '2026-10-18',
      'High',
      'Open',
      null
    );

    insertTask.run(
      "Verify scholarship discount coupon for Sneha Roy",
      '2026-10-14',
      'Normal',
      'Done',
      6
    );

    const insertFollowup = db.prepare(`
      INSERT INTO followup_rules (name, trigger_status, delay_hours, message, active)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertFollowup.run(
      'Post-Inquiry Admission Counseling Call',
      'New Inquiry',
      24,
      'Hi {{name}}, thank you for inquiring at Capital Institute. Our senior academic counselor is available today to discuss your target exam roadmap. Would 4 PM or 6 PM work for a quick call?',
      1
    );

    insertFollowup.run(
      'Post-Demo Class Feedback & Enrollment',
      'Contacted',
      48,
      'Hi {{name}}, how was your demo class experience at Capital Institute? We are offering an early enrollment fee benefit this week. Let us know if you have any questions!',
      1
    );

    insertFollowup.run(
      'Mock Test Series Diagnostic Link',
      'Qualified',
      72,
      'Hi {{name}}, your test series access has been generated. Login to Capital Student Portal with your phone number to attempt your diagnostic exam.',
      0
    );

    const insertSurvey = db.prepare(`
      INSERT INTO surveys (title, description, questions, active)
      VALUES (?, ?, ?, ?)
    `);

    const s1 = insertSurvey.run(
      'Capital Institute - Faculty Teaching & Course Feedback',
      'Your honest feedback helps our educators improve batch delivery and doubt-clearing sessions.',
      JSON.stringify([
        'How clearly did the faculty explain complex concepts in recent lectures?',
        'Are the study materials and daily practice problem (DPP) sheets helpful?',
        'How satisfied are you with the doubt-clearing sessions?',
        'What additional revision topics would you like to request?'
      ]),
      1
    );

    insertSurvey.run(
      'Student Admission & Counseling Questionnaire',
      'Help our academic counselors understand your target career, current syllabus coverage, and learning pace.',
      JSON.stringify([
        'Which competitive exam or board are you aiming for?',
        'Which subject do you find most challenging (Physics, Chemistry, Math, Biology)?',
        'Do you prefer weekday morning batches or weekend intensive batches?',
        'What is your target score or percentile goal?'
      ]),
      1
    );

    const insertResponse = db.prepare(`
      INSERT INTO survey_responses (survey_id, respondent, answers)
      VALUES (?, ?, ?)
    `);

    insertResponse.run(
      s1.lastInsertRowid,
      'Aryan Sharma',
      JSON.stringify({
        'How clearly did the faculty explain complex concepts in recent lectures?': 'Excellent. The physics mechanics derivation was very clear.',
        'Are the study materials and daily practice problem (DPP) sheets helpful?': 'Yes, especially level 2 problems.',
        'How satisfied are you with the doubt-clearing sessions?': 'Very satisfied, faculty stayed after class to resolve questions.',
        'What additional revision topics would you like to request?': 'More numerical problems on Rotational Motion.'
      })
    );

    const insertMsg = db.prepare(`
      INSERT INTO messages (lead_id, phone, direction, body, status)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertMsg.run(
      1,
      '+91 98112 34567',
      'outbound',
      'Welcome to Capital Institute, Aryan! Your counseling session with Prof. Verma is scheduled for tomorrow at 4:30 PM.',
      'sent'
    );

    insertMsg.run(
      2,
      '+91 98223 45678',
      'outbound',
      'Hello Priya, your pass for the NEET Demo Lecture on Optics is confirmed for Wednesday at 11 AM at Capital Institute.',
      'sent'
    );

    insertMsg.run(
      3,
      '+91 98334 56789',
      'outbound',
      'Dear Parent, fee receipt for Rohan Verma (Class 10 Foundation Batch) has been issued. Welcome to Capital Institute!',
      'sent'
    );
  }
} catch (err) {
  console.error('Error seeding Capital Institute data:', err.message);
}

db.getSetting = function(key, defaultValue = '') {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
};

db.setSetting = function(key, value) {
  try {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
    return true;
  } catch (e) {
    console.error('Failed to set setting', key, e);
    return false;
  }
};

module.exports = db;
