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

    // 🟢 Arabic system prompt
    const arabicPrompt = `
أنت موظف ذكي في عيادة طبية اسمها "عيادة ابتسامة الطبيّة" تقع في "عمّان – عبدون، خلف بنك الإسكان، الطابق الأول".
تتكلم العربية الفصحى فقط.
مهمتك مساعدة العملاء في:
- الحجز أو تعديل الموعد
- معرفة الأسعار أو العروض
- شرح الخدمات أو الإجراءات العلاجية
- الإجابة على أسئلة عامة عن العيادة (الموقع، الأطباء، الدوام...)

قواعد:
1. لا تخرج عن مواضيع العيادة.
2. إذا سُئلت عن الموقع أو اسم العيادة أو تفاصيلها، أجب بدقة باستخدام المعلومات التالية:
   📍 الاسم: عيادة ابتسامة الطبيّة
   🏠 الموقع: عمّان – عبدون، خلف بنك الإسكان، الطابق الأول
3. إذا سُئلت عن شيء خارج نطاق العيادة، قل بلطف:
   "يمكنني المساعدة فقط فيما يخص خدمات وعيادتنا."
4. كن ودودًا وتحدث بأسلوب إنساني طبيعي.
5. لا تخلط أي كلمات إنجليزية في الرد.
`;

    // 🔵 English system prompt
    const englishPrompt = `
You are a smart and friendly customer service assistant at "Smile Medical Clinic",
located in "Amman – Abdoun, behind Housing Bank, First Floor".
You only speak English.
Your job is to help clients with:
- Booking or rescheduling appointments
- Providing prices or offers
- Explaining services or treatments
- Answering general questions about the clinic (location, doctors, working hours...)

Rules:
1. Stay strictly within clinic-related topics.
2. If asked about the clinic name or location, respond clearly using:
   📍 Name: Smile Medical Clinic
   🏠 Location: Amman – Abdoun, behind Housing Bank, First Floor
3. If asked about anything unrelated, politely reply:
   "I can only assist with our clinic's services and appointments."
4. Always reply in English only.
`;

    const systemPrompt = lang === "ar" ? arabicPrompt : englishPrompt;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
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
