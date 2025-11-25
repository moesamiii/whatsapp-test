/**
 * messageHandlers.js
 *
 * Purpose:
 * - Detect user intent from text/voice (location/offers/doctors).
 * - Detect inappropriate content (ban words).
 * - Provide message-sending flows that use media assets (location link, offer images, doctor images).
 * - Perform transcription of audio using Groq Whisper integration.
 *
 * Responsibilities kept here:
 * - Detection helpers: isLocationRequest, isOffersRequest, isDoctorsRequest, isEnglish, containsBanWords
 * - sendLocationMessages: uses CLINIC_LOCATION_LINK from mediaAssets
 * - sendOffersImages & sendDoctorsImages: orchestrate sending multiple images and follow-up text
 * - sendBanWordsResponse: handles inappropriate content gracefully
 * - sendImageMessage: performs the network request to WhatsApp API (requires WHATSAPP_TOKEN)
 * - transcribeAudio: fetches media from WhatsApp and posts to Groq Whisper
 *
 * Moved to mediaAssets.js:
 * - CLINIC_NAME
 * - CLINIC_LOCATION_LINK
 * - OFFER_IMAGES
 * - DOCTOR_IMAGES
 *
 * Usage:
 * - const { sendOffersImages, isLocationRequest, transcribeAudio, containsBanWords } = require('./messageHandlers');
 */

const axios = require("axios");
const FormData = require("form-data");
const { sendTextMessage } = require("./helpers");
const crypto = require("crypto");

// Import static media assets from mediaAssets.js
const {
  CLINIC_NAME,
  CLINIC_LOCATION_LINK,
  OFFER_IMAGES,
  DOCTOR_IMAGES,
} = require("./mediaAssets");

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// ---------------------------------------------
// 👋 Greeting Detector and Random Response
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

function getGreeting(isEnglish = false) {
  const englishGreetings = [
    "👋 Hello! Welcome to *Ibtisama Clinic*! How can I assist you today?",
    "Hi there! 😊 How can I help you book an appointment or learn more about our services?",
    "Welcome to *Ibtisama Medical Clinic*! How can I support you today?",
    "Hey! 👋 Glad to see you at *Ibtisama Clinic*! What can I do for you today?",
    "✨ Hello and welcome to *Ibtisama Clinic*! Are you interested in our offers or booking a visit?",
    "Good day! 💚 How can I assist you with your dental or beauty needs today?",
    "😊 Hi! You’ve reached *Ibtisama Clinic*, your smile is our priority!",
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
// 🚫 Ban Words List (English + Arabic)
// ---------------------------------------------
const BAN_WORDS = {
  english: [
    "fuck",
    "fck",
    "fuk",
    "shit",
    "sht",
    "bitch",
    "btch",
    "ass",
    "dick",
    "cock",
    "pussy",
    "cunt",
    "whore",
    "slut",
    "bastard",
    "damn",
    "hell",
    "sex",
    "porn",
    "nude",
    "naked",
    "boobs",
    "breast",
    "penis",
    "vagina",
    "anal",
    "orgasm",
    "masturbate",
    "rape",
    "molest",
    "abuse",
    "sexual",
    "erotic",
    "xxx",
    "nsfw",
    "horny",
    "sexy",
    "hentai",
    "cumming",
    "nigger",
    "nigga",
    "negro",
    "coon",
    "kike",
    "spic",
    "chink",
    "gook",
    "wetback",
    "towelhead",
    "raghead",
    "camel jockey",
    "beaner",
    "paki",
    "curry",
    "cracker",
    "whitey",
    "honky",
    "redskin",
    "savage",
    "colored",
    "oriental",
    "muzzie",
    "terrorist",
    "terrorism",
    "jihad",
    "isis",
    "bomb",
    "explosion",
    "murder",
    "suicide bomber",
    "attack",
    "massacre",
    "extremist",
    "radical",
    "militant",
    "weapon",
    "shoot",
    "knife",
    "stab",
    "violence",
    "threat",
    "hostage",
    "kidnap",
    "al qaeda",
    "alqaeda",
    "taliban",
    "execute",
    "behead",
  ],
  arabic: [
    "كس",
    "عرص",
    "شرموط",
    "قحبة",
    "خول",
    "زب",
    "طيز",
    "نيك",
    "متناك",
    "لعنة",
    "جنس",
    "سكس",
    "عاهرة",
    "زانية",
    "حقير",
    "وسخ",
    "قذر",
    "منيوك",
    "ابن كلب",
    "ابن حرام",
    "كلب",
    "حمار",
    "يا حيوان",
    "يا كلب",
    "خرا",
    "تفو",
    "يخرب بيتك",
    "وقح",
    "قليل ادب",
    "سافل",
    "منيك",
    "كسمك",
    "عرصة",
    "شرموطة",
    "زبي",
    "متناكة",
    "يلعن",
    "كسختك",
    "امشم",
    "مشم",
    "امك",
    "أمك",
    "ابوك",
    "أبوك",
    "اختك",
    "أختك",
    "مرتك",
    "زوجتك",
    "ولاياك",
    "عمتك",
    "خالتك",
    "زنجي",
    "يهودي نجس",
    "صهيوني",
    "كافر نجس",
    "نصراني قذر",
    "رافضي",
    "مجوسي",
    "وثني",
    "ملحد قذر",
    "عنصري",
    "دونية",
    "عرق حقير",
    "سلالة حقيرة",
    "إرهاب",
    "إرهابي",
    "داعش",
    "القاعدة",
    "قنبلة",
    "انفجار",
    "اقتل",
    "ذبح",
    "سلاح",
    "مسدس",
    "رصاص",
    "سكين",
    "طعن",
    "تفجير",
    "انتحاري",
    "هجوم",
    "مذبحة",
    "متطرف",
    "راديكالي",
    "مسلح",
    "عنف",
    "تهديد",
    "رهينة",
    "اختطاف",
    "خطف",
    "تدمير",
    "اعدام",
    "طالبان",
    "فجر",
  ],
};

// ---------------------------------------------
// 🔧 Arabic Normalizer (fix WhatsApp invisible chars)
// ---------------------------------------------
function normalizeArabic(text = "") {
  return text
    .replace(/\u200F/g, "")
    .replace(/\u200E/g, "")
    .replace(/\u0640/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------
// 🚫 Updated Ban Words Detection (final + fixed)
// ---------------------------------------------
function containsBanWords(text = "") {
  if (!text || typeof text !== "string") return false;

  const lower = text.toLowerCase();
  const normalizedArabic = normalizeArabic(text);

  // English words with strict boundaries
  for (const word of BAN_WORDS.english) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lower)) return true;
  }

  // Arabic detection (normalized)
  for (const word of BAN_WORDS.arabic) {
    if (normalizedArabic.includes(word)) return true;
  }

  return false;
}

// ---------------------------------------------
// 🚫 Single Fixed Ban Words Response
// ---------------------------------------------
async function sendBanWordsResponse(to) {
  try {
    await sendTextMessage(
      to,
      "Sorry for your frustration 🙏 Please avoid inappropriate words."
    );
  } catch (err) {
    console.error("❌ Ban words response error:", err.message);
  }
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
// 🌐 Language Detector
// ---------------------------------------------
function isEnglish(text = "") {
  const arabicPattern = /[\u0600-\u06FF]/;
  return !arabicPattern.test(text);
}

// ---------------------------------------------
// 📍 Send Location Message
// ---------------------------------------------
async function sendLocationMessages(to, language = "ar") {
  await sendTextMessage(to, CLINIC_LOCATION_LINK);
  await new Promise((r) => setTimeout(r, 500));
  if (language === "en") {
    await sendTextMessage(
      to,
      `📍 This is our location at ${CLINIC_NAME}. You can open it in Google Maps 🗺️`
    );
  } else {
    await sendTextMessage(
      to,
      `📍 هذا هو موقع ${CLINIC_NAME}. يمكنك الضغط على الرابط لفتحه في خرائط جوجل 🗺️`
    );
  }
}

// ---------------------------------------------
// 📸 Send Image Message (WhatsApp API)
// ---------------------------------------------
async function sendImageMessage(to, imageUrl) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: imageUrl },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error(
      "❌ Failed to send image:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 📅 Send Offers Validity (Smart Date Logic)
// ---------------------------------------------
async function sendOffersValidity(to) {
  const endDate = new Date("2025-12-30"); // <-- change this date only if needed
  const today = new Date();

  const diffTime = endDate - today;

  if (diffTime <= 0) {
    return sendTextMessage(
      to,
      "📅 انتهت عروضنا الحالية. تابعنا للعروض القادمة قريباً 🎉"
    );
  }

  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const daysText =
    days === 1
      ? "يوم واحد"
      : days === 2
      ? "يومين"
      : days >= 3 && days <= 10
      ? `${days} أيام`
      : `${days} يوماً`;

  await sendTextMessage(
    to,
    `📅 عروضنا مستمرة لمدة *${daysText}* حتى تاريخ *${endDate.toLocaleDateString(
      "ar-EG"
    )}*. هل ترغب أن أرسل لك جميع العروض؟`
  );
}

// ---------------------------------------------
// 🎁 Send Offers Images
// ---------------------------------------------
async function sendOffersImages(to, language = "ar") {
  try {
    await sendTextMessage(
      to,
      language === "en"
        ? "💊 Here are our offers and services:"
        : "💊 هذه عروضنا وخدماتنا الحالية:"
    );
    await new Promise((r) => setTimeout(r, 500));
    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1)
        await new Promise((r) => setTimeout(r, 800));
    }
    await new Promise((r) => setTimeout(r, 500));
    await sendTextMessage(
      to,
      language === "en"
        ? "✨ For more details or to book an appointment, just let me know!"
        : "✨ لمزيد من التفاصيل أو لحجز موعد، أخبرني فقط!"
    );
  } catch (err) {
    console.error("❌ Offers images error:", err.message);
  }
}

// ---------------------------------------------
// 👨‍⚕️ Send Doctors Images
// ---------------------------------------------
async function sendDoctorsImages(to, language = "ar") {
  try {
    await sendTextMessage(
      to,
      language === "en"
        ? "👨‍⚕️ Meet our professional medical team:"
        : "👨‍⚕️ تعرف على فريقنا الطبي المتخصص:"
    );
    await new Promise((r) => setTimeout(r, 500));
    for (let i = 0; i < DOCTOR_IMAGES.length; i++) {
      await sendImageMessage(to, DOCTOR_IMAGES[i]);
      if (i < DOCTOR_IMAGES.length - 1)
        await new Promise((r) => setTimeout(r, 800));
    }
    await new Promise((r) => setTimeout(r, 500));
    await sendTextMessage(
      to,
      language === "en"
        ? "✨ Our experienced doctors are here to provide you with the best care! To book an appointment, just let us know 😊"
        : "✨ أطباؤنا ذوو الخبرة هنا لتقديم أفضل رعاية لك! لحجز موعد، فقط أخبرنا 😊"
    );
  } catch (err) {
    console.error("❌ Doctors images error:", err.message);
  }
}

// ---------------------------------------------
// 🧠 Voice Transcription (Groq Whisper)
// ---------------------------------------------
async function transcribeAudio(mediaId) {
  try {
    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const mediaUrl = mediaUrlResponse.data.url;
    if (!mediaUrl) return null;

    const audioResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    const form = new FormData();
    form.append("file", Buffer.from(audioResponse.data), {
      filename: "voice.ogg",
      contentType: "audio/ogg; codecs=opus",
    });
    form.append("model", "whisper-large-v3");
    form.append("language", "ar");
    form.append("response_format", "json");

    const result = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      form,
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          ...form.getHeaders(),
        },
      }
    );
    return result.data.text;
  } catch (err) {
    console.error(
      "❌ Voice transcription failed:",
      err.response?.data || err.message
    );
    return null;
  }
}

// ---------------------------------------------
// ✔ Detect explicit confirmation to send the offers
// ---------------------------------------------
function isOffersConfirmation(text = "") {
  if (!text) return false;

  const normalizedText = text
    .replace(/\u0640/g, "")
    .replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/g, "")
    .trim()
    .toLowerCase();

  const patterns = [
    "ارسل",
    "رسل",
    "أرسل",
    "ابغى",
    "أبغى",
    "ابي",
    "أبي",
    "ايه",
    "إيه",
    "اىه",
    "ايوه",
    "أيوه",
    "نعم",
    "شوف",
    "عرض",
    "ابي العرض",
    "ابي العروض",
    "send",
    "yes",
    "yeah",
    "yup",
    "ok",
    "okay",
    "sure",
    "send it",
    "send offers",
    "send them",
    "show",
    "show me",
    "show offers",
    "i want",
    "i need",
  ];

  return patterns.some((word) => normalizedText.includes(word));
}

// ---------------------------------------------
// Exports
// ---------------------------------------------
module.exports = {
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isEnglish,
  containsBanWords,
  sendBanWordsResponse,
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendImageMessage,
  transcribeAudio,
  isGreeting,
  getGreeting,
  sendOffersValidity,
};
