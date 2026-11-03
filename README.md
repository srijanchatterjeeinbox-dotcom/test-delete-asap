# Dr. Pandey's Healthcare (DPHC) & Research Centre — Operations & WhatsApp AI Receptionist

A modern, local-first clinical operations workspace for **Dr. Pandey's Healthcare (DPHC) & Research Centre** (Greater Noida, Uttar Pradesh, India), featuring AI information assistance powered by the **DPHC AI Knowledge Base (v1.1)**.

- **Website:** [www.drpandeyhealthcare.com](https://www.drpandeyhealthcare.com)
- **Address:** Shivam Plaza Market, 3rd Floor, Delta 1, Greater Noida, Uttar Pradesh, India
- **Phone / WhatsApp:** 9990947134
- **Consultation Modes:** Clinic visit, telephone, WhatsApp (subject to availability)

## Doctor Profiles & Service Map (DPHC v1.1)
- **Dr. A. K. Pandey** (MD, FMC Germany): Senior Homoeopathic Consultant & Family Physician (15+ yrs exp, Homoeopathy Purodha Samman 2025). Focus: Advanced Homoeopathy for chronic diseases (CKD, CLD, diabetes, thyroid, arthritis, skin, asthma). *(Note: Dr. Pandey does not practice Ayurveda, Panchkarma or Nadi Pariksha).*
- **Dr. Bhanu Priya Mishra** (BAMS, MD, CGO; Reg. UP74731): Obstetrics & Gynaecologist. Areas of practice: Ayurveda, Nadi Pariksha (Ayurvedic pulse diagnosis), Prakriti-Vikriti assessment.
- **Dr. Shuddhatam Jain** (MBBS, MS): General Surgery & Laparoscopic Surgery.
- **Dr. Shrey Shrivastava** (MBBS, MD): General Physician.

## Features
- **Official DPHC Knowledge Base (v1.1) Context Window:**
  - Accurate doctor-wise service scoping (never mixing doctors' scopes).
  - Safety & ethics rules: Never promises cure, never advises stopping prescribed medicines, no diagnosis or prescriptions.
  - Standard appointment response template & welcome message.
- **WhatsApp AI Receptionist with Multi-Turn Conversational Context Window:**
  - Preserves multi-turn conversation memory across incoming and outgoing WhatsApp messages.
  - Interactive multi-turn chat simulator in the dashboard with speech bubbles, turn counter, and context reset.
- **Password-Gated Dashboard & SQLite Database (`data/drpandey.db`)**
- **Patient Records CRM:** Categorization, communication audit log, and follow-ups.
- **WhatsApp Multi-Device Gateway:** Baileys QR code pairing to link the clinic's WhatsApp phone number.

## Running Locally

1. Ensure dependencies are installed:
   ```bat
   npm install
   ```
2. Verify `.env` configuration (`ADMIN_PASSWORD`, `GEMINI_API_KEY`, `ENABLE_WHATSAPP=true`).
3. Start the application:
   ```bat
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser.
