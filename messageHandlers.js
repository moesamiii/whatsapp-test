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
// 🚫 Ban Words List
// ---------------------------------------------
const BAN_WORDS = {
  // English inappropriate words
  english: [
    // Sexual/Inappropriate
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

    // Racist slurs
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

    // Terrorist/Violence related
    "terrorist",
    "terrorism",
    "jihad",
    "isis",
    "bomb",
    "explosion",
    "kill",
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

  // Arabic inappropriate words
  arabic: [
    // Sexual/Inappropriate
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

    // Racist/Discriminatory
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
    "حقير",
    "سلالة حقيرة",

    // Terrorist/Violence related
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
// 🚫 Ban Words Detection Helper
// ---------------------------------------------
function containsBanWords(text = "") {
  if (!text || typeof text !== "string") return false;

  const lowerText = text.toLowerCase();
  const originalText = text;

  // Check English ban words (case-insensitive)
  for (const word of BAN_WORDS.english) {
    // Use word boundaries to avoid false positives
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lowerText)) {
      console.log(`🚫 Detected banned English word: ${word}`);
      return true;
    }
  }

  // Check Arabic ban words (exact match, Arabic is case-sensitive in nature)
  for (const word of BAN_WORDS.arabic) {
    if (originalText.includes(word)) {
      console.log(`🚫 Detected banned Arabic word: ${word}`);
      return true;
    }
  }

  return false;
}

// ---------------------------------------------
// 🚫 Send Ban Words Response
// ---------------------------------------------
async function sendBanWordsResponse(to, language = "ar") {
  try {
    if (language === "en") {
      await sendTextMessage(
        to,
        "I apologize if you're feeling frustrated. I understand that emotions can run high sometimes. 😊\n\n" +
          "However, I'm here to assist you with information about Smiles Clinic, including:\n" +
          "📍 Our location\n" +
          "💊 Services and offers\n" +
          "👨‍⚕️ Our medical team\n" +
          "📅 Booking appointments\n\n" +
          "Please let me know how I can help you with your dental care needs. 🦷✨"
      );
    } else {
      await sendTextMessage(
        to,
        "أعتذر إذا كنت تشعر بالإحباط. أتفهم أن المشاعر قد تكون قوية أحياناً. 😊\n\n" +
          "ومع ذلك، أنا هنا لمساعدتك بمعلومات حول Smiles Clinic، بما في ذلك:\n" +
          "📍 موقعنا\n" +
          "💊 الخدمات والعروض\n" +
          "👨‍⚕️ فريقنا الطبي\n" +
          "📅 حجز المواعيد\n\n" +
          "من فضلك دعني أعرف كيف يمكنني مساعدتك في احتياجات العناية بأسنانك. 🦷✨"
      );
    }
    console.log("✅ Sent ban words response to user");
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
    "العيادة",
    "clinic",
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
    "الدكتور",
    "الطبيب",
    "doctor",
    "doctors",
    "physician",
    "dr",
    "اطباء",
    "الاطباء",
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
  // First message: Just the link
  await sendTextMessage(to, CLINIC_LOCATION_LINK);

  // Small delay for better UX
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Second message: Explanation
  if (language === "en") {
    await sendTextMessage(
      to,
      `📍 This is our location at ${CLINIC_NAME}. You can click on the link to open it in Google Maps 🗺️`
    );
  } else {
    await sendTextMessage(
      to,
      `📍 هذا هو موقع ${CLINIC_NAME}. يمكنك الضغط على الرابط لفتحه في خرائط جوجل 🗺️`
    );
  }
}

// ---------------------------------------------
// 📸 Send Image Helper (performs network call to WhatsApp)
// ---------------------------------------------
async function sendImageMessage(to, imageUrl) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "image",
        image: {
          link: imageUrl,
        },
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
// 🎁 Send Offers & Services Images (uses OFFER_IMAGES from mediaAssets)
// ---------------------------------------------
async function sendOffersImages(to, language = "ar") {
  try {
    if (language === "en") {
      await sendTextMessage(to, "💊 Here are our offers and services:");
    } else {
      await sendTextMessage(to, "💊 هذه عروضنا وخدماتنا الحالية:");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    if (language === "en") {
      await sendTextMessage(
        to,
        "✨ For more details or to book an appointment, just let me know!"
      );
    } else {
      await sendTextMessage(
        to,
        "✨ لمزيد من التفاصيل أو لحجز موعد، أخبرني فقط!"
      );
    }
  } catch (err) {
    console.error("❌ Failed to send offers images:", err.message || err);
  }
}

// ---------------------------------------------
// 👨‍⚕️ Send Doctors Images (uses DOCTOR_IMAGES from mediaAssets)
// ---------------------------------------------
async function sendDoctorsImages(to, language = "ar") {
  try {
    if (language === "en") {
      await sendTextMessage(to, "👨‍⚕️ Meet our professional medical team:");
    } else {
      await sendTextMessage(to, "👨‍⚕️ تعرف على فريقنا الطبي المتخصص:");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    for (let i = 0; i < DOCTOR_IMAGES.length; i++) {
      await sendImageMessage(to, DOCTOR_IMAGES[i]);
      if (i < DOCTOR_IMAGES.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    if (language === "en") {
      await sendTextMessage(
        to,
        "✨ Our experienced doctors are here to provide you with the best care! To book an appointment, just let us know 😊"
      );
    } else {
      await sendTextMessage(
        to,
        "✨ أطباؤنا ذوو الخبرة هنا لتقديم أفضل رعاية لك! لحجز موعد، فقط أخبرنا 😊"
      );
    }
  } catch (err) {
    console.error("❌ Failed to send doctors images:", err.message || err);
  }
}

// ---------------------------------------------
// 🧠 Voice Transcription Helper (using Groq Whisper)
// ---------------------------------------------
async function transcribeAudio(mediaId) {
  try {
    console.log("🎙️ Starting transcription for media ID:", mediaId);

    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
      }
    );

    const mediaUrl = mediaUrlResponse.data.url;
    if (!mediaUrl) return null;

    const audioResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
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
