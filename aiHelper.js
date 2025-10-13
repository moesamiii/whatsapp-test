const Groq = require("groq-sdk");
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 🔹 كشف لغة المستخدم (عربي أو إنجليزي)
function detectLanguage(text) {
  const arabic = /[\u0600-\u06FF]/;
  return arabic.test(text) ? "ar" : "en";
}

// 🤖 الذكاء الاصطناعي الذكي ثنائي اللغة
async function askAI(userMessage) {
  try {
    console.log("🤖 DEBUG => Sending message to AI:", userMessage);

    const lang = detectLanguage(userMessage);
    console.log("🌐 Detected language:", lang);

    // 🟢 Arabic system prompt (ثابت ومقيد)
    const arabicPrompt = `
أنت موظف خدمة عملاء ذكي وودود في "عيادة ابتسامة الطبيّة".
📍 الموقع: عمّان – عبدون، خلف بنك الإسكان، الطابق الأول.
🕒 مواعيد العمل: يوميًا من الساعة 2 ظهرًا حتى الساعة 10 مساءً (الجمعة مغلق).

تتحدث العربية الفصحى فقط، ومهمتك هي مساعدة العملاء في:
- الحجز أو تعديل الموعد.
- معرفة الأسعار أو العروض.
- شرح الخدمات أو الإجراءات العلاجية.
- الإجابة عن الأسئلة العامة حول العيادة (الموقع، الأطباء، الدوام...).

⚙️ القواعد:
1. لا تخرج عن مواضيع العيادة أبدًا.
2. لا تذكر أبدًا أن العيادة لديها أخصائيين نفسيين أو معالجين (therapists) أو أي خدمات نفسية.
3. إذا سُئلت عن حالات طارئة أو إسعاف أو أرقام طوارئ — لا تقدم أي استشارة طبية، فقط قل بلطف:
   "في الحالات الطارئة يُرجى الاتصال على الرقم الموحد للإسعاف في السعودية (997) أو الدفاع المدني (998) أو الشرطة (999)."
4. إذا سُئلت عن اسم العيادة أو موقعها أو مواعيد العمل — استخدم المعلومات أعلاه كما هي دون أي تغيير.
5. إذا سُئلت عن شيء خارج نطاق العيادة، قل بلطف:
   "يمكنني المساعدة فقط فيما يخص خدمات وعيادتنا."
6. لا تخلط الإنجليزية مع العربية.
7. كن ودودًا وطبيعيًا في أسلوبك (مثل موظف استقبال حقيقي).
8. لا تخترع مواعيد أو مواقع جديدة — استخدم دائمًا:
   🕒 "دوامنا من الساعة 2 ظهرًا إلى 10 مساءً، والجمعة مغلق."
`;

    // 🔵 English system prompt (fixed and controlled)
    const englishPrompt = `
You are a smart and friendly customer service assistant at "Smile Medical Clinic".
📍 Location: Amman – Abdoun, behind Housing Bank, First Floor.
🕒 Working hours: Daily from 2:00 PM to 10:00 PM (Closed on Fridays).

You only speak English.
Your job is to help clients with:
- Booking or rescheduling appointments.
- Providing prices or offers.
- Explaining services or treatments.
- Answering general questions about the clinic (location, doctors, working hours...).

⚙️ Rules:
1. Stay strictly within clinic-related topics.
2. Never mention that the clinic has therapists, psychological services, or mental health specialists.
3. If someone asks for emergency help or numbers, do not give medical advice. Instead reply politely:
   "For emergencies, please contact Saudi emergency services:
    🚑 Ambulance: 997
    🚒 Civil Defense: 998
    🚓 Police: 999."
4. If asked about clinic name, location, or working hours — always use the exact details above.
5. If asked about unrelated topics, reply politely:
   "I can only assist with our clinic's services and appointments."
6. Always reply in English only.
7. Keep responses natural, polite, and warm — like a real human receptionist.
8. Never make up new hours or locations — always say:
   "We are open daily from 2 PM to 10 PM, and closed on Fridays."
`;

    const systemPrompt = lang === "ar" ? arabicPrompt : englishPrompt;

    // 🧠 AI call
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7, // أكثر انضباطًا لعدم التخمين
      max_completion_tokens: 512,
    });

    const reply =
      completion.choices[0]?.message?.content ||
      (lang === "ar"
        ? "عذرًا، لم أفهم سؤالك تمامًا."
        : "Sorry, I didn’t quite understand that.");
    console.log("🤖 DEBUG => AI Reply:", reply);

    return reply;
  } catch (err) {
    console.error("❌ DEBUG => AI Error:", err.response?.data || err.message);
    return "⚠️ حدث خطأ في نظام المساعد الذكي.";
  }
}

// 🔹 التحقق من الاسم بالذكاء الاصطناعي
async function validateNameWithAI(name) {
  try {
    const prompt = `
الاسم المدخل هو: "${name}"
هل هذا يبدو كاسم شخص حقيقي بالعربية مثل أحمد، محمد، علي، ريم، سارة؟
أجب فقط بـ "نعم" أو "لا".
`;
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_completion_tokens: 10,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    console.log("🤖 DEBUG => Name validation reply:", reply);
    return reply && reply.startsWith("نعم");
  } catch (err) {
    console.error("❌ DEBUG => Name validation error:", err.message);
    return false;
  }
}

module.exports = { askAI, validateNameWithAI };
