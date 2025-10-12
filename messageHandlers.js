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
// 🚫 ADVANCED BAN WORDS SYSTEM
// ---------------------------------------------

// Helper function to generate variations of words with special characters
function generateVariations(word) {
  const variations = [word];

  // Add spaced version (e.g., "fuck" -> "f u c k")
  variations.push(word.split("").join(" "));

  // Add version with asterisks (e.g., "fuck" -> "f*ck", "f**k")
  if (word.length > 2) {
    variations.push(word[0] + "*" + word.slice(2));
    variations.push(word[0] + "**" + word.slice(3));
    variations.push(word.slice(0, 2) + "*" + word.slice(3));
  }

  // Add version with numbers (e.g., "ass" -> "a$$", "shit" -> "sh1t")
  const leetSpeak = word
    .replace(/a/gi, "[@4]")
    .replace(/e/gi, "[3]")
    .replace(/i/gi, "[1!]")
    .replace(/o/gi, "[0]")
    .replace(/s/gi, "[$5]");

  return variations;
}

// English Ban Words - Comprehensive List
const BAN_WORDS = {
  english: [
    // Profanity - Base words (variations auto-generated)
    "fuck",
    "fuk",
    "fck",
    "fuq",
    "fvck",
    "phuck",
    "shit",
    "shyt",
    "shiz",
    "shite",
    "crap",
    "bitch",
    "biotch",
    "biatch",
    "b1tch",
    "ass",
    "arse",
    "asshole",
    "arsehole",
    "a$$hole",
    "dick",
    "dik",
    "d1ck",
    "dickhead",
    "cock",
    "cok",
    "c0ck",
    "pussy",
    "pusssy",
    "pusi",
    "cunt",
    "cnt",
    "c*nt",
    "whore",
    "hore",
    "wh0re",
    "slut",
    "sl*t",
    "slvt",
    "bastard",
    "bstard",
    "b@stard",
    "damn",
    "damm",
    "dam",
    "hell",
    "hel",
    "piss",
    "p1ss",

    // Sexual content
    "sex",
    "s3x",
    "sexx",
    "porn",
    "p0rn",
    "pron",
    "nude",
    "nudes",
    "naked",
    "boobs",
    "boob",
    "tits",
    "titties",
    "breast",
    "breasts",
    "penis",
    "pen1s",
    "d1ck",
    "vagina",
    "vag1na",
    "pussy",
    "anal",
    "@nal",
    "orgasm",
    "0rgasm",
    "masturbate",
    "masterbate",
    "fap",
    "rape",
    "r@pe",
    "molest",
    "m0lest",
    "sexual",
    "s3xual",
    "erotic",
    "er0tic",
    "xxx",
    "nsfw",
    "horny",
    "h0rny",
    "sexy",
    "s3xy",
    "motherfucker",
    "mofo",
    "mf",
    "muthafucka",
    "wtf",
    "stfu",
    "gtfo",
    "omfg",
    "blowjob",
    "bj",
    "cumshot",
    "jizz",

    // Extreme profanity
    "cocksucker",
    "c0cksucker",
    "motherfucking",
    "muthafucking",
    "shithead",
    "sh1thead",
    "dipshit",
    "d1pshit",
    "dumbass",
    "dumb@ss",
    "jackass",
    "jack@ss",

    // Racial slurs (important to block)
    "nigger",
    "nigga",
    "n1gger",
    "n1gga",
    "nig",
    "negro",
    "coon",
    "c00n",
    "kike",
    "k1ke",
    "spic",
    "sp1c",
    "chink",
    "ch1nk",
    "gook",
    "g00k",
    "wetback",
    "wet back",
    "towelhead",
    "towel head",
    "raghead",
    "rag head",
    "camel jockey",
    "beaner",
    "bean3r",
    "paki",
    "p@ki",
    "curry muncher",
    "cracker",
    "cr@cker",
    "whitey",
    "wh1tey",
    "honky",
    "h0nky",
    "redskin",
    "red skin",
    "savage",
    "s@vage",
    "colored",
    "oriental",
    "muzzie",
    "muzzy",

    // Violence/Terrorism
    "terrorist",
    "terr0rist",
    "terrorism",
    "terr0rism",
    "jihad",
    "j1had",
    "isis",
    "1sis",
    "isil",
    "bomb",
    "b0mb",
    "bomber",
    "explosion",
    "expl0sion",
    "kill",
    "k1ll",
    "killing",
    "murder",
    "suicide bomber",
    "massacre",
    "mass@cre",
    "extremist",
    "extrem1st",
    "radical",
    "r@dical",
    "militant",
    "m1litant",
    "weapon",
    "weapons",
    "we@pon",
    "shoot",
    "sh00t",
    "shooter",
    "knife",
    "kn1fe",
    "stab",
    "violence",
    "v1olence",
    "threat",
    "threaten",
    "hostage",
    "h0stage",
    "kidnap",
    "k1dnap",
  ],

  // Arabic Ban Words - Comprehensive with All Variations
  arabic: [
    // Sexual/Profanity - With ALL possible variations
    "كس",
    "كــس",
    "ك س",
    "ك  س",
    "كـس",
    "كـــس",
    "ك ــس",
    "عرص",
    "عــرص",
    "ع رص",
    "ع ر ص",
    "عـرص",
    "شرموط",
    "شرموطة",
    "شرموطه",
    "شــرموط",
    "ش رموط",
    "شرمـوط",
    "شرم0ط",
    "قحبة",
    "قحبه",
    "قــحبة",
    "ق حبة",
    "ق ح ب ة",
    "قـحبة",
    "خول",
    "خــول",
    "خ ول",
    "خـول",
    "زب",
    "زبي",
    "زبك",
    "زبه",
    "ز ب",
    "زبـ",
    "طيز",
    "طــيز",
    "ط يز",
    "ط ي ز",
    "طـيز",
    "نيك",
    "ناك",
    "نايك",
    "منيوك",
    "متناك",
    "نــيك",
    "ن يك",
    "نـيك",
    "ني ك",
    "متناكة",
    "منيكة",
    "نياكة",
    "لعنة",
    "لعنه",
    "لــعنة",
    "جنس",
    "جنسي",
    "جنسية",
    "ج نس",
    "سكس",
    "سكسي",
    "سـكس",
    "س كس",
    "عاهرة",
    "عاهره",
    "عــاهرة",
    "ع اهرة",
    "زانية",
    "زانيه",
    "زاني",
    "حقير",
    "حقيرة",
    "حـقير",
    "وسخ",
    "وسخة",
    "وســخ",
    "قذر",
    "قذرة",
    "قـذر",
    "منيوك",
    "منيوكة",
    "ابن كلب",
    "ابن الكلب",
    "بن كلب",
    "ابن  كلب",
    "ابن حرام",
    "ابن الحرام",
    "بن حرام",
    "ابن قحبة",
    "ابن القحبة",
    "بن قحبة",
    "كلب",
    "كلبة",
    "كــلب",
    "ك لب",
    "حمار",
    "حمارة",
    "حـمار",
    "ح مار",
    "يا حيوان",
    "ياحيوان",
    "يا  حيوان",
    "يا كلب",
    "ياكلب",
    "يا حمار",
    "ياحمار",
    "خرا",
    "خراء",
    "خرة",
    "خــرا",
    "خ را",
    "تفو",
    "تف",
    "تفوا",
    "يخرب بيتك",
    "يخرب  بيتك",
    "عيب",
    "عــيب",
    "حرام عليك",
    "حرام  عليك",
    "وقح",
    "وقحة",
    "وقــح",
    "قليل ادب",
    "قليل أدب",
    "قليل  ادب",
    "قليلة ادب",
    "سافل",
    "سافلة",
    "ساف ل",
    "مشم",
    "مشمش",
    "امشم",
    "مـشم",
    "م شم",
    "مشـم",
    "امشم",
    "ا مشم",
    "ام شم",
    "منيك",
    "منيكة",
    "منــيك",
    "شرموطه",
    "شرم0طة",
    "متناكة",
    "متناك",
    "متناكه",
    "يلعن",
    "يلعن دينك",
    "يلعن ربك",
    "لعنة الله",
    "لعنة  الله",

    // Insults - Common Arabic Curse Words
    "احا",
    "اح",
    "احااا",
    "كسمك",
    "كسمـك",
    "كس امك",
    "كس  امك",
    "كس اختك",
    "كس  اختك",
    "كساختك",
    "يا ابن الكلب",
    "يا  ابن  الكلب",
    "يا ابن القحبة",
    "يا  ابن  القحبة",
    "روح كل خرا",
    "كل خرا",
    "كل  خرا",
    "امك",
    "ام ك",
    "اخ تك",
    "اختك",

    // Racist/Discriminatory
    "عبد",
    "عبيد",
    "عــبد",
    "ع بد",
    "زنجي",
    "زنجية",
    "زنـجي",
    "أسود",
    "اسود",
    "سود",
    "يهودي نجس",
    "يهودي  نجس",
    "صهيوني",
    "صهيونية",
    "صهي0ني",
    "كافر",
    "كفار",
    "كافرة",
    "كــافر",
    "نصراني قذر",
    "نصراني  قذر",
    "رافضي",
    "رافضية",
    "روافض",
    "مجوسي",
    "مج0سي",
    "وثني",
    "وثنية",
    "ملحد قذر",
    "ملحد  قذر",
    "ملحد",
    "عنصري",
    "عنصرية",
    "عنـصري",
    "دونية",
    "دوني",
    "عرق حقير",
    "عرق  حقير",
    "سلالة",
    "سلالة حقيرة",

    // Violence/Terrorism
    "إرهاب",
    "ارهاب",
    "إرهـاب",
    "ار هاب",
    "إرهابي",
    "ارهابي",
    "إرهابية",
    "ارهابية",
    "جهاد",
    "جهادي",
    "جهـاد",
    "داعش",
    "داع ش",
    "دا عش",
    "القاعدة",
    "القاع دة",
    "قاعدة",
    "قنبلة",
    "قنابل",
    "قنـبلة",
    "انفجار",
    "إنفجار",
    "انفـجار",
    "قتل",
    "قاتل",
    "قتال",
    "قـتل",
    "ق تل",
    "ذبح",
    "ذابح",
    "مذبحة",
    "ذبـح",
    "اقتل",
    "إقتل",
    "اقـتل",
    "سلاح",
    "أسلحة",
    "سلـاح",
    "رصاص",
    "رصاصة",
    "رصـاص",
    "سكين",
    "سكاكين",
    "سكـين",
    "طعن",
    "طاعن",
    "طعـن",
    "تفجير",
    "تفجيري",
    "تفـجير",
    "انتحاري",
    "إنتحاري",
    "انتـحاري",
    "هجوم",
    "هجمات",
    "هجـوم",
    "مذبحة",
    "مذابح",
    "مذبـحة",
    "متطرف",
    "متطرفة",
    "متطـرف",
    "راديكالي",
    "راديكالية",
    "مسلح",
    "مسلحة",
    "مسلحين",
    "عنف",
    "عنيف",
    "عنـف",
    "تهديد",
    "تهديدات",
    "تهـديد",
    "رهينة",
    "رهائن",
    "رهيـنة",
    "اختطاف",
    "إختطاف",
    "اخـتطاف",
    "خطف",
    "خاطف",
    "خطـف",
    "تدمير",
    "تدميري",
    "تدـمير",
    "حرب",
    "حروب",
    "حـرب",
    "معركة",
    "معارك",
    "معـركة",
    "غزو",
    "غازي",
    "غزوة",
  ],
};

// ---------------------------------------------
// 🔍 ADVANCED BAN WORDS DETECTION - ULTRA SENSITIVE
// ---------------------------------------------
function containsBanWords(text) {
  if (!text || typeof text !== "string") {
    return false;
  }

  // Normalize text: remove extra spaces, trim, and normalize Arabic characters
  let normalizedText = text.trim().replace(/\s+/g, " ");

  // Normalize Arabic text (remove diacritics/tashkeel)
  const arabicNormalized = normalizedText
    .replace(/[\u064B-\u065F]/g, "") // Remove Arabic diacritics
    .replace(/آ|أ|إ/g, "ا") // Normalize alef variations
    .replace(/ى/g, "ي") // Normalize yeh
    .replace(/ة/g, "ه"); // Normalize teh marbuta

  const lowerText = normalizedText.toLowerCase();

  // ==========================================
  // CHECK ENGLISH BAN WORDS
  // ==========================================
  for (const word of BAN_WORDS.english) {
    const lowerWord = word.toLowerCase();

    // Method 1: Exact word match with word boundaries
    const exactMatch = new RegExp(`\\b${escapeRegex(lowerWord)}\\b`, "i");
    if (exactMatch.test(lowerText)) {
      console.log(`🚫 BANNED [English/Exact]: "${word}"`);
      return true;
    }

    // Method 2: Substring match (for words within other text)
    if (lowerText.includes(lowerWord)) {
      console.log(`🚫 BANNED [English/Substring]: "${word}"`);
      return true;
    }

    // Method 3: Check with spaces removed (e.g., "f u c k" -> "fuck")
    const textNoSpaces = lowerText.replace(/\s/g, "");
    const wordNoSpaces = lowerWord.replace(/\s/g, "");
    if (textNoSpaces.includes(wordNoSpaces)) {
      console.log(`🚫 BANNED [English/NoSpaces]: "${word}"`);
      return true;
    }

    // Method 4: Check with special characters removed
    const textAlphaOnly = lowerText.replace(/[^a-z0-9]/g, "");
    const wordAlphaOnly = lowerWord.replace(/[^a-z0-9]/g, "");
    if (textAlphaOnly.includes(wordAlphaOnly)) {
      console.log(`🚫 BANNED [English/AlphaOnly]: "${word}"`);
      return true;
    }
  }

  // ==========================================
  // CHECK ARABIC BAN WORDS
  // ==========================================
  for (const word of BAN_WORDS.arabic) {
    // Method 1: Direct match in normalized text
    if (normalizedText.includes(word)) {
      console.log(`🚫 BANNED [Arabic/Direct]: "${word}"`);
      return true;
    }

    // Method 2: Match in Arabic normalized (without diacritics)
    if (arabicNormalized.includes(word)) {
      console.log(`🚫 BANNED [Arabic/Normalized]: "${word}"`);
      return true;
    }

    // Method 3: Check with all spaces removed (catches "ك س" as "كس")
    const textNoSpaces = normalizedText.replace(/\s/g, "");
    const wordNoSpaces = word.replace(/\s/g, "");
    if (textNoSpaces.includes(wordNoSpaces)) {
      console.log(`🚫 BANNED [Arabic/NoSpaces]: "${word}"`);
      return true;
    }

    // Method 4: Check with special characters and spaces removed
    const textArabicOnly = normalizedText.replace(/[^\u0600-\u06FF]/g, "");
    const wordArabicOnly = word.replace(/[^\u0600-\u06FF]/g, "");
    if (textArabicOnly.includes(wordArabicOnly)) {
      console.log(`🚫 BANNED [Arabic/ArabicOnly]: "${word}"`);
      return true;
    }

    // Method 5: Fuzzy match for Arabic (allows 1 character difference)
    if (fuzzyMatch(normalizedText, word)) {
      console.log(`🚫 BANNED [Arabic/Fuzzy]: "${word}"`);
      return true;
    }
  }

  return false;
}

// Helper: Escape special regex characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper: Fuzzy matching for Arabic (catches slight variations)
function fuzzyMatch(text, word) {
  if (word.length < 3) return false; // Skip short words for fuzzy matching

  // Check if word appears with slight variations (1 extra/missing char)
  for (let i = 0; i <= text.length - word.length + 1; i++) {
    const substring = text.substr(i, word.length + 1);
    let differences = 0;

    for (let j = 0; j < Math.min(substring.length, word.length); j++) {
      if (substring[j] !== word[j]) {
        differences++;
      }
    }

    if (differences <= 1) {
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
    console.log("✅ Ban words response sent successfully to:", to);
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
    "اين",
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
    await sendTextMessage(to, CLINIC_LOCATION_LINK);
    await new Promise((resolve) => setTimeout(resolve, 500));

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
    console.error("❌ Failed to send offers images:", err.message);
  }
}

// ---------------------------------------------
// 👨‍⚕️ Send Doctors Images
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
