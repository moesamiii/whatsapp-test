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

// 👨‍⚕️ Doctors Images (Google Drive Direct Links)
const DOCTOR_IMAGES = [
  "https://drive.google.com/uc?export=view&id=1aHoA2ks39qeuMk9WMZOdotOod-agEonm",
  "https://drive.google.com/uc?export=view&id=1Oe2UG2Gas6UY0ORxXtUYvTJeJZ8Br2_R",
  "https://drive.google.com/uc?export=view&id=1_4eDWRuVme3YaLLoeFP_10LYHZyHyjUT",
];

// ---------------------------------------------
// 🚫 Ban Words List - ENHANCED
// ---------------------------------------------
const BAN_WORDS = {
  // English inappropriate words
  english: [
    // Sexual/Inappropriate
    "fuck",
    "fuk",
    "fck",
    "f*ck",
    "f**k",
    "shit",
    "sh*t",
    "shyt",
    "bitch",
    "b*tch",
    "ass",
    "a$$",
    "asshole",
    "dick",
    "d*ck",
    "cock",
    "c*ck",
    "pussy",
    "p*ssy",
    "cunt",
    "c*nt",
    "whore",
    "slut",
    "bastard",
    "damn",
    "damm",
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
    "motherfucker",
    "mofo",
    "wtf",
    "stfu",

    // Racist slurs
    "nigger",
    "nigga",
    "n*gger",
    "n*gga",
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
    "massacre",
    "extremist",
    "radical",
    "militant",
    "weapons",
    "shoot",
    "knife",
    "stab",
    "violence",
    "threat",
    "hostage",
    "kidnap",
  ],

  // Arabic inappropriate words
  arabic: [
    // Sexual/Inappropriate
    "كس",
    "كــس",
    "ك س",
    "عرص",
    "شرموط",
    "شرموطة",
    "قحبة",
    "قحبه",
    "خول",
    "زب",
    "زبي",
    "طيز",
    "نيك",
    "ناك",
    "منيوك",
    "متناك",
    "لعنة",
    "جنس",
    "سكس",
    "عاهرة",
    "عاهره",
    "زانية",
    "حقير",
    "وسخ",
    "قذر",
    "ابن كلب",
    "ابن حرام",
    "ابن الكلب",
    "كلب",
    "حمار",
    "يا حيوان",
    "يا كلب",
    "خرا",
    "خرة",
    "تفو",
    "يخرب بيتك",
    "عيب",
    "حرام عليك",
    "وقح",
    "قليل ادب",
    "قليل أدب",
    "سافل",
    "مشم",
    "امشم",
    "منيك",
    "متناكة",
    "شرموطه",

    // Racist/Discriminatory
    "عبد",
    "زنجي",
    "أسود",
    "يهودي نجس",
    "صهيوني",
    "كافر",
    "نصراني قذر",
    "رافضي",
    "مجوسي",
    "وثني",
    "ملحد قذر",
    "عنصري",
    "دونية",
    "عرق حقير",
    "سلالة",

    // Terrorist/Violence related
    "إرهاب",
    "إرهابي",
    "ارهابي",
    "ارهاب",
    "جهاد",
    "داعش",
    "القاعدة",
    "قنبلة",
    "انفجار",
    "قتل",
    "ذبح",
    "اقتل",
    "سلاح",
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
    "حرب",
    "معركة",
    "غزو",
  ],
};

// ---------------------------------------------
// 🚫 Ban Words Detection Helper - IMPROVED
// ---------------------------------------------
function containsBanWords(text) {
  if (!text || typeof text !== "string") {
    return false;
  }

  // Normalize text: remove extra spaces, trim
  const normalizedText = text.trim().replace(/\s+/g, " ");
  const lowerText = normalizedText.toLowerCase();

  // Check English ban words
  for (const word of BAN_WORDS.english) {
    const lowerWord = word.toLowerCase();

    // Check for exact word match (with word boundaries)
    const wordRegex = new RegExp(`\\b${lowerWord}\\b`, "i");
    if (wordRegex.test(lowerText)) {
      console.log(`🚫 Detected banned English word: "${word}"`);
      return true;
    }

    // Also check for substring match (catches variations)
    if (lowerText.includes(lowerWord)) {
      console.log(`🚫 Detected banned English word (substring): "${word}"`);
      return true;
    }
  }

  // Check Arabic ban words
  for (const word of BAN_WORDS.arabic) {
    // For Arabic, check if the word appears in the text
    if (normalizedText.includes(word)) {
      console.log(`🚫 Detected banned Arabic word: "${word}"`);
      return true;
    }

    // Also check with spaces removed (catches variations like "ك س" instead of "كس")
    const textNoSpaces = normalizedText.replace(/\s/g, "");
    const wordNoSpaces = word.replace(/\s/g, "");
    if (textNoSpaces.includes(wordNoSpaces)) {
      console.log(`🚫 Detected banned Arabic word (no spaces): "${word}"`);
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
    console.log("✅ Ban words response sent successfully");
  } catch (err) {
    console.error("❌ Failed to send ban words response:", err.message);
  }
}

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
  try {
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
  } catch (err) {
    console.error("❌ Failed to send location:", err.message);
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
// 👨‍⚕️ Send Doctors Images
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

    // Send all doctor images with small delays
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
  containsBanWords,
  sendBanWordsResponse,
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendImageMessage,
  transcribeAudio,
  CLINIC_NAME,
  CLINIC_LOCATION_LINK,
};
