const CAPITAL_INSTITUTE_KB = `
Capital Institute Official Knowledge Base & Admissions Guide:
- Institution: Capital Institute (Premier Coaching Academy for Engineering & Medical Entrances, Foundation & Board Excellence).
- Programs Offered:
  * JEE (Main & Advanced) 2-Year Program (Class 11 & 12) & 1-Year Dropper / Repeater Batch
  * NEET (UG) Medical 2-Year Program & Dropper Target 650+ Batch
  * Foundation Academy (Class 8, 9, 10 for NTSE, Olympiads, CBSE/ICSE Board Excellence)
  * Board Booster Batches (Class 10 & 12 Board Exam Prep)
  * All India Mock Test Series & Test Pass
- Key Academic Features:
  * Senior IITian and AIIMS alumni mentor faculty
  * Small batch sizes (max 25–30 students per classroom)
  * Daily Practice Problem (DPP) sets with error-tracking journals
  * Daily 1-on-1 Personal Doubt Clearing Clinic from 4:30 PM to 6:00 PM
  * Sunday All-India Mock Tests with performance analytics
  * Air-conditioned digital smart classrooms and comprehensive printed study material
- Scholarships: Capital Admission & Scholarship Test (CAST) conducted every Sunday, offering up to 90% tuition fee scholarships.
- Batch Schedules & Timings:
  * Morning Batch: 7:30 AM – 12:30 PM
  * Evening Batch: 4:00 PM – 8:30 PM
  * Weekend Intensive Batch: 9:00 AM – 5:00 PM (Saturdays & Sundays)
- Campus & Contact Details:
  * Admissions Helpline: +91 98112 34567
  * Campus Location: Capital Institute Main Campus, Education Hub
  * Academic Desk Hours: Monday to Saturday, 8:00 AM – 8:00 PM
  * Free Demo Lectures: 2 complimentary demo classes available upon booking
`;

async function callGemini(systemPrompt, userPrompt, preferredModel) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  const modelsToTry = [
    preferredModel || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3.5-flash'
  ].filter(Boolean);

  // Deduplicate
  const uniqueModels = [...new Set(modelsToTry)];

  for (const model of uniqueModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            contents: [{
              role: 'user',
              parts: [{ text: String(userPrompt) }]
            }],
            generationConfig: {
              temperature: 0.5,
              maxOutputTokens: 900
            }
          })
        }
      );

      const data = await response.json();
      if (response.ok && data.candidates?.[0]?.content?.parts) {
        const text = data.candidates[0].content.parts
          .map(part => part.text || '')
          .join('\n')
          .trim();
        if (text) return text;
      }
    } catch (_) {
      // Try next model
    }
  }

  return null;
}

async function callClaude(systemPrompt, userPrompt) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: String(userPrompt)
        }]
      })
    });

    const data = await response.json();
    if (response.ok && data.content) {
      return data.content.map(item => item.text || '').join('\n').trim();
    }
  } catch (_) {}

  return null;
}

async function answer(prompt, context = '') {
  const systemInstructionText = `You are Capital Institute's concise, expert AI academic and coaching operations assistant. Help coaching institute directors, teachers, counselors, and staff with student admissions, study schedules, parent communications, curriculum roadmaps, test series design, doubt-clearing plans, and academic guidance. Maintain a professional, encouraging, and academically rigorous tone. Do not invent institute facts. ${CAPITAL_INSTITUTE_KB} ${context}`;

  const geminiText = await callGemini(systemInstructionText, prompt);
  if (geminiText) return geminiText;

  const claudeText = await callClaude(systemInstructionText, prompt);
  if (claudeText) return claudeText;

  return `Capital Institute AI Guidance (Demo Mode):\n\n${ruleAnswer(prompt)}\n\n💡 Tip: Add a GEMINI_API_KEY in your .env file to enable live AI responses.`;
}

async function answerForWhatsApp(prompt, studentContext = '', customInstruction = '') {
  const systemInstructionText = `You are the official AI Academic Counselor and Admissions Assistant for Capital Institute.
You are conversing directly with students and parents on WhatsApp.
Your goals:
1. Provide warm, encouraging, academically credible, and concise answers suitable for WhatsApp messages.
2. Answer queries regarding admissions, competitive exam programs (JEE, NEET, Foundation, Boards), batch timings, scholarship admission tests (CAST), free demo lectures, doubt-clearing clinics, and study roadmaps.
3. Keep your replies concise (1 to 3 short paragraphs or clean bullet points with emojis). Avoid overly long walls of text.
4. When relevant, invite the student or parent to attend a free demo class or visit the campus for personal counseling.
5. If student information is available in context, greet them politely by name.

${CAPITAL_INSTITUTE_KB}

${customInstruction ? `Additional Institute Directives:\n${customInstruction}` : ''}
${studentContext ? `Current Inquirer Context:\n${studentContext}` : ''}`;

  const geminiText = await callGemini(systemInstructionText, prompt);
  if (geminiText) return geminiText;

  const claudeText = await callClaude(systemInstructionText, prompt);
  if (claudeText) return claudeText;

  return whatsAppRuleAnswer(prompt, studentContext);
}

function ruleAnswer(prompt) {
  const p = String(prompt).toLowerCase();

  if (p.includes('survey') || p.includes('feedback') || p.includes('form')) {
    return '1. Feedback Focus: Target teaching pace, concept clarity, and daily practice problem (DPP) quality.\n2. Scale Questions: Use 1–5 ratings for faculty explanation, doubt resolution, and study material relevance.\n3. Open Prompt: Include "What specific chapter or numerical concept needs a revision session?"\n4. Frequency: Conduct after completion of each major module to catch learning gaps early.';
  }

  if (p.includes('parent') || p.includes('message') || p.includes('whatsapp') || p.includes('attendance')) {
    return 'Sample Parent Communication Draft:\n"Dear Parent, Greetings from Capital Institute. We are pleased to share that your ward attended today\'s batch lecture on Mechanics. Their recent test score was 82/100, showing steady improvement in problem-solving. Tomorrow\'s doubt-clearing clinic is from 4:30 PM to 6 PM. For any queries, please reach our academic desk. Warm regards, Capital Institute."';
  }

  if (p.includes('study') || p.includes('plan') || p.includes('curriculum') || p.includes('syllabus') || p.includes('brief') || p.includes('roadmap')) {
    return 'Capital Institute 3-Phase Academic Master Plan:\n\n• Phase 1 (Foundation & Theory - 50% Time): In-depth NCERT/standard textbook concept breakdown, classroom derivations, and daily illustrative numericals.\n• Phase 2 (Application & Daily Practice - 35% Time): Solve 30–50 DPP questions per subject daily, error-log tracking, and past 10 years exam questions.\n• Phase 3 (Test Series & Rank Booster - 15% Time): Full-length timed mock tests every Sunday with 2-hour error analysis session on Mondays.\n• Weekly Rhythm: Keep Saturday evenings strictly for consolidating formulas and clearing backlogs.';
  }

  if (p.includes('counsel') || p.includes('lead') || p.includes('inquiry') || p.includes('admission')) {
    return 'Capital Institute Admission Counseling Framework:\n1. Goal Assessment: Clarify target competitive exam (JEE, NEET, Foundation, CUET) and target year.\n2. Diagnostic Evaluation: Review student\'s Class 10/11 percentage and offer the free Capital Scholarship Admission Test (CAST).\n3. Differentiators: Emphasize small batch sizes, regular test analysis, senior mentor access, and personalized doubt sessions.\n4. Call to Action: Invite parent & student for an in-person campus visit and demo class.';
  }

  return 'Capital Institute Academic Best Practice:\nEstablish clear milestone dates for syllabus completion (at least 60 days prior to the final exam). Ensure daily problem practice, weekly assessment reviews, and bi-weekly counseling check-ins so students remain confident and exam-ready.';
}

function whatsAppRuleAnswer(prompt, studentContext = '') {
  const p = String(prompt).toLowerCase();

  let greeting = 'Hello!';
  if (studentContext && studentContext.includes('named ')) {
    const match = studentContext.match(/named ([^,.]+)/);
    if (match) greeting = `Hello ${match[1].trim()}!`;
  }

  if (p.includes('fee') || p.includes('cost') || p.includes('price') || p.includes('charge')) {
    return `${greeting} Greetings from Capital Institute! 🎓\n\nOur fee structure varies by course (JEE, NEET, Foundation) and offers significant merit concessions through our Capital Admission & Scholarship Test (CAST), with scholarships up to 90% on tuition fees.\n\nFlexible installment plans are also available. Would you like our senior academic counselor to share the exact fee breakdown for your chosen program?`;
  }

  if (p.includes('demo') || p.includes('trial') || p.includes('sample class')) {
    return `${greeting} Thank you for your interest! 🌟\n\nWe provide 2 free demo lectures so you can experience our teaching methodology and mentor faculty firsthand.\n\n📍 Morning & Evening demo slots are available this week. Which subject or course (JEE, NEET, or Foundation) would you like to attend?`;
  }

  if (p.includes('time') || p.includes('timing') || p.includes('schedule') || p.includes('batch')) {
    return `${greeting} Here are the current batch timings at Capital Institute: ⏰\n\n• Morning Batch: 7:30 AM – 12:30 PM\n• Evening Batch: 4:00 PM – 8:30 PM\n• Weekend Intensive Batch: 9:00 AM – 5:00 PM\n\nAll batches include daily 1-on-1 doubt clearing clinic (4:30 PM – 6:00 PM). Which timing suits your schedule best?`;
  }

  if (p.includes('scholarship') || p.includes('cast') || p.includes('discount') || p.includes('test')) {
    return `${greeting} Capital Institute conducts the CAST (Capital Admission & Scholarship Test) every Sunday! 📝\n\n• Up to 90% tuition fee waiver based on score\n• Comprehensive diagnostic evaluation of concepts\n• Free test registration for upcoming batches\n\nReply with your current Class to register for this Sunday's slot!`;
  }

  if (p.includes('address') || p.includes('where') || p.includes('location') || p.includes('campus') || p.includes('visit')) {
    return `${greeting} You are warmly welcome to visit our campus! 🏫\n\n📍 Capital Institute Academic Campus, Education Hub\n🕒 Academic Desk Hours: Monday – Saturday, 8:00 AM to 8:00 PM\n📞 Helpline: +91 98112 34567\n\nOur counselors can arrange a personalized campus tour and study roadmap discussion for you.`;
  }

  if (p.includes('course') || p.includes('program') || p.includes('jee') || p.includes('neet') || p.includes('foundation') || p.includes('class')) {
    return `${greeting} Capital Institute offers premier programs for: 🎯\n\n1. JEE (Main & Advanced) — 2-Year & Dropper Programs\n2. NEET (UG) Medical — Comprehensive Concept & Test Prep\n3. Foundation Academy — Class 8–10 for Olympiads, NTSE & Boards\n4. Sunday All-India Mock Test Series\n\nAll programs feature IITian & AIIMS alumni mentors, daily DPPs, and small batch sizes (max 25 students). Which target exam are you preparing for?`;
  }

  return `${greeting} Welcome to Capital Institute's Official WhatsApp Desk! 🎓\n\nI can assist you with:\n• Course details (JEE, NEET, Foundation)\n• Batch timings & schedules\n• CAST Scholarship Test registration (up to 90% scholarship)\n• Free demo class booking\n• Fee structure & counselor appointments\n\nHow can I help you today? You can also reach our helpline at +91 98112 34567.`;
}

module.exports = { answer, answerForWhatsApp, CAPITAL_INSTITUTE_KB };
