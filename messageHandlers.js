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
// 🚫 Expanded Ban Words List (No Violence)
// ---------------------------------------------
const BAN_WORDS = {
  english: [
    "fuck",
    "fck",
    "fuk",
    "f***",
    "f.u.c.k",
    "fu*k",
    "f-u-c-k",
    "shit",
    "sht",
    "bitch",
    "btch",
    "b!tch",
    "bish",
    "b!sh",
    "asshole",
    "ass",
    "a$$",
    "dick",
    "d!ck",
    "cock",
    "pussy",
    "cunt",
    "whore",
    "slut",
    "bastard",
    "damn",
    "hell",
    "sex",
    "s3x",
    "porn",
    "p0rn",
    "nude",
    "naked",
    "boobs",
    "breast",
    "penis",
    "vagina",
    "anal",
    "orgasm",
    "masturbate",
    "sexual",
    "erotic",
    "xxx",
    "nsfw",
    "horny",
    "sexy",
    "hentai",
    "cumming",
    "cum",
    "jerk",
    "blowjob",
    "bj",
    "boob",
    "n1gger",
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
    "beaner",
    "paki",
    "cracker",
    "whitey",
    "honky",
    "redskin",
    "savage",
    "colored",
    "oriental",
    "muzzie",
    "camel jockey",
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
    "يا كلب",
    "يا حيوان",
    "خرا",
    "تفو",
    "وقح",
    "قليل ادب",
    "سافل",
    "منيك",
    "كسمك",
    "عرصة",
    "شرموطة",
    "زبي",
    "متناكة",
    "كسختك",
    "يلعن",
    "امشم",
    "مشم",
    "عبد",
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
  ],
};

// ---------------------------------------------
// 🚫 Ban Words Detection Helper
// ---------------------------------------------
function containsBanWords(text = "") {
  if (!text || typeof text !== "string") return false;
  const lowerText = text.toLowerCase();
  const originalText = text;

  for (const word of BAN_WORDS.english) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lowerText)) {
      console.log(`🚫 Detected banned English word: ${word}`);
      return true;
    }
  }

  for (const word of BAN_WORDS.arabic) {
    if (originalText.includes(word)) {
      console.log(`🚫 Detected banned Arabic word: ${word}`);
      return true;
    }
  }

  return false;
}

// ---------------------------------------------
// 💬 Randomized Polite Responses (10 options)
// ---------------------------------------------
const BAN_RESPONSES_AR = [
  "🙏 رجاءً استخدم لغة محترمة، أنا هنا لمساعدتك 😊",
  "🤝 فلنحافظ على الاحترام المتبادل، كيف يمكنني خدمتك اليوم؟",
  "😌 الكلمات اللطيفة تجعل المحادثة أجمل، كيف أقدر أساعدك؟",
  "🙈 يبدو أنك منزعج، خذ نفس عميق وخلينا نكمل بهدوء ❤️",
  "🌿 الاحترام أساس التعامل، وشرف لي أساعدك في أي استفسار!",
  "💬 لا بأس، كلنا نغضب أحيانًا، لكن دعنا نتحدث بطريقة راقية 🙏",
  "🦷 أنا هنا لمساعدتك بمعلومات عن العيادة فقط، فلنحافظ على الأسلوب 👌",
  "😊 نقدر تفهمك، لكن رجاءً تجنب الكلمات المسيئة ❤️",
  "⚠️ دعنا نركز على هدفنا: ابتسامتك الجميلة! 😁",
  "✨ لا داعي للانفعال، أنا موجود لأساعدك بأفضل طريقة ممكنة 🌟",
];

const BAN_RESPONSES_EN = [
  "🙏 Please use polite language. I'm here to help you 😊",
  "🤝 Let's keep our chat respectful. How can I assist you today?",
  "😌 Kind words make conversations better. How may I help you?",
  "🙈 You might be upset, but let's stay calm and continue ❤️",
  "🌿 Respect is key — I’d love to assist you in any way I can!",
  "💬 No worries, emotions happen. Let’s keep it friendly 🙏",
  "🦷 I'm here only for Smiles Clinic info — let’s keep it professional 👌",
  "😊 I understand frustration, but please avoid offensive language ❤️",
  "⚠️ Let’s focus on what matters — your smile 😁",
  "✨ No need for harsh words — I’m happy to assist you 🌟",
];

// ---------------------------------------------
// 🚫 Send Random Ban Words Response
// ---------------------------------------------
async function sendBanWordsResponse(to, language = "ar") {
  try {
    const responses = language === "en" ? BAN_RESPONSES_EN : BAN_RESPONSES_AR;
    const randomResponse =
      responses[Math.floor(Math.random() * responses.length)];
    await sendTextMessage(to, randomResponse);
    console.log(`✅ Sent random ban words response (${language})`);
  } catch (err) {
    console.error("❌ Failed to send ban words response:", err.message);
  }
}

// ---------------------------------------------
// 🗺️ Location Detection Helper
// ---------------------------------------------
function isLocationRequest(text = "") {
  const locationKeywords = [
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
    "clinic",
    "العيادة",
    "وينكم",
    "فينكم",
  ];
  const lowerText = String(text).toLowerCase();
  return locationKeywords.some((keyword) => lowerText.includes(keyword));
}

// ---------------------------------------------
// 🎁 Offers & Services Detection Helper
// ---------------------------------------------
function isOffersRequest(text = "") {
  const offersKeywords = [
    "عروض",
    "خدمات",
    "أسعار",
    "عرض",
    "خدمة",
    "سعر",
    "offers",
    "services",
    "prices",
    "offer",
    "service",
    "price",
  ];
  const lowerText = String(text).toLowerCase();
  return offersKeywords.some((keyword) => lowerText.includes(keyword));
}

// ---------------------------------------------
// 👨‍⚕️ Doctors Detection Helper
// ---------------------------------------------
function isDoctorsRequest(text = "") {
  const doctorsKeywords = [
    "دكتور",
    "دكاترة",
    "طبيب",
    "أطباء",
    "الطبيب",
    "الاطباء",
    "doctor",
    "doctors",
    "physician",
    "dr",
  ];
  const lowerText = String(text).toLowerCase();
  return doctorsKeywords.some((keyword) => lowerText.includes(keyword));
}

// ---------------------------------------------
// 🌐 Language Detection Helper
// ---------------------------------------------
function isEnglish(text = "") {
  const arabicPattern = /[\u0600-\u06FF]/;
  return !arabicPattern.test(String(text));
}

// ---------------------------------------------
// 📍 Send Location Messages
// ---------------------------------------------
async function sendLocationMessages(to, language = "ar") {
  await sendTextMessage(to, CLINIC_LOCATION_LINK);
  await new Promise((r) => setTimeout(r, 500));
  if (language === "en") {
    await sendTextMessage(
      to,
      `📍 This is our location at ${CLINIC_NAME}. You can open it on Google Maps 🗺️`
    );
  } else {
    await sendTextMessage(
      to,
      `📍 هذا هو موقع ${CLINIC_NAME}. يمكنك الضغط على الرابط لفتحه في خرائط جوجل 🗺️`
    );
  }
}

// ---------------------------------------------
// 📸 Send Image Helper (to WhatsApp)
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
    console.error("❌ Failed to send offers images:", err.message || err);
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
        ? "✨ Our doctors are ready to care for your smile! 😊"
        : "✨ أطباؤنا مستعدون للعناية بابتسامتك! 😊"
    );
  } catch (err) {
    console.error("❌ Failed to send doctors images:", err.message || err);
  }
}

// ---------------------------------------------
// 🎧 Voice Transcription (Groq Whisper)
// ---------------------------------------------
async function transcribeAudio(mediaId) {
  try {
    console.log("🎙️ Starting transcription for:", mediaId);
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
// Exports
// ---------------------------------------------
module.exports = {
  isLocationRequest,
  isOffersRequest,
  isDoctorsRequest,
  isEnglish,
  containsBanWords,
  sendBanWordsResponse,
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendImageMessage,
  transcribeAudio,
};
