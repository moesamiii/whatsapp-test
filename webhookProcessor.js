/**
 * webhookProcessor.js
 *
 * Rewritten for:
 * - Consistent language detection using global.userLanguage
 * - Phone-number exception (preserve user's language when receiving phone)
 * - All outgoing helpers & askAI receive language param
 *
 * Expected helper signatures (update helpers if needed):
 * - transcribeAudio(mediaId) -> string transcript
 * - askAI(text, language)
 * - sendTextMessage(to, message, language)
 * - sendServiceList(to, language)
 * - sendAppointmentOptions(to, language)
 * - saveBooking(booking)
 * - sendLocationMessages(to, language)
 * - sendOffersImages(to, language)
 * - sendDoctorsImages(to, language)
 * - validateNameWithAI(name, language)
 */

const {
  askAI,
  validateNameWithAI,
  sendTextMessage,
  sendServiceList,
  sendAppointmentOptions,
  saveBooking,
} = require("./helpers");

const {
  transcribeAudio,
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  isLocationRequest,
  isOffersRequest,
  isDoctorsRequest,
  isEnglish,
} = require("./messageHandlers");

// Normalize Arabic digits for phone handling
function normalizeArabicDigits(input = "") {
  return input
    .replace(/[^\d٠-٩]/g, "")
    .replace(/٠/g, "0")
    .replace(/١/g, "1")
    .replace(/٢/g, "2")
    .replace(/٣/g, "3")
    .replace(/٤/g, "4")
    .replace(/٥/g, "5")
    .replace(/٦/g, "6")
    .replace(/٧/g, "7")
    .replace(/٨/g, "8")
    .replace(/٩/g, "9");
}

function looksLikePhoneNumberFromTranscript(text = "") {
  const digits = normalizeArabicDigits(text);
  if (/^07\d{8}$/.test(digits)) return true;
  return digits.length >= 7 && digits.length <= 15;
}

// Friday detection helper
function containsFriday(text = "") {
  const fridayWords = ["الجمعة", "Friday", "friday"];
  const lower = text.toLowerCase();
  return fridayWords.some((w) => lower.includes(w.toLowerCase()));
}

// Decide language for audio transcript with phone exception
function decideLanguageForTranscript(from, transcript) {
  global.userLanguage = global.userLanguage || {};
  const prev = global.userLanguage[from];
  const detectedEnglish = isEnglish(transcript);
  const incoming = detectedEnglish ? "en" : "ar";

  // If previous language present and transcript looks like phone -> preserve previous
  if (prev && looksLikePhoneNumberFromTranscript(transcript)) return prev;

  return incoming;
}

async function sendBookingConfirmation(to, booking) {
  const language = booking.language || global.userLanguage[to] || "ar";
  await sendTextMessage(
    to,
    language === "en"
      ? `✅ Booking saved:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
      : `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`,
    language
  );
}

async function handleAudioMessage(message, from) {
  try {
    const tempBookings = (global.tempBookings = global.tempBookings || {});
    global.userLanguage = global.userLanguage || {};

    const mediaId = message?.audio?.id;
    if (!mediaId) return;

    console.log("🎙️ Audio received. Transcribing id:", mediaId);
    const transcript = await transcribeAudio(mediaId);

    if (!transcript) {
      // Fallback - default to Arabic message (or use stored language)
      const language = global.userLanguage[from] || "ar";
      await sendTextMessage(
        from,
        language === "en"
          ? "⚠️ I couldn't understand the voice message, please try again."
          : "⚠️ لم أتمكن من فهم الرسالة الصوتية، حاول مرة أخرى 🎙️",
        language
      );
      return;
    }

    console.log("🗣️ Transcript:", transcript);

    // Decide language for transcript and persist
    const language = decideLanguageForTranscript(from, transcript);
    global.userLanguage[from] = language;

    // If user asked for location / offers / doctors via voice
    if (isLocationRequest(transcript)) {
      await sendLocationMessages(from, language);
      return;
    }

    if (isOffersRequest(transcript)) {
      await sendOffersImages(from, language);
      return;
    }

    if (isDoctorsRequest(transcript)) {
      await sendDoctorsImages(from, language);
      return;
    }

    // Friday detection
    if (containsFriday(transcript)) {
      await sendTextMessage(
        from,
        language === "en"
          ? "📅 Friday is a holiday and the clinic is closed — please choose another day."
          : "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷",
        language
      );

      setTimeout(async () => {
        await sendTextMessage(
          from,
          language === "en"
            ? "📅 Let's start booking — choose a time below 👇"
            : "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇",
          language
        );
        await sendAppointmentOptions(from, language);
      }, 1200);

      return;
    }

    // No active booking
    if (!tempBookings[from]) {
      // voice intents that start booking
      const lower = transcript.toLowerCase();
      if (
        lower.includes("حجز") ||
        lower.includes("book") ||
        lower.includes("موعد") ||
        lower.includes("appointment")
      ) {
        await sendAppointmentOptions(from, language);
        return;
      }

      // AI chat fallback for voice — enforce language
      const reply = await askAI(transcript, language);
      await sendTextMessage(from, reply, language);
      return;
    }

    // Continue booking flow
    // Step: Name validation
    if (tempBookings[from] && !tempBookings[from].name) {
      const isValid = await validateNameWithAI(transcript, language);
      if (!isValid) {
        await sendTextMessage(
          from,
          language === "en"
            ? "⚠️ Please send a real name like: John, Mary..."
            : "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة...",
          language
        );
        return;
      }

      tempBookings[from].name = transcript;
      tempBookings[from].language = language;
      await sendTextMessage(
        from,
        language === "en"
          ? "📱 Great! Now send your phone number:"
          : "📱 ممتاز! الآن أرسل رقم جوالك:",
        language
      );
      return;
    }

    // Step: Phone input
    if (tempBookings[from] && !tempBookings[from].phone) {
      const normalized = normalizeArabicDigits(transcript);
      const isValid = /^07\d{8}$/.test(normalized);

      if (!isValid) {
        await sendTextMessage(
          from,
          language === "en"
            ? "⚠️ Please send a valid Jordanian phone like: 0785050875"
            : "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875",
          language
        );
        return;
      }

      tempBookings[from].phone = normalized;
      tempBookings[from].language = language;

      // send service list & prompt
      await sendServiceList(from, language);
      await sendTextMessage(
        from,
        language === "en"
          ? "💊 Please choose a service from the dropdown above:"
          : "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:",
        language
      );
      return;
    }

    // Step: Service input via voice
    if (tempBookings[from] && !tempBookings[from].service) {
      tempBookings[from].service = transcript;
      tempBookings[from].language = language;
      const booking = tempBookings[from];
      await saveBooking(booking);
      await sendBookingConfirmation(from, booking);
      delete tempBookings[from];
      return;
    }
  } catch (err) {
    console.error("❌ Audio processing failed:", err.message || err);
    // propagate - let the caller decide how to handle HTTP response (webhook handler will respond)
    throw err;
  }
}

module.exports = { handleAudioMessage };
