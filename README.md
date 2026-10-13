# Capital Institute — Coaching Operations & Academic Management Dashboard

A local-first operations workspace for coaching institutes, competitive exam academies, student admissions, batch broadcasts, faculty tasks, student feedback forms, and academic curriculum planning.

## Included Features

- **Password-Gated Dashboard & SQLite Database (`data/capital.db`)**
- **Student Admissions & Inquiries CRM**: Search, status stages (Inquiry, Demo, Enrolled, Fee Pending), batch streams, WhatsApp consent verification, and edit support
- **Student Spreadsheet Import**: CSV / XLSX / XLS preview and bulk import (up to 2,000 students; 5 MB limit)
- **Batch Broadcasts & Outreach**: Campaign drafting, recipient queueing, explicit send actions, rate limiting, and consent re-check
- **Communication Audit Log**: Outbound notifications and student message history
- **Faculty & Staff Tasks**: Action items for counselors, teachers, and administrators
- **Counseling & Follow-up Rules**: Structured templates and follow-up schedules for admissions
- **Student Feedback & Test Forms**: Public online portal (`/s/:id`) with custom questions and response viewing
- **Academic & Batch Curriculum Planner**: AI-powered study roadmap, DPP guidelines, and mock test schedule generator
- **AI Academic Counselor**: Gemini & Anthropic API support (with rich offline educational demo fallback)
- **WhatsApp Gateway Integration**: Optional Baileys connection and QR scan
- **Modern, Responsive Institute UI**: Premium styling tailored for educational academies

## Requirements

- Node.js 20+
- npm

## Quick Start on Windows

1. Open this folder in terminal or File Explorer.
2. Run:

   ```bat
   npm install
   copy .env.example .env
   ```

3. In `.env`, ensure `ADMIN_PASSWORD` is configured with your private password.
4. Start the application:

   ```bat
   npm start
   ```

5. Open `http://localhost:3000` in your browser and sign in.

## Enabling AI (Gemini or Anthropic)

Add your API key to `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Or for Claude:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

Restart `npm start`. If no key is set, the dashboard operates seamlessly in demo mode with built-in educational suggestions.

## Optional WhatsApp Integration

1. Use an institute WhatsApp account and review WhatsApp terms.
2. Set `ENABLE_WHATSAPP=true` in `.env`.
3. Restart the server, navigate to **Settings**, and click **Start Connection**.
4. Scan the displayed QR code via WhatsApp → **Linked Devices**.

## Data and Backups

The SQLite database is stored locally at `data/capital.db`. WhatsApp session authentication tokens are saved in `data/wa-auth`. Both should be kept secure and backed up regularly.
