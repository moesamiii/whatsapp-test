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
// 🚫 Ban Words List (Expanded, No Violence)
// ---------------------------------------------
const BAN_WORDS = {
  english: [
    "fuck",
    "fck",
    "fuk",
    "f***",
    "f.u.c.k",
    "fu*k",
    "shit",
    "sht",
    "bitch",
    "btch",
    "bish",
    "a$$",
    "asshole",
    "ass",
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
// 🚫 Ban Words Detection
// ---------------------------------------------
function containsBanWords(text = "") {
  if (!text || typeof text !== "string") return false;

  const lower = text.toLowerCase();
  const original = text;

  for (const w of BAN_WORDS.english) {
    const regex = new RegExp(`\\b${w}\\b`, "i");
    if (regex.test(lower)) return true;
  }

  for (const w of BAN_WORDS.arabic) {
    if (original.includes(w)) return true;
  }

  return false;
}

// ---------------------------------------------
// 🚫 Randomized Ban Responses
// ---------------------------------------------
const EN_RESPONSES = [
  "🙏 Please use polite language. I'm here to help you 😊",
  "🤝 Let's stay respectful — how can I assist you today?",
  "😌 Kind words make our chat better. How may I help?",
  "🙈 You might be upset, but let's stay calm ❤️",
  "🌿 Respect is key — I’d love to assist you!",
  "💬 No worries, emotions happen. Let’s keep it friendly 🙏",
  "🦷 I'm here for Smiles Clinic info — let’s keep it professional 👌",
  "😊 I understand frustration, but please avoid bad words ❤️",
  "⚠️ Let’s focus on your smile 😁",
  "✨ No need for harsh words — I’m happy to help 🌟",
];

const AR_RESPONSES = [
  "🙏 رجاءً استخدم لغة محترمة، أنا هنا لمساعدتك 😊",
  "🤝 فلنحافظ على الاحترام، كيف يمكنني خدمتك اليوم؟",
  "😌 الكلمات الطيبة تجعل المحادثة أجمل، كيف أقدر أساعدك؟",
  "🙈 يبدو أنك منزعج، خذ نفس وخلينا نكمل بهدوء ❤️",
  "🌿 الاحترام أساس التعامل، وشرف لي أساعدك في أي استفسار!",
  "💬 لا بأس، كلنا نغضب أحيانًا، لكن دعنا نتحدث بلُطف 🙏",
  "🦷 أنا هنا لمساعدتك بمعلومات عن العيادة فقط 👌",
  "😊 أقدر تفهمك، لكن رجاءً تجنب الكلمات المسيئة ❤️",
  "⚠️ دعنا نركز على هدفنا: ابتسامتك الجميلة 😁",
  "✨ لا داعي للانفعال، أنا هنا لخدمتك 🌟",
];

// ---------------------------------------------
// 🚫 Send Random Ban Response
// ---------------------------------------------
async function sendBanWordsResponse(to, language = "ar") {
  try {
    const pool = language === "en" ? EN_RESPONSES : AR_RESPONSES;
    const reply = pool[Math.floor(Math.random() * pool.length)];
    await sendTextMessage(to, reply);
    console.log(`✅ Sent random ban response (${language})`);
  } catch (err) {
    console.error("❌ Failed to send ban words response:", err.message);
  }
}

// ---------------------------------------------
// 🗺️ Location Detection
// ---------------------------------------------
function isLocationRequest(text = "") {
  const keys = [
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
    "العيادة",
    "clinic",
    "وينكم",
    "فينكم",
  ];
  const lower = text.toLowerCase();
  return keys.some((k) => lower.includes(k));
}

// ---------------------------------------------
// 🎁 Offers Detection
// ---------------------------------------------
function isOffersRequest(text = "") {
  const keys = [
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
  const lower = text.toLowerCase();
  return keys.some((k) => lower.includes(k));
}

// ---------------------------------------------
// 👨‍⚕️ Doctors Detection
// ---------------------------------------------
function isDoctorsRequest(text = "") {
  const keys = [
    "دكتور",
    "دكاترة",
    "طبيب",
    "أطباء",
    "doctor",
    "doctors",
    "physician",
    "dr",
  ];
  const lower = text.toLowerCase();
  return keys.some((k) => lower.includes(k));
}

// ---------------------------------------------
// 🌐 Language Detection
// ---------------------------------------------
function isEnglish(text = "") {
  return !/[\u0600-\u06FF]/.test(text);
}

// ---------------------------------------------
// 📍 Send Location
// ---------------------------------------------
async function sendLocationMessages(to, language = "ar") {
  await sendTextMessage(to, CLINIC_LOCATION_LINK);
  await new Promise((r) => setTimeout(r, 400));
  await sendTextMessage(
    to,
    language === "en"
      ? `📍 This is our location at ${CLINIC_NAME}. You can open it on Google Maps 🗺️`
      : `📍 هذا هو موقع ${CLINIC_NAME}. يمكنك الضغط على الرابط لفتحه في خرائط جوجل 🗺️`
  );
}

// ---------------------------------------------
// 📸 Send Image to WhatsApp
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
    console.error("❌ Image send failed:", err.response?.data || err.message);
  }
}

// ---------------------------------------------
// 🎁 Send Offers Images
// ---------------------------------------------
async function sendOffersImages(to, lang = "ar") {
  try {
    await sendTextMessage(
      to,
      lang === "en"
        ? "💊 Here are our offers and services:"
        : "💊 هذه عروضنا وخدماتنا الحالية:"
    );

    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1)
        await new Promise((r) => setTimeout(r, 800));
    }

    await new Promise((r) => setTimeout(r, 400));
    await sendTextMessage(
      to,
      lang === "en"
        ? "✨ For more details or to book an appointment, just let me know!"
        : "✨ لمزيد من التفاصيل أو لحجز موعد، أخبرني فقط!"
    );
  } catch (err) {
    console.error("❌ Offers send failed:", err.message);
  }
}

// ---------------------------------------------
// 👨‍⚕️ Send Doctors Images
// ---------------------------------------------
async function sendDoctorsImages(to, lang = "ar") {
  try {
    await sendTextMessage(
      to,
      lang === "en"
        ? "👨‍⚕️ Meet our professional medical team:"
        : "👨‍⚕️ تعرف على فريقنا الطبي المتخصص:"
    );

    await new Promise((r) => setTimeout(r, 400));
    for (let i = 0; i < DOCTOR_IMAGES.length; i++) {
      await sendImageMessage(to, DOCTOR_IMAGES[i]);
      if (i < DOCTOR_IMAGES.length - 1)
        await new Promise((r) => setTimeout(r, 800));
    }

    await new Promise((r) => setTimeout(r, 400));
    await sendTextMessage(
      to,
      lang === "en"
        ? "✨ Our doctors are ready to care for your smile! 😊"
        : "✨ أطباؤنا مستعدون للعناية بابتسامتك! 😊"
    );
  } catch (err) {
    console.error("❌ Doctors send failed:", err.message);
  }
}

// ---------------------------------------------
// 🧠 Voice Transcription
// ---------------------------------------------
async function transcribeAudio(mediaId) {
  try {
    console.log("🎙️ Transcribing:", mediaId);
    const mediaUrlRes = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const url = mediaUrlRes.data.url;
    if (!url) return null;

    const audioRes = await axios.get(url, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    const form = new FormData();
    form.append("file", Buffer.from(audioRes.data), {
      filename: "voice.ogg",
      contentType: "audio/ogg; codecs=opus",
    });
    form.append("model", "whisper-large-v3");
    form.append("language", "ar");
    form.append("response_format", "json");

    const res = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      form,
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          ...form.getHeaders(),
        },
      }
    );

    return res.data.text;
  } catch (err) {
    console.error("❌ Transcription error:", err.response?.data || err.message);
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
