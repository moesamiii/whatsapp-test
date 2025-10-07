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

🦷 الأطباء المتوفرون في العيادة:
1. د. أحمد الخالدي – زراعة وتجميل الأسنان
2. د. سارة العلي – طب وتقويم الأسنان
3. د. محمد الراوي – علاج عصب وحشو تجميلي
4. د. ريم منصور – تنظيف وتبييض الأسنان

⚙️ القواعد:
1. لا تخرج عن مواضيع العيادة أبدًا.
2. إذا سُئلت عن اسم دكتور غير موجود ضمن القائمة أعلاه، أجب فقط:
   "❌ لا يوجد لدينا دكتور بهذا الاسم، نحن نقدم فقط خدمات الأسنان."
3. إذا سُئلت عن الخدمات، اقتصر على خدمات الأسنان فقط (تنظيف، تبييض، حشو، زراعة، تقويم، ابتسامة هوليود، علاج عصب، خلع).
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

Available dentists:
1. Dr. Ahmad Al-Khalidi – Dental implants and cosmetic dentistry
2. Dr. Sarah Al-Ali – Orthodontics and general dentistry
3. Dr. Mohammad Al-Rawi – Root canal and restorative treatments
4. Dr. Reem Mansour – Cleaning and whitening

You only speak English.
Your job is to help clients with:
- Booking or rescheduling appointments.
- Providing prices or offers.
- Explaining dental services or treatments.
- Answering general questions about the clinic (location, doctors, working hours...).

⚙️ Rules:
1. Stay strictly within dental topics.
2. If asked about any doctor not listed above, respond politely:
   "We don’t have a doctor by that name; our clinic offers only dental services."
3. If asked about clinic name, location, or working hours — always use the exact details above.
4. If asked about unrelated topics, reply:
   "I can only assist with our clinic’s dental services and appointments."
5. Always reply in English only.
6. Keep responses polite and natural — like a real receptionist.
7. Never make up new hours or locations — always say:
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
      temperature: 0.6, // أكثر انضباطًا لعدم التخمين
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
