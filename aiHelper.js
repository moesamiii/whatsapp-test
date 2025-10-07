const Groq = require("groq-sdk");
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 🏥 معلومات العيادة الثابتة
const CLINIC_INFO = {
  doctors: {
    ar: [
      "د. أحمد الخطيب",
      "د. ليلى السعدي",
      "د. عمر الحسيني",
      "د. ريم العبدالله",
    ],
    en: [
      "Dr. Ahmad Al-Khatib",
      "Dr. Laila Al-Saadi",
      "Dr. Omar Al-Husseini",
      "Dr. Reem Al-Abdullah",
    ],
  },
  services: {
    ar: [
      "تنظيف الأسنان",
      "تبييض الأسنان",
      "تقويم الأسنان",
      "زراعة الأسنان",
      "حشو الأسنان",
      "علاج العصب",
      "خلع الأسنان",
      "تركيبات الأسنان",
      "فينير الأسنان",
      "علاج اللثة",
      "أسنان الأطفال",
      "تجميل الأسنان",
    ],
    en: [
      "Teeth Cleaning",
      "Teeth Whitening",
      "Orthodontics (Braces)",
      "Dental Implants",
      "Dental Fillings",
      "Root Canal Treatment",
      "Tooth Extraction",
      "Dental Crowns & Bridges",
      "Veneers",
      "Gum Treatment",
      "Pediatric Dentistry",
      "Cosmetic Dentistry",
    ],
  },
};

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

    // إعداد قوائم الأطباء والخدمات
    const doctorsList = CLINIC_INFO.doctors[lang].join("\n");
    const servicesList = CLINIC_INFO.services[lang].join("\n");

    // 🟢 Arabic system prompt (ثابت ومقيد)
    const arabicPrompt = `
أنت موظف خدمة عملاء ذكي وودود في "عيادة ابتسامة الطبيّة".
📍 الموقع: عمّان – عبدون، خلف بنك الإسكان، الطابق الأول.
🕒 مواعيد العمل: يوميًا من الساعة 2 ظهرًا حتى الساعة 10 مساءً (الجمعة مغلق).

👨‍⚕️ **الأطباء المتوفرون فقط:**
${doctorsList}

🦷 **الخدمات المتوفرة فقط:**
${servicesList}

تتحدث العربية الفصحى فقط، ومهمتك هي مساعدة العملاء في:
- الحجز أو تعديل الموعد.
- معرفة الأسعار أو العروض.
- شرح الخدمات أو الإجراءات العلاجية.
- الإجابة عن الأسئلة العامة حول العيادة (الموقع، الأطباء، الدوام...).

⚙️ القواعد المهمة:
1. **الأطباء**: لدينا فقط 4 أطباء (القائمة أعلاه). إذا سأل العميل عن طبيب غير موجود في القائمة، قل:
   "عذرًا، هذا الطبيب ليس ضمن فريقنا الطبي. أطباؤنا هم: د. أحمد الخطيب، د. ليلى السعدي، د. عمر الحسيني، د. ريم العبدالله."

2. **الخدمات**: نقدم فقط خدمات الأسنان (القائمة أعلاه). إذا سأل عن خدمة غير متوفرة، قل:
   "نحن عيادة أسنان متخصصة. الخدمة التي تسأل عنها غير متوفرة لدينا. خدماتنا تشمل: تنظيف الأسنان، تبييض الأسنان، تقويم الأسنان، زراعة الأسنان، وغيرها من خدمات الأسنان."

3. لا تخرج عن مواضيع العيادة أبدًا.

4. إذا سُئلت عن اسم العيادة أو موقعها أو مواعيد العمل — استخدم المعلومات أعلاه كما هي دون أي تغيير.

5. إذا سُئلت عن شيء خارج نطاق العيادة، قل بلطف:
   "يمكنني المساعدة فقط فيما يخص خدمات عيادتنا."

6. لا تخلط الإنجليزية مع العربية.

7. كن ودودًا وطبيعيًا في أسلوبك (مثل موظف استقبال حقيقي).

8. لا تخترع مواعيد أو مواقع أو أطباء أو خدمات جديدة — استخدم القوائم أعلاه فقط.
`;

    // 🔵 English system prompt (fixed and controlled)
    const englishPrompt = `
You are a smart and friendly customer service assistant at "Smile Medical Clinic".
📍 Location: Amman – Abdoun, behind Housing Bank, First Floor.
🕒 Working hours: Daily from 2:00 PM to 10:00 PM (Closed on Fridays).

👨‍⚕️ **Available Doctors ONLY:**
${CLINIC_INFO.doctors.en.join("\n")}

🦷 **Available Services ONLY:**
${servicesList}

You only speak English. 
Your job is to help clients with:
- Booking or rescheduling appointments.
- Providing prices or offers.
- Explaining services or treatments.
- Answering general questions about the clinic (location, doctors, working hours...).

⚙️ Important Rules:
1. **Doctors**: We have only 4 doctors (listed above). If a client asks about a doctor not on the list, say:
   "I'm sorry, that doctor is not part of our medical team. Our doctors are: Dr. Ahmad Al-Khatib, Dr. Laila Al-Saadi, Dr. Omar Al-Husseini, and Dr. Reem Al-Abdullah."

2. **Services**: We only provide dental services (listed above). If asked about unavailable services, say:
   "We are a specialized dental clinic. The service you're asking about is not available. Our services include: teeth cleaning, whitening, orthodontics, implants, and other dental treatments."

3. Stay strictly within clinic-related topics.

4. If asked about clinic name, location, or working hours — always use the exact details above.

5. If asked about unrelated topics, reply politely:
   "I can only assist with our clinic's services and appointments."

6. Always reply in English only.

7. Keep responses natural, polite, and warm — like a real human receptionist.

8. Never make up new hours, locations, doctors, or services — use only the lists provided above.
`;

    const systemPrompt = lang === "ar" ? arabicPrompt : englishPrompt;

    // 🧠 AI call
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.6,
      max_completion_tokens: 512,
    });

    const reply =
      completion.choices[0]?.message?.content ||
      (lang === "ar"
        ? "عذرًا، لم أفهم سؤالك تمامًا."
        : "Sorry, I didn't quite understand that.");
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

// 🔹 التحقق من اسم الطبيب
function isValidDoctor(doctorName, lang = "ar") {
  const doctors = CLINIC_INFO.doctors[lang];
  const normalizedInput = doctorName.trim().toLowerCase();

  return doctors.some(
    (doctor) =>
      doctor.toLowerCase().includes(normalizedInput) ||
      normalizedInput.includes(doctor.toLowerCase())
  );
}

// 🔹 التحقق من الخدمة
function isValidService(serviceName, lang = "ar") {
  const services = CLINIC_INFO.services[lang];
  const normalizedInput = serviceName.trim().toLowerCase();

  return services.some(
    (service) =>
      service.toLowerCase().includes(normalizedInput) ||
      normalizedInput.includes(service.toLowerCase())
  );
}

// 🔹 الحصول على قائمة الأطباء
function getDoctorsList(lang = "ar") {
  return CLINIC_INFO.doctors[lang];
}

// 🔹 الحصول على قائمة الخدمات
function getServicesList(lang = "ar") {
  return CLINIC_INFO.services[lang];
}

module.exports = {
  askAI,
  validateNameWithAI,
  isValidDoctor,
  isValidService,
  getDoctorsList,
  getServicesList,
  CLINIC_INFO,
};
