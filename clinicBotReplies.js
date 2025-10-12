// clinicBotReplies.js

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[!?.،]/g, "")
    .trim();
}

// 🔹 كلمات مفتاحية رئيسية
const keywords = {
  greeting: ["مرحبا", "اهلا", "السلام", "hi", "hello", "hey"],
  schedule: [
    "مواعيد",
    "اوقات",
    "دوام",
    "opening",
    "hours",
    "schedule",
    "work time",
  ],
  price: ["سعر", "الفلوس", "كشف", "تكلفة", "price", "cost", "fees"],
  location: ["موقع", "وين", "address", "location", "map", "place"],
  thanks: ["شكرا", "thx", "thanks", "thank you", "مشكور"],
  booking: ["حجز", "موعد", "booking", "appointment", "reserve"],
  doctor: ["دكتور", "طبيب", "doctor", "dentist", "dermatologist"],
  offers: ["خصم", "عرض", "offer", "discount", "promo"],
};

// 🔹 كلمات مسيئة (Bad Words)
const badWords = [
  "غبي",
  "تافه",
  "قليل الادب",
  "وسخ",
  "حمار",
  "fuck",
  "stupid",
  "idiot",
  "dumb",
  "bitch",
  "shit",
  "asshole",
  "jerk",
  "fool",
  "loser",
  "suck",
  "trash",
];

// 🔹 أسئلة متكرّرة
const faqs = [
  {
    q: ["هل يوجد تنظيف اسنان", "teeth cleaning", "teeth polish"],
    a: "🦷 نعم، نقدم خدمة تنظيف وتلميع الأسنان بأحدث الأجهزة وبإشراف أطباء مختصين.",
  },
  {
    q: ["هل يوجد طبيبة نساء", "gynecologist", "lady doctor"],
    a: "👩‍⚕️ نعم، لدينا طبيبة نساء وولادة متخصصة، ويمكن حجز موعد بسهولة عبر الواتساب.",
  },
  {
    q: ["هل عندكم خصم", "offers", "discount", "promotion"],
    a: "🎉 نعم! لدينا عروض موسمية مميزة على الكشف والعلاجات، تواصل معنا لمعرفة التفاصيل الحالية.",
  },
  {
    q: ["مين الاطباء", "who is the doctor", "specialist"],
    a: "👨‍⚕️ لدينا نخبة من الأطباء في تخصصات الجلدية، الأسنان، والتجميل. أخبرني ما التخصص الذي تبحث عنه؟",
  },
  {
    q: ["هل تقبلون تأمين", "insurance"],
    a: "💳 نعم، نقبل أغلب شركات التأمين الطبي. يمكنك إرسال اسم شركتك لنتأكد منها.",
  },
];

// 🔹 ردود عشوائية لإضفاء طبيعية
function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// 🔹 الرد الذكي
function getReply(text) {
  const lower = normalize(text);
  const includesAny = (arr) => arr.some((w) => lower.includes(w));

  // ✅ كشف اللغة
  const isEnglish = /[a-z]/i.test(text);

  // ✅ التحقق من الكلمات المسيئة
  if (includesAny(badWords)) {
    return isEnglish
      ? "😔 We're sorry for your frustration. Please let us know how we can assist you better."
      : "😔 نعتذر إن شعرت بالإحباط، نحن هنا لمساعدتك بأفضل طريقة ممكنة.";
  }

  // ✅ تحية
  if (includesAny(keywords.greeting)) {
    return isEnglish
      ? pickRandom([
          "👋 Hello! Welcome to *Ibtisama Clinic*! How can I assist you today?",
          "Hi there! 😊 How can I help you book an appointment or learn more about our services?",
          "Welcome to Ibtisama Medical Clinic! How can I support you today?",
        ])
      : pickRandom([
          "👋 أهلاً وسهلاً في *عيادة ابتسامة الطبية*! كيف يمكنني مساعدتك اليوم؟",
          "مرحباً بك في عيادتنا 💚 هل ترغب بحجز موعد أو الاستفسار عن خدمة؟",
          "أهلاً بك 👋 يسعدنا تواصلك مع *عيادة ابتسامة*، كيف نقدر نخدمك اليوم؟",
        ]);
  }

  // ✅ المواعيد
  if (includesAny(keywords.schedule)) {
    return isEnglish
      ? "🕒 Our clinic hours are from *9 AM to 9 PM*, Saturday to Thursday. We’re closed on Fridays."
      : "🕒 مواعيد العمل: يومياً من *9 صباحاً إلى 9 مساءً* (الجمعة مغلق).";
  }

  // ✅ الأسعار
  if (includesAny(keywords.price)) {
    return isEnglish
      ? "💰 The consultation fee is *150 SAR*, including full check-up and medical advice."
      : "💰 تكلفة الكشف هي *150 ريال* وتشمل الاستشارة والفحص الكامل.";
  }

  // ✅ الموقع
  if (includesAny(keywords.location)) {
    return isEnglish
      ? "📍 Our clinic is located in *Amman – Abdoun, behind Housing Bank, 1st Floor*.\nGoogle Maps: https://maps.google.com"
      : "📍 موقع العيادة: *عمّان – عبدون، خلف بنك الإسكان، الطابق الأول*.\nGoogle Maps: https://maps.google.com";
  }

  // ✅ الشكر
  if (includesAny(keywords.thanks)) {
    return isEnglish
      ? pickRandom([
          "You're most welcome! 😊",
          "Happy to help! 💚",
          "Glad to assist — have a great day!",
        ])
      : pickRandom([
          "🙏 العفو! نتمنى لك يوماً جميلاً وصحة دائمة 💚",
          "🌿 على الرحب والسعة! نحن هنا دائماً لخدمتك.",
          "😊 شكراً لتواصلك معنا، ونتمنى لك يوماً طيباً.",
        ]);
  }

  // ✅ الحجز
  if (includesAny(keywords.booking)) {
    return isEnglish
      ? "📅 Great! Let's book your appointment. Please tell me your preferred time (e.g., 3 PM, 6 PM, or 9 PM)."
      : "📅 رائع! لنبدأ بالحجز، من فضلك اختر الوقت الذي يناسبك (مثلاً: 3 مساءً، 6 مساءً، أو 9 مساءً).";
  }

  // ✅ الأطباء
  if (includesAny(keywords.doctor)) {
    return isEnglish
      ? "👨‍⚕️ We have a team of specialists in dermatology, dentistry, and cosmetic treatments. Which type of doctor are you looking for?"
      : "👨‍⚕️ لدينا أطباء مختصون في الجلدية، الأسنان، والعلاجات التجميلية. أي تخصص ترغب بمعرفته؟";
  }

  // ✅ العروض
  if (includesAny(keywords.offers)) {
    return isEnglish
      ? "🎉 Yes! We currently have special offers on first-time consultations and cosmetic treatments!"
      : "🎉 نعم، لدينا عروض مميزة حالياً على الكشف الأول والعلاجات التجميلية!";
  }

  // ✅ البحث في الأسئلة المتكررة
  for (const faq of faqs) {
    if (faq.q.some((w) => lower.includes(w))) {
      return faq.a;
    }
  }

  // ✅ الرد الافتراضي
  return isEnglish
    ? `🤖 I received your message: “${text}”\n\nYou can ask me about *appointments 🕒, prices 💰, location 📍,* or *booking 📅*.`
    : `🤖 استلمت رسالتك: “${text}”\n\nيمكنك سؤالي عن: *المواعيد 🕒، الأسعار 💰، الموقع 📍، أو الحجز 📅*.`;
}

module.exports = getReply;
