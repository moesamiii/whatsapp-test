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

// 🤖 الذكاء الاصطناعي الذكي ثنائي اللغة
async function askAI(userMessage) {
  try {
    console.log("🤖 DEBUG => Sending message to AI:", userMessage);

    const lang = detectLanguage(userMessage);
    console.log("🌐 Detected language:", lang);

    const doctorsList = CLINIC_INFO.doctors[lang].join("\n");
    const servicesList = CLINIC_INFO.services[lang].join("\n");

    // 🟢 Arabic system prompt
    const arabicPrompt = `
أنت موظف خدمة عملاء ذكي وودود في "عيادة ابتسامة الطبيّة".
📍 الموقع: عمّان – عبدون، خلف بنك الإسكان، الطابق الأول.
🕒 مواعيد العمل: يوميًا من الساعة 2 ظهرًا حتى الساعة 10 مساءً (الجمعة مغلق).

👨‍⚕️ الأطباء المتوفرون فقط:
${doctorsList}

🦷 الخدمات المتوفرة فقط:
${servicesList}

القواعد:
1. لدينا فقط الأطباء أعلاه. إذا ذُكر طبيب غير موجود، قل:
   "عذرًا، هذا الطبيب ليس ضمن فريقنا الطبي. أطباؤنا هم: ${CLINIC_INFO.doctors.ar.join(
     "، "
   )}."
2. نقدم فقط خدمات الأسنان المذكورة أعلاه. إذا ذُكرت خدمة غير موجودة، قل:
   "نحن عيادة أسنان متخصصة. الخدمة التي تسأل عنها غير متوفرة لدينا."
3. إذا قال العميل كلمة (حجز) فقط بدون تحديد الطبيب أو الخدمة، يمكنك مساعدته بالحجز.
4. إذا ذكر الطبيب أو الخدمة، تحقق أولاً من صحتها.
5. لا تتحدث إلا عن العيادة، الخدمات، الأطباء، والمواعيد.
6. الرد دائمًا بالعربية فقط.
7. لا تخترع أي معلومة جديدة.
`;

    // 🔵 English system prompt
    const englishPrompt = `
You are a smart and friendly customer service assistant at "Smile Medical Clinic".
📍 Location: Amman – Abdoun, behind Housing Bank, First Floor.
🕒 Working hours: Daily from 2:00 PM to 10:00 PM (Closed on Fridays).

👨‍⚕️ Available Doctors ONLY:
${CLINIC_INFO.doctors.en.join("\n")}

🦷 Available Services ONLY:
${servicesList}

Rules:
1. Only the doctors above are valid. If a user mentions another doctor, reply:
   "Sorry, that doctor is not part of our team. Our doctors are: ${CLINIC_INFO.doctors.en.join(
     ", "
   )}."
2. Only dental services listed above are provided. If a service is not listed, reply:
   "We are a dental clinic. The service you mentioned is not available."
3. If the user says "book" without specifying a doctor or service, proceed with booking normally.
4. If the user mentions a doctor or service, validate first.
5. Stay within clinic topics only.
6. Always respond in English only.
7. Do not invent information.
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

// 🔹 منطق معالجة الحجز (يُستخدم في ملف webhook أو الردود)
async function handleBookingLogic(
  userText,
  from,
  sendAppointmentButtons,
  sendTextMessage
) {
  const lang = detectLanguage(userText);
  const doctors = getDoctorsList(lang);
  const services = getServicesList(lang);

  const hasBookingKeyword =
    userText.includes("حجز") || userText.toLowerCase().includes("book");
  const mentionedDoctor = doctors.find((doc) =>
    userText.includes(doc.split(" ")[1])
  );
  const mentionedService = services.find((srv) =>
    userText.includes(srv.split(" ")[0])
  );

  // ✅ إذا قال فقط حجز بدون تحديد دكتور أو خدمة → افتح الحجز عادي
  if (hasBookingKeyword && !mentionedDoctor && !mentionedService) {
    console.log("✅ Booking request without doctor/service → allowed");
    await sendAppointmentButtons(from);
    return;
  }

  // ❌ إذا كتب اسم دكتور → تحقق
  if (mentionedDoctor && !isValidDoctor(mentionedDoctor, lang)) {
    console.log("❌ Invalid doctor name for booking");
    await sendTextMessage(
      from,
      lang === "ar"
        ? `عذرًا، هذا الطبيب ليس ضمن فريقنا الطبي. أطباؤنا هم: ${doctors.join(
            "، "
          )}.`
        : `Sorry, that doctor is not part of our team. Available doctors are: ${doctors.join(
            ", "
          )}.`
    );
    return;
  }

  // ❌ إذا كتب اسم خدمة → تحقق
  if (mentionedService && !isValidService(mentionedService, lang)) {
    console.log("❌ Invalid service name for booking");
    await sendTextMessage(
      from,
      lang === "ar"
        ? `نحن عيادة أسنان متخصصة، والخدمة "${mentionedService}" غير متوفرة لدينا. خدماتنا هي: ${services.join(
            "، "
          )}.`
        : `We are a dental clinic, and the service "${mentionedService}" is not available. Our services include: ${services.join(
            ", "
          )}.`
    );
    return;
  }

  // ✅ إذا الطبيب أو الخدمة صحيحة → تابع الحجز
  if (hasBookingKeyword && (mentionedDoctor || mentionedService)) {
    console.log("✅ Valid booking → sending appointment options");
    await sendAppointmentButtons(from);
    return;
  }
}

module.exports = {
  askAI,
  isValidDoctor,
  isValidService,
  getDoctorsList,
  getServicesList,
  handleBookingLogic,
  CLINIC_INFO,
};
