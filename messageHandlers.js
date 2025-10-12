const axios = require("axios");
const FormData = require("form-data");
const { sendTextMessage } = require("./helpers");

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// ---------------------------------------------
// Clinic Information
// ---------------------------------------------
const CLINIC_NAME = "Smiles Clinic";
const CLINIC_LOCATION_LINK =
  "https://www.google.com/maps?q=32.0290684,35.863774&z=17&hl=en";

// Offers & Services Images (Google Drive Direct Links)
const OFFER_IMAGES = [
  "https://drive.google.com/uc?export=view&id=104QzzCy2U5ujhADK_SD0dGldowwlgVU2",
  "https://drive.google.com/uc?export=view&id=19EsrCSixVa_8trbzFF5lrZJqcue0quDW",
  "https://drive.google.com/uc?export=view&id=17jaUTvf_S2nqApqMlRc3r8q97uPulvDx",
];

// 👨‍⚕️ Doctors Images (Google Drive Direct Links) - Using same as offers
const DOCTOR_IMAGES = [
  "https://drive.google.com/uc?export=view&id=1aHoA2ks39qeuMk9WMZOdotOod-agEonm",
  "https://drive.google.com/uc?export=view&id=1Oe2UG2Gas6UY0ORxXtUYvTJeJZ8Br2_R",
  "https://drive.google.com/uc?export=view&id=1_4eDWRuVme3YaLLoeFP_10LYHZyHyjUT",
];

// ---------------------------------------------
// 🗺️ Location Detection Helper
// ---------------------------------------------
function isLocationRequest(text) {
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
  const lowerText = text.toLowerCase();
  return locationKeywords.some((keyword) => lowerText.includes(keyword));
}

// ---------------------------------------------
// 🎁 Offers & Services Detection Helper
// ---------------------------------------------
function isOffersRequest(text) {
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
  const lowerText = text.toLowerCase();
  return offersKeywords.some((keyword) => lowerText.includes(keyword));
}

// ---------------------------------------------
// 👨‍⚕️ Doctors Detection Helper
// ---------------------------------------------
function isDoctorsRequest(text) {
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
  const lowerText = text.toLowerCase();
  return doctorsKeywords.some((keyword) => lowerText.includes(keyword));
}

// ---------------------------------------------
// 🌐 Language Detection Helper
// ---------------------------------------------
function isEnglish(text) {
  const arabicPattern = /[\u0600-\u06FF]/;
  return !arabicPattern.test(text);
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
// 🎁 Send Offers & Services Images
// ---------------------------------------------
async function sendOffersImages(to, language = "ar") {
  try {
    // Send intro message
    if (language === "en") {
      await sendTextMessage(to, "💊 Here are our offers and services:");
    } else {
      await sendTextMessage(to, "💊 هذه عروضنا وخدماتنا الحالية:");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Send all 3 images with small delays
    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    // Send closing message
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
    console.error("❌ Failed to send offers images:", err.message);
  }
}

// ---------------------------------------------
// 👨‍⚕️ Send Doctors Images (Same as Offers)
// ---------------------------------------------
async function sendDoctorsImages(to, language = "ar") {
  try {
    // Send intro message
    if (language === "en") {
      await sendTextMessage(to, "👨‍⚕️ Meet our professional medical team:");
    } else {
      await sendTextMessage(to, "👨‍⚕️ تعرف على فريقنا الطبي المتخصص:");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Send all doctor images (same as offers) with small delays
    for (let i = 0; i < DOCTOR_IMAGES.length; i++) {
      await sendImageMessage(to, DOCTOR_IMAGES[i]);
      if (i < DOCTOR_IMAGES.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    // Send closing message
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
    console.error("❌ Failed to send doctors images:", err.message);
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
    console.error("❌ Failed to send image:", err.message);
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
    console.error("❌ Voice transcription failed:", err.message);
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
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendImageMessage,
  transcribeAudio,
};
