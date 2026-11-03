const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });

// Dr. Pandey Healthcare Clinic primary SQLite database
const db = new Database(path.join(dir, 'drpandey.db'));
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

// Seed initial records for Dr. Pandey Healthcare Clinic on initial setup
try {
  const initialized = db.prepare("SELECT value FROM settings WHERE key = 'db_initialized'").get();
  if (!initialized) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('db_initialized', '1')").run();
    const leadCount = db.prepare('SELECT COUNT(*) n FROM leads').get().n;
    if (leadCount === 0) {
    const insertLead = db.prepare(`
      INSERT INTO leads (name, phone, email, company, source, status, segment, notes, consent, opted_out)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertLead.run(
      'Rahul Kumar',
      '+91 98112 34567',
      'rahul.kumar@gmail.com',
      'Allergic Rhinitis & Frequent Sneezing',
      'Website Inquiry',
      'Under Treatment',
      'Homeopathy Patients',
      'Severe all-day sneezing & chronic allergic rhinitis. Dr. Pandey prescribed targeted homeopathic drops. Marked improvement within 48h; sneezing stopped. On maintenance dose.',
      1,
      0
    );

    insertLead.run(
      'Abhijeet Anand',
      '+91 98223 45678',
      'abhijeet.anand@outlook.com',
      'Chronic Joint Pain & Arthritis',
      'Referral',
      'Appointment Scheduled',
      'Joint Care & Arthritis',
      'Bilateral knee osteoarthritis. Seeking authentic non-surgical Ayurvedic treatment and Janu Basti. Scheduled for Nadi Parikshan at Delta 1 clinic on Friday 11:30 AM.',
      1,
      0
    );

    insertLead.run(
      'Priya Sharma',
      '+91 98334 56789',
      'priya.sharma@gmail.com',
      'PCOS & Infertility (Uttar Basti)',
      'Instagram',
      'Consultation Done',
      'Gynecology & Fertility',
      'Diagnosed with PCOS and irregular cycles for 3 years. Consulted Dr. Pandey for authentic Uttar Basti therapy. Treatment roadmap explained; scheduled for cycle-day 6 session at Omicron 3 branch.',
      1,
      0
    );

    insertLead.run(
      'Dileep Kushwah',
      '+91 98445 67890',
      'dileep.k@gmail.com',
      'Chronic Gastro & IBS Disorder',
      'Walk-in',
      'In Treatment',
      'Gastro & Digestive Health',
      'Recurrent hyperacidity, bloating, and irregular bowel habits for 18 months. Placed on customized Ayurvedic herbs, Nadi-based diet chart, and Takra Dhara. Patient reports 70% relief.',
      1,
      0
    );

    insertLead.run(
      'Rajendra Prasad',
      '+91 98556 78901',
      'rajendra.p@yahoo.com',
      'Type 2 Diabetes Reversal Regimen',
      'Google Search',
      'Consultation Done',
      'Diabetes & Metabolic Health',
      'HbA1c 8.2%. Interested in herbal Ayurvedic blood sugar regulation and lifestyle modification. Completed initial constitution assessment with Dr. Pandey at Delta 1 branch.',
      1,
      0
    );

    insertLead.run(
      'Maya Yadav',
      '+91 98667 89012',
      'maya.yadav@gmail.com',
      'Chronic Migraine & Tension Headaches',
      'Walk-in',
      'Under Treatment',
      'Neurological & Headaches',
      'Unilateral throbbing headaches with photophobia for 4 years. Homeopathic regimen + Shirodhara therapy initiated. Headache frequency reduced from 4 times/week to once a fortnight.',
      1,
      0
    );

    insertLead.run(
      'Prasanna Bera',
      '+91 98778 90123',
      'prasanna.bera@gmail.com',
      'Chronic Eczema & Skin Allergy',
      'Referral',
      'New Inquiry',
      'Dermatology & Skin Care',
      'Dry, itchy erythematous patches on both forearms and legs. Steroid creams caused recurrence. Reached out for natural side-effect-free homeopathic cure.',
      1,
      0
    );

    insertLead.run(
      'Shiv Shant Kumar',
      '+91 98889 01234',
      'shiv.shant@gmail.com',
      'Nadi Parikshan & Authentic Panchkarma Detox',
      'Website Inquiry',
      'New Inquiry',
      'Panchkarma Wellness',
      'Working professional in Knowledge Park II seeking pulse diagnosis, full bio-purification detox (Virechana & Nasya), and stress management at Omicron 3 branch.',
      1,
      0
    );

    const insertCampaign = db.prepare(`
      INSERT INTO campaigns (name, message, segment, status)
      VALUES (?, ?, ?, ?)
    `);

    insertCampaign.run(
      'Free Ayurvedic Nadi Parikshan & Health Camp – Greater Noida',
      'Namaste! Dr. Pandey’s Advanced Multi-Speciality Clinic invites you to a FREE Ayurvedic Nadi Parikshan (Pulse Diagnosis) Camp this Sunday (10 AM – 2 PM) at our Delta 1 Clinic (F-615, Greater Noida). Get authentic Prakriti analysis, chronic disease consultation, and personalized dietary guidance with Dr. A.K. Pandey (16+ yrs exp, Ex-Patanjali). Book your free slot: Call/WhatsApp +91 9990947134 | https://drpandeyhealthcare.in',
      '',
      'Completed'
    );

    insertCampaign.run(
      'Seasonal Panchkarma Rejuvenation & Detox Drive',
      'Revitalize your body and balance your Doshas! Avail our authentic Panchkarma therapies (Nasya, Shirodhara, Basti, Janu Basti) tailored by Dr. A. K. Pandey. Cleanse deep-seated toxins and relieve chronic pain naturally. Slots available at both Delta 1 & Omicron 3 branches. Reply DETOX to book your consultation or call +91 9990947134. 🌿',
      'Panchkarma Wellness',
      'Draft'
    );

    insertCampaign.run(
      'Natural Diabetes & Joint Pain Awareness Follow-up',
      'Dear Patient, chronic joint pain and blood sugar fluctuations need root-cause care, not temporary suppression. Dr. Pandey Healthcare Clinic offers evidence-based Ayurvedic & Homeopathic solutions with zero side effects. Reply CONSULT to speak with our healthcare coordinator today. 📞 +91 9990947134',
      'Joint Care & Arthritis',
      'Draft'
    );

    const insertTask = db.prepare(`
      INSERT INTO tasks (title, due_date, priority, status, lead_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertTask.run(
      "Prepare medicated herbal oils for Priya Sharma's Uttar Basti session at Omicron 3 branch",
      '2026-10-19',
      'High',
      'Open',
      3
    );

    insertTask.run(
      "Review Abhijeet Anand's knee X-ray & finalize Janu Basti schedule with Dr. Pandey",
      '2026-10-20',
      'Normal',
      'Open',
      2
    );

    insertTask.run(
      "Follow up with Rahul Kumar on allergic rhinitis relief after 2nd week homeopathic drops",
      '2026-10-18',
      'Normal',
      'Open',
      1
    );

    insertTask.run(
      "Organize Sunday Nadi Parikshan Camp logistics at Delta 1 branch (F-615)",
      '2026-10-21',
      'High',
      'Open',
      null
    );

    insertTask.run(
      "Review HbA1c lab report and update Ayurvedic diet chart for Rajendra Prasad",
      '2026-10-17',
      'Normal',
      'Done',
      5
    );

    const insertFollowup = db.prepare(`
      INSERT INTO followup_rules (name, trigger_status, delay_hours, message, active)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertFollowup.run(
      'Post-Inquiry Appointment Booking Coordinator Call',
      'New Inquiry',
      24,
      'Namaste {{name}}, thank you for contacting Dr. Pandey’s Advanced Multi-Speciality Clinic. Our patient coordinator is available to assist you with booking your consultation with Dr. A. K. Pandey (Ayurveda & Homeopathy). Which branch is convenient for you — F-615 Delta 1 or D-401 Omicron 3? Call/WhatsApp +91 9990947134.',
      1
    );

    insertFollowup.run(
      'Post-Consultation Medicine & Diet Adherence Check',
      'Under Treatment',
      48,
      'Namaste {{name}}, we hope you have started your prescribed treatment from Dr. Pandey’s Clinic. Please follow the dietary and lifestyle advice (Pathya-Apathya) shared during your consultation. If you have any questions or require guidance, feel free to text us here or call +91 9990947134. Wishing you speedy healing! 🌿',
      1
    );

    insertFollowup.run(
      'Panchkarma Session Follow-up & Rest Guidance',
      'Under Treatment',
      24,
      'Dear {{name}}, after your Panchkarma therapy session today, please remember to drink warm water, avoid cold/heavy food, and take adequate rest. Let us know how you feel. Dr. Pandey Healthcare Clinic 🌿',
      1
    );

    insertFollowup.run(
      '1-Month Chronic Disease Follow-up & Progress Review',
      'Under Treatment',
      720,
      'Namaste {{name}}, it has been 4 weeks since your last consultation with Dr. A.K. Pandey. A timely follow-up ensures your treatment doses are adjusted to your healing progress. Book your follow-up slot at Delta 1 or Omicron 3: Call +91 9990947134.',
      0
    );

    const insertSurvey = db.prepare(`
      INSERT INTO surveys (title, description, questions, active)
      VALUES (?, ?, ?, ?)
    `);

    const s1 = insertSurvey.run(
      'Dr. Pandey Healthcare Clinic – Patient Experience & Healing Feedback',
      'Your valuable feedback helps Dr. Pandey and our clinical team enhance care quality, clinic environment, and holistic patient outcomes.',
      JSON.stringify([
        'How thoroughly did Dr. A. K. Pandey explain your diagnosis (Nadi Parikshan / Constitutional assessment) and treatment plan?',
        'How would you rate the effectiveness and symptom relief from your prescribed treatment?',
        'How satisfied were you with the clinic cleanliness, staff courtesy, and waiting time at our branch (Delta 1 / Omicron 3)?',
        'How likely are you to recommend Dr. Pandey’s Advanced Multi-Speciality Clinic to family and friends?'
      ]),
      1
    );

    insertSurvey.run(
      'New Patient Constitutional (Prakriti) & Health Intake Questionnaire',
      'Help Dr. A.K. Pandey understand your health history, digestive habits, sleep patterns, and primary complaints before your consultation.',
      JSON.stringify([
        'What is your primary health concern, and how long have you been experiencing it?',
        'Which clinic location is most convenient for you? (Branch 1: Delta 1 | Branch 2: Omicron 3 | Online Consultation)',
        'How would you describe your digestion, appetite, and bowel movements (Regular, Sluggish, Gas/Acidity, Constipated)?',
        'Do you have any existing diagnosed conditions (Diabetes, Hypertension, Thyroid, PCOS, Arthritis) or current medications?'
      ]),
      1
    );

    const insertResponse = db.prepare(`
      INSERT INTO survey_responses (survey_id, respondent, answers)
      VALUES (?, ?, ?)
    `);

    insertResponse.run(
      s1.lastInsertRowid,
      'Rahul Kumar',
      JSON.stringify({
        'How thoroughly did Dr. A. K. Pandey explain your diagnosis (Nadi Parikshan / Constitutional assessment) and treatment plan?': 'Excellent. Dr. Pandey explained the allergic root cause in depth and was very reassuring.',
        'How would you rate the effectiveness and symptom relief from your prescribed treatment?': 'Outstanding. My continuous daily sneezing stopped on day two with minimal homeopathic medicine.',
        'How satisfied were you with the clinic cleanliness, staff courtesy, and waiting time at our branch (Delta 1 / Omicron 3)?': 'Very clean, comfortable environment, and welcoming staff at Delta 1 branch.',
        'How likely are you to recommend Dr. Pandey’s Advanced Multi-Speciality Clinic to family and friends?': '10/10. Highly recommended for any chronic allergy or chronic health complaint.'
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
      'Namaste Rahul ji, Greetings from Dr. Pandey’s Advanced Multi-Speciality Clinic! Your homeopathic follow-up consultation is scheduled for Friday at 4:30 PM at our Delta 1 Clinic (F-615). Please carry your medicine chart. Helpline: +91 9990947134.',
      'sent'
    );

    insertMsg.run(
      2,
      '+91 98223 45678',
      'outbound',
      'Namaste Abhijeet ji, your Nadi Parikshan and knee assessment appointment with Dr. A. K. Pandey is confirmed for Friday at 11:30 AM at our Delta 1 branch (F-615). Kindly avoid heavy meals 2 hours prior to pulse diagnosis. Helpline: +91 9990947134.',
      'sent'
    );

    insertMsg.run(
      3,
      '+91 98334 56789',
      'outbound',
      'Namaste Priya ji, your specialized Uttar Basti therapy session is scheduled for Saturday 11:00 AM at our Omicron 3 Clinic (D-401). Our female therapist and care team have prepared the session room. Dr. Pandey Healthcare Clinic.',
      'sent'
    );
    }
  }
} catch (err) {
  console.error('Error seeding Dr. Pandey Healthcare Clinic data:', err.message);
}

db.clearCrmRecords = function() {
  db.exec(`
    DELETE FROM messages;
    DELETE FROM campaign_recipients;
    DELETE FROM tasks;
    DELETE FROM survey_responses;
    DELETE FROM leads;
  `);
};

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
