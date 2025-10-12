/**
 * webhookProcessor.js
 *
 * Fixes applied:
 * - Phone-number exception: preserve booking.language (or global.userLanguage) when transcript is phone-like.
 * - All outgoing calls pass `language`.
 * - Ensures service list is sent with resolved language.
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

// Normalize Arabic digits
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

function containsFriday(text = "") {
  const fridayWords = ["الجمعة", "Friday", "friday"];
  const lower = text.toLowerCase();
  return fridayWords.some((w) => lower.includes(w.toLowerCase()));
}

// Decide language for transcript: prefer booking.lang, then global.userLanguage, else detect.
// Also preserve when transcript looks like phone and booking/global language exists.
function decideLanguageForTranscript(from, transcript) {
  global.userLanguage = global.userLanguage || {};
  const tempBookings = (global.tempBookings = global.tempBookings || {});
  const bookingLang = tempBookings[from]?.language;
  const prevLang = global.userLanguage[from];
  const incoming = isEnglish(transcript) ? "en" : "ar";

  if (bookingLang) {
    if (looksLikePhoneNumberFromTranscript(transcript)) return bookingLang;
    return bookingLang;
  }

  if (prevLang && looksLikePhoneNumberFromTranscript(transcript))
    return prevLang;

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

    const transcript = await transcribeAudio(mediaId);

    if (!transcript) {
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

    // Decide language with booking/global preservation for phone-like transcripts
    const language = decideLanguageForTranscript(from, transcript);
    global.userLanguage[from] = global.userLanguage[from] || language;
    if (tempBookings[from])
      tempBookings[from].language = tempBookings[from].language || language;

    // shortcuts
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

    // Friday
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

    // No active booking -> either start booking or AI chat
    if (!tempBookings[from]) {
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
      const reply = await askAI(transcript, language);
      await sendTextMessage(from, reply, language);
      return;
    }

    // Continue booking
    // Name step
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
      tempBookings[from].language = tempBookings[from].language || language;
      global.userLanguage[from] = global.userLanguage[from] || language;

      await sendTextMessage(
        from,
        language === "en"
          ? "📱 Great! Now send your phone number:"
          : "📱 ممتاز! الآن أرسل رقم جوالك:",
        language
      );
      return;
    }

    // Phone step
    if (tempBookings[from] && !tempBookings[from].phone) {
      // Resolve language but do not let digits flip it
      const bookingLang = tempBookings[from].language;
      const storedLang = global.userLanguage[from];
      const resolvedLanguage = bookingLang || storedLang || language;

      const normalized = normalizeArabicDigits(transcript);
      const isValid = /^07\d{8}$/.test(normalized);

      if (!isValid) {
        await sendTextMessage(
          from,
          resolvedLanguage === "en"
            ? "⚠️ Please send a valid Jordanian phone like: 0785050875"
            : "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875",
          resolvedLanguage
        );
        return;
      }

      tempBookings[from].phone = normalized;
      tempBookings[from].language = resolvedLanguage;
      global.userLanguage[from] = resolvedLanguage;

      await sendServiceList(from, resolvedLanguage);
      await sendTextMessage(
        from,
        resolvedLanguage === "en"
          ? "💊 Please choose a service from the dropdown above:"
          : "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:",
        resolvedLanguage
      );
      return;
    }

    // Service step via voice
    if (tempBookings[from] && !tempBookings[from].service) {
      tempBookings[from].service = transcript;
      tempBookings[from].language = tempBookings[from].language || language;
      const booking = tempBookings[from];
      await saveBooking(booking);
      await sendBookingConfirmation(from, booking);
      delete tempBookings[from];
      return;
    }
  } catch (err) {
    console.error("❌ Audio processing failed:", err.message || err);
    throw err;
  }
}

module.exports = { handleAudioMessage };
