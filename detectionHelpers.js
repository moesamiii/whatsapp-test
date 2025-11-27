/**
 * detectionHelpers.js
 *
 * Purpose:
 * - Detect user intent from text (location/offers/doctors/booking/greeting/cancellation)
 * - Language detection (English vs Arabic)
 * - Random greeting generation
 *
 * All detection logic is centralized here for easy maintenance
 */

const crypto = require("crypto");

// ---------------------------------------------
// 🔧 Helper Functions
// ---------------------------------------------
function includesAny(list, text) {
  const lower = String(text || "").toLowerCase();
  return list.some((word) => lower.includes(word));
}

function getRandomIndex(length) {
  const randomBuffer = crypto.randomBytes(2);
  const randomNumber = parseInt(randomBuffer.toString("hex"), 16);
  return randomNumber % length;
}

// ---------------------------------------------
// 👋 Greeting Detector and Random Response
// ---------------------------------------------
function getGreeting(isEnglish = false) {
  const englishGreetings = [
    "👋 Hello! Welcome to *Ibtisama Clinic*! How can I assist you today?",
    "Hi there! 😊 How can I help you book an appointment or learn more about our services?",
    "Welcome to *Ibtisama Medical Clinic*! How can I support you today?",
    "Hey! 👋 Glad to see you at *Ibtisama Clinic*! What can I do for you today?",
    "✨ Hello and welcome to *Ibtisama Clinic*! Are you interested in our offers or booking a visit?",
    "Good day! 💚 How can I assist you with your dental or beauty needs today?",
    "😊 Hi! You've reached *Ibtisama Clinic*, your smile is our priority!",
    "👋 Hello there! Would you like to see our latest offers or book an appointment?",
    "Welcome! 🌸 How can I help you take care of your smile today?",
    "💬 Hi! How can I help you find the right service or offer at *Ibtisama Clinic*?",
  ];

  const arabicGreetings = [
    "👋 أهلاً وسهلاً في *عيادة ابتسامة الطبية*! كيف يمكنني مساعدتك اليوم؟",
    "مرحباً بك في عيادتنا 💚 هل ترغب بحجز موعد أو الاستفسار عن خدمة؟",
    "أهلاً بك 👋 يسعدنا تواصلك مع *عيادة ابتسامة*، كيف نقدر نخدمك اليوم؟",
    "🌸 حيّاك الله! وش أكثر خدمة حاب تستفسر عنها اليوم؟",
    "✨ أهلاً وسهلاً! هل ترغب بالتعرف على عروضنا أو حجز موعد؟",
    "💚 يسعدنا تواصلك مع *عيادة ابتسامة*! كيف ممكن نساعدك اليوم؟",
    "😊 مرحباً بك! تقدر تسأل عن أي خدمة أو عرض متوفر حالياً.",
    "👋 أهلين وسهلين فيك! وش الخدمة اللي حاب تعرف عنها أكثر؟",
    "🌷 يا مرحبا! كيف نقدر نساعدك اليوم في *عيادة ابتسامة*؟",
    "💬 أهلاً بك! هل ترغب بحجز موعد أو الاطلاع على عروضنا الحالية؟",
  ];

  const replies = isEnglish ? englishGreetings : arabicGreetings;
  return replies[getRandomIndex(replies.length)];
}

function isGreeting(text = "") {
  const greetingsKeywords = [
    "hi",
    "hello",
    "hey",
    "morning",
    "evening",
    "good",
    "welcome",
    "هلا",
    "مرحبا",
    "السلام",
    "اهلا",
    "أهلاً",
    "اهلين",
    "هاي",
    "شلونك",
    "صباح",
    "مساء",
  ];
  return includesAny(greetingsKeywords, text);
}

// ---------------------------------------------
// 🗺️ Location Detection Helper
// ---------------------------------------------
function isLocationRequest(text = "") {
  const keywords = [
    "موقع",
    "مكان",
    "عنوان",
    "وين",
    "فين",
    "أين",
    "location",
    "where",
    "address",
    "place",
    "maps",
    "وينكم",
    "فينكم",
  ];
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// ---------------------------------------------
// 🎁 Offers Detection Helper
// ---------------------------------------------
function isOffersRequest(text = "") {
  const keywords = [
    "عروض",
    "عرض",
    "خصم",
    "خصومات",
    "تخفيض",
    "باقات",
    "باكيج",
    "بكج",
    "عرض خاص",
    "عرض اليوم",
    "وش عروضكم",
    "فيه عروض",
    "في عروض",
    "عندكم عروض",
    "ابي عرض",
    "ابي عروض",
    "عطوني العرض",
    "عطوني العروض",
    "بكم",
    "كم السعر",
    "offer",
    "offers",
    "discount",
    "price",
    "deal",
  ];

  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// ---------------------------------------------
// ✔ Detect explicit confirmation to send the offers
// ---------------------------------------------
function isOffersConfirmation(text = "") {
  if (!text) return false;

  const normalizedText = text
    .replace(/\u0640/g, "") // remove tatweel
    .replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/g, "") // remove weird unicode
    .trim()
    .toLowerCase();

  const patterns = [
    // Arabic confirmation
    "ارسل",
    "رسل",
    "أرسل",
    "ابغى",
    "أبغى",
    "ابي",
    "أبي",
    "ايه",
    "إيه",
    "ايوه",
    "أيوه",
    "نعم",
    "شوف",
    "عرض",
    "ارسلي",
    "ابعث",
    "ابعثي",
    "ارسلهم",
    "ارسله",
    "ارسل العرض",

    // English confirmation
    "yes",
    "yeah",
    "yup",
    "ok",
    "okay",
    "sure",
    "send",
    "send it",
    "send them",
    "send offers",
    "show",
    "show me",
    "show offers",
    "i want",
    "i need",
  ];

  return patterns.some((p) => normalizedText.includes(p));
}

// ---------------------------------------------
// 👨‍⚕️ Doctors Detection Helper
// ---------------------------------------------
function isDoctorsRequest(text = "") {
  const keywords = [
    "دكتور",
    "دكاترة",
    "طبيب",
    "أطباء",
    "الدكتور",
    "الطبيب",
    "doctor",
    "doctors",
    "physician",
    "dr",
    "اطباء",
    "الاطباء",
  ];
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// ---------------------------------------------
// 📅 Booking Detection Helper
// ---------------------------------------------
function isBookingRequest(text = "") {
  const keywords = [
    "book",
    "booking",
    "boocing",
    "bocking",
    "bokking",
    "pooking",
    "pocking",
    "boking",
    "boocking",
    "bokin",
    "boonking",
    "appointment",
    "reserve",
    "reservation",
    "schedul",
    "shedule",
    "schedual",
    "resrv",
    "appoint",
    "appoinment",
    "احجز",
    "احجر",
    "احجد",
    "اجحر",
    "احجذ",
    "ابغى احجز",
    "ابي احجز",
    "ابي موعد",
    "ابغى موعد",
    "موعد",
    "حجز",
    "ارغب بالحجز",
    "اريد حجز",
    "ودي احجز",
    "ودّي احجز",
    "احجوز",
  ];
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// ---------------------------------------------
// ❌ Cancellation Detection Helper (NEW)
// ---------------------------------------------
function isCancellationRequest(text = "") {
  const keywords = [
    // Arabic
    "الغاء",
    "إلغاء",
    "الغي",
    "إلغي",
    "الغو",
    "إلغو",
    "الغيت",
    "الغوا",
    "الغاء الحجز",
    "الغاء الموعد",
    "الغي الحجز",
    "الغي الموعد",
    "ابغى الغي",
    "ابي الغي",
    "ابغى الغاء",
    "ابي الغاء",
    "ما ابي",
    "ماابي",
    "ما ابغى",
    "ماابغى",

    // English
    "cancel",
    "cancell",
    "cancle",
    "cancellation",
    "cancel booking",
    "cancel appointment",
    "cancel my booking",
    "cancel my appointment",
    "i want to cancel",
    "want to cancel",
    "need to cancel",
  ];
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// ---------------------------------------------
// 🌐 Language Detector
// ---------------------------------------------
function isEnglish(text = "") {
  const arabicPattern = /[\u0600-\u06FF]/;
  return !arabicPattern.test(text);
}

// --------------------------------------------
// Exports
// --------------------------------------------
module.exports = {
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isCancellationRequest, // NEW
  isEnglish,
  isGreeting,
  getGreeting,
};
