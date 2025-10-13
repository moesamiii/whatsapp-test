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
 * - sendBanWordsResponse: handles inappropriate content gracefully with 10 random responses
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
    "امشم",
    "مشم",

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
// 🚫 Random Ban Words Responses (10 variations)
// ---------------------------------------------
const BAN_WORDS_RESPONSES = {
  english: [
    "I apologize if you're feeling frustrated. I understand that emotions can run high sometimes. 😊\n\n" +
      "However, I'm here to assist you with information about Smiles Clinic, including:\n" +
      "📍 Our location\n" +
      "💊 Services and offers\n" +
      "👨‍⚕️ Our medical team\n" +
      "📅 Booking appointments\n\n" +
      "Please let me know how I can help you with your dental care needs. 🦷✨",

    "I understand you might be upset, and that's okay. 🤗\n\n" +
      "I'm here to help you with:\n" +
      "🏥 Information about Smiles Clinic\n" +
      "📍 Finding our location\n" +
      "💰 Current offers and pricing\n" +
      "👨‍⚕️ Meeting our doctors\n\n" +
      "Let's focus on how I can assist you today! 😊",

    "Hey there! I sense some tension. Let's take a deep breath together. 😌\n\n" +
      "I'm designed to help you with:\n" +
      "✨ Dental care information\n" +
      "📍 Clinic location and directions\n" +
      "🎁 Special offers\n" +
      "👨‍⚕️ Our expert team\n\n" +
      "How can I make your day better? 🦷💙",

    "I appreciate your honesty, even when frustrated. 💭\n\n" +
      "Let me redirect our conversation to something helpful:\n" +
      "🔹 Clinic services and treatments\n" +
      "🔹 Location and contact info\n" +
      "🔹 Special promotions\n" +
      "🔹 Appointment booking\n\n" +
      "What would you like to know? 😊",

    "Sometimes we all need to let off steam, I get it! 🌈\n\n" +
      "But I'm here for more positive things like:\n" +
      "🦷 Professional dental care info\n" +
      "📍 Easy directions to our clinic\n" +
      "💎 Exclusive offers\n" +
      "👨‍⚕️ Qualified doctors\n\n" +
      "Shall we start fresh? I'm here to help! ✨",

    "I understand emotions can be overwhelming sometimes. 🫂\n\n" +
      "Let me help you with practical information:\n" +
      "📌 Smiles Clinic location\n" +
      "💼 Services we provide\n" +
      "🎯 Current promotions\n" +
      "👥 Our medical professionals\n\n" +
      "What brings you here today? 😊",

    "No worries! Let's turn this around together. 🔄\n\n" +
      "I can assist you with:\n" +
      "🏥 Comprehensive dental services\n" +
      "🗺️ How to find us\n" +
      "💝 Special deals\n" +
      "👨‍⚕️ Our experienced team\n\n" +
      "How may I help with your dental needs? 🦷",

    "I'm here to help, not to judge. 😊\n\n" +
      "Let me share what I can do for you:\n" +
      "✅ Provide clinic information\n" +
      "✅ Share our location\n" +
      "✅ Show current offers\n" +
      "✅ Introduce our doctors\n\n" +
      "What information would be most useful for you? 💙",

    "Every conversation is a fresh start! 🌟\n\n" +
      "I'm here to help you with:\n" +
      "🔸 Finding Smiles Clinic\n" +
      "🔸 Learning about our services\n" +
      "🔸 Discovering special offers\n" +
      "🔸 Connecting with our doctors\n\n" +
      "What can I assist you with today? 😊",

    "Let's keep things respectful and productive! 🤝\n\n" +
      "I'm available to help you with:\n" +
      "🌟 Dental care information\n" +
      "🗺️ Clinic location details\n" +
      "🎁 Ongoing promotions\n" +
      "👨‍⚕️ Our professional staff\n\n" +
      "How can I support your dental health journey? 🦷✨",
  ],

  arabic: [
    "أعتذر إذا كنت تشعر بالإحباط. أتفهم أن المشاعر قد تكون قوية أحياناً. 😊\n\n" +
      "ومع ذلك، أنا هنا لمساعدتك بمعلومات حول Smiles Clinic، بما في ذلك:\n" +
      "📍 موقعنا\n" +
      "💊 الخدمات والعروض\n" +
      "👨‍⚕️ فريقنا الطبي\n" +
      "📅 حجز المواعيد\n\n" +
      "من فضلك دعني أعرف كيف يمكنني مساعدتك في احتياجات العناية بأسنانك. 🦷✨",

    "أتفهم أنك قد تكون منزعجاً، وهذا طبيعي. 🤗\n\n" +
      "أنا هنا لمساعدتك في:\n" +
      "🏥 معلومات عن Smiles Clinic\n" +
      "📍 إيجاد موقعنا\n" +
      "💰 العروض والأسعار الحالية\n" +
      "👨‍⚕️ التعرف على أطبائنا\n\n" +
      "دعنا نركز على كيف يمكنني مساعدتك اليوم! 😊",

    "مرحباً! أشعر ببعض التوتر. لنأخذ نفساً عميقاً معاً. 😌\n\n" +
      "أنا مصمم لمساعدتك في:\n" +
      "✨ معلومات العناية بالأسنان\n" +
      "📍 موقع العيادة والاتجاهات\n" +
      "🎁 العروض الخاصة\n" +
      "👨‍⚕️ فريقنا المتخصص\n\n" +
      "كيف يمكنني أن أجعل يومك أفضل؟ 🦷💙",

    "أقدر صراحتك، حتى عند الإحباط. 💭\n\n" +
      "دعني أوجه محادثتنا إلى شيء مفيد:\n" +
      "🔹 خدمات العيادة والعلاجات\n" +
      "🔹 الموقع ومعلومات الاتصال\n" +
      "🔹 العروض الترويجية الخاصة\n" +
      "🔹 حجز المواعيد\n\n" +
      "ماذا تريد أن تعرف؟ 😊",

    "في بعض الأحيان نحتاج جميعاً لتنفيس عن الضغط، أفهم ذلك! 🌈\n\n" +
      "لكنني هنا لأشياء أكثر إيجابية مثل:\n" +
      "🦷 معلومات العناية المهنية بالأسنان\n" +
      "📍 اتجاهات سهلة لعيادتنا\n" +
      "💎 عروض حصرية\n" +
      "👨‍⚕️ أطباء مؤهلون\n\n" +
      "هل نبدأ من جديد؟ أنا هنا للمساعدة! ✨",

    "أفهم أن العواطف يمكن أن تكون طاغية في بعض الأحيان. 🫂\n\n" +
      "دعني أساعدك بمعلومات عملية:\n" +
      "📌 موقع Smiles Clinic\n" +
      "💼 الخدمات التي نقدمها\n" +
      "🎯 العروض الحالية\n" +
      "👥 محترفينا الطبيين\n\n" +
      "ما الذي يجلبك هنا اليوم؟ 😊",

    "لا تقلق! دعنا نغير هذا معاً. 🔄\n\n" +
      "يمكنني مساعدتك في:\n" +
      "🏥 خدمات الأسنان الشاملة\n" +
      "🗺️ كيفية العثور علينا\n" +
      "💝 صفقات خاصة\n" +
      "👨‍⚕️ فريقنا ذو الخبرة\n\n" +
      "كيف يمكنني المساعدة في احتياجاتك لطب الأسنان؟ 🦷",

    "أنا هنا للمساعدة، لا للحكم. 😊\n\n" +
      "دعني أشارك ما يمكنني القيام به من أجلك:\n" +
      "✅ تقديم معلومات العيادة\n" +
      "✅ مشاركة موقعنا\n" +
      "✅ عرض العروض الحالية\n" +
      "✅ تقديم أطبائنا\n\n" +
      "ما المعلومات التي ستكون أكثر فائدة لك؟ 💙",

    "كل محادثة هي بداية جديدة! 🌟\n\n" +
      "أنا هنا لمساعدتك في:\n" +
      "🔸 إيجاد Smiles Clinic\n" +
      "🔸 التعرف على خدماتنا\n" +
      "🔸 اكتشاف العروض الخاصة\n" +
      "🔸 التواصل مع أطبائنا\n\n" +
      "بماذا يمكنني مساعدتك اليوم؟ 😊",

    "دعنا نحافظ على الأمور محترمة ومنتجة! 🤝\n\n" +
      "أنا متاح لمساعدتك في:\n" +
      "🌟 معلومات العناية بالأسنان\n" +
      "🗺️ تفاصيل موقع العيادة\n" +
      "🎁 العروض الجارية\n" +
      "👨‍⚕️ طاقمنا المحترف\n\n" +
      "كيف يمكنني دعم رحلة صحة أسنانك؟ 🦷✨",
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
// 🚫 Send Ban Words Response (Random from 10 variations)
// ---------------------------------------------
async function sendBanWordsResponse(to, language = "ar") {
  try {
    const responses =
      language === "en"
        ? BAN_WORDS_RESPONSES.english
        : BAN_WORDS_RESPONSES.arabic;

    // Get random response from the 10 available
    const randomIndex = Math.floor(Math.random() * responses.length);
    const selectedResponse = responses[randomIndex];

    await sendTextMessage(to, selectedResponse);

    console.log(
      `✅ Sent ban words response #${randomIndex + 1} to user (${language})`
    );
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
