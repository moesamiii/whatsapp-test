/**
 * messageHandlers.js
 *
 * Purpose:
 * - Detect user intent from text/voice (location/offers/doctors).
 * - Detect inappropriate content (ban words).
 * - Provide message-sending flows that use media assets (location link, offer images, doctor images).
 * - Perform transcription of audio using Groq Whisper integration.
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
const BAN_WORDS = require("./banWords");

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// ---------------------------------------------
// 🚫 Ban Words Detection Helper
// ---------------------------------------------
function containsBanWords(text = "") {
  if (!text || typeof text !== "string") return false;

  const lowerText = text.toLowerCase();
  const originalText = text;

  // Check English ban words
  for (const word of BAN_WORDS.english) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lowerText)) {
      console.log(`🚫 Detected banned English word: ${word}`);
      return true;
    }
  }

  // Check Arabic ban words
  for (const word of BAN_WORDS.arabic) {
    if (originalText.includes(word)) {
      console.log(`🚫 Detected banned Arabic word: ${word}`);
      return true;
    }
  }

  return false;
}

// ---------------------------------------------
// 🚫 Friendly Ban Words Responses
// ---------------------------------------------
const banResponses = {
  ar: [
    "😅 شكلك متضايق شوي، بس خلنا نرتب الأمور سوا. أقدر أساعدك بمعلومات عن عيادة سمايلز — موقعنا، العروض، أو المواعيد؟ 💬",
    "ولا يهمك، أهم شي نحل المشكلة بهدوء 😌💙 ممكن أعرف كيف أقدر أساعدك بخصوص خدمات الأسنان؟",
    "أفهم إنك ممكن تكون متضايق، بس خلنا نحولها تجربة حلوة ✨ تبي أعرفك على عروضنا أو المواعيد؟",
    "خلنا ننسى الزعل شوي 😄 ونتكلم عن اللي يهمك أكثر — العروض أو حجز موعد؟"
  ],
  en: [
    "Hey, I get it — sometimes things can be frustrating 😅 Let’s reset and figure this out together. Want me to help with booking or offers?",
    "No worries, we all get upset sometimes 🙏 I’m here to help you with anything about Smiles Clinic — our services, doctors, or appointments.",
    "I totally understand how you might feel. Let’s keep it positive 💙 How can I assist you today — location, offers, or booking?",
    "Let’s take a breath 😌 and focus on getting you what you need. Would you like info about our dental services or to book an appointment?"
  ]
};

// ---------------------------------------------
// 🚫 Send Ban Words Response
// ---------------------------------------------
async function sendBanWordsResponse(to, language = "ar") {
  try {
    const responses = banResponses[language] || banResponses["en"];
    const reply = responses[Math.floor(Math.random() * responses.length)];

    await sendTextMessage(to, reply);
    console.log("✅ Sent friendly ban words response to user");
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
  await sendTextMessage(to, CLINIC_LOCATION_LINK);
  await new Promise((r) => setTimeout(r, 500));

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
// 📸 Send Image Helper
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
// 🎁 Send Offers & Services Images
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
        ? "✨ Our experienced doctors are here to provide you with the best care! To book an appointment, just let us know 😊"
        : "✨ أطباؤنا ذوو الخبرة هنا لتقديم أفضل رعاية لك! لحجز موعد، فقط أخبرنا 😊"
    );
  } catch (err) {
    console.error("❌ Failed to send doctors images:", err.message || err);
  }
}

// ---------------------------------------------
// 🧠 Voice Transcription Helper (Groq Whisper)
// ---------------------------------------------
async function transcribeAudio(mediaId) {
  try {
    console.log("🎙️ Starting transcription for media ID:", mediaId);

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
