/**
 * webhookProcessor.js
 *
 * Responsibilities:
 * - Handle audio (voice) messages: fetch & transcribe the media, detect intent (location/offers/doctors),
 *   respond with media or start/continue the booking flow when the user speaks.
 * - Contains helper functions used by the audio flow (phone normalization, Friday detection, booking confirmation).
 *
 * Usage:
 * - Called from webhookHandler.js for audio messages: handleAudioMessage(message, from)
 *
 * Dependencies:
 * - helpers.js for sending messages, booking persistence and name validation.
 * - messageHandlers.js for transcription, location/offers/doctors sending and language detection.
 *
 * Note:
 * - This file is intentionally focused on voice/audio logic to keep heavy I/O here.
 * - Text & interactive (buttons/lists) flows are handled in webhookHandler.js.
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

/**
 * Normalize Arabic digits and non-digit characters into ascii digits string.
 * Example: "٠٧٨٥٠٥٠٨٧٥" -> "0785050875"
 */
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

/**
 * returns true if the provided text contains a Friday word.
 */
function containsFriday(text = "") {
  const fridayWords = ["الجمعة", "Friday", "friday"];
  return fridayWords.some((w) => text.toLowerCase().includes(w.toLowerCase()));
}

/**
 * Send a unified booking confirmation message.
 */
async function sendBookingConfirmation(to, booking) {
  await sendTextMessage(
    to,
    `✅ تم حفظ حجزك بنجاح:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
  );
}

/**
 * Handle an incoming audio message (main exported function).
 * - message: the raw message object from the webhook (expected to contain message.audio.id)
 * - from: sender id (phone number)
 */
async function handleAudioMessage(message, from) {
  try {
    // Ensure global tempBookings exists
    const tempBookings = (global.tempBookings = global.tempBookings || {});

    const mediaId = message?.audio?.id;
    if (!mediaId) return;

    console.log(
      "🎙️ Audio message received. Starting transcription for media ID:",
      mediaId
    );

    const transcript = await transcribeAudio(mediaId);

    if (!transcript) {
      await sendTextMessage(
        from,
        "⚠️ لم أتمكن من فهم الرسالة الصوتية، حاول مرة أخرى 🎙️"
      );
      return;
    }

    console.log(`🗣️ Transcribed text: "${transcript}"`);

    // If user asked for location / offers / doctors via voice
    if (isLocationRequest(transcript)) {
      const language = isEnglish(transcript) ? "en" : "ar";
      await sendLocationMessages(from, language);
      return;
    }

    if (isOffersRequest(transcript)) {
      const language = isEnglish(transcript) ? "en" : "ar";
      await sendOffersImages(from, language);
      return;
    }

    if (isDoctorsRequest(transcript)) {
      const language = isEnglish(transcript) ? "en" : "ar";
      await sendDoctorsImages(from, language);
      return;
    }

    // Friday detection
    if (containsFriday(transcript)) {
      await sendTextMessage(
        from,
        "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
      );

      // after short delay, offer appointment options
      setTimeout(async () => {
        await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇");
        await sendAppointmentOptions(from);
      }, 2000);

      return;
    }

    // If there is no active booking for this user, decide whether to start booking or run AI chat
    if (!tempBookings[from]) {
      if (
        transcript.includes("حجز") ||
        transcript.toLowerCase().includes("book") ||
        transcript.includes("موعد") ||
        transcript.includes("appointment")
      ) {
        await sendAppointmentOptions(from);
      } else {
        // AI chat fallback for voice message
        const reply = await askAI(transcript);
        await sendTextMessage(from, reply);
      }
      return;
    }

    // If there's an active booking for this user, continue the booking flow
    if (tempBookings[from] && !tempBookings[from].name) {
      // Use AI to validate name
      const isValid = await validateNameWithAI(transcript);
      if (!isValid) {
        await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة..."
        );
        return;
      }

      tempBookings[from].name = transcript;
      await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
      return;
    }

    if (tempBookings[from] && !tempBookings[from].phone) {
      const normalized = normalizeArabicDigits(transcript);
      const isValid = /^07\d{8}$/.test(normalized);
      if (!isValid) {
        await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 078XXXXXXX"
        );
        return;
      }

      tempBookings[from].phone = normalized;

      // Send service dropdown list
      await sendServiceList(from);
      await sendTextMessage(
        from,
        "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
      );
      return;
    }

    if (tempBookings[from] && !tempBookings[from].service) {
      tempBookings[from].service = transcript;
      const booking = tempBookings[from];
      await saveBooking(booking);
      await sendBookingConfirmation(from, booking);
      delete tempBookings[from];
      return;
    }
  } catch (err) {
    console.error("❌ Audio processing failed:", err.message || err);
    // Rethrow so caller can decide (webhookHandler logs & responds 500). We choose not to send to user here.
    throw err;
  }
}

module.exports = { handleAudioMessage };
