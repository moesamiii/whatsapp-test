/**
 * webhookProcessor.js
 *
 * Updated:
 * - Added question detection anywhere in the flow.
 * - If user asks a question during booking, system answers via AI and resumes booking.
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
 * Check if the user asked a question.
 */
function isQuestion(text = "") {
  const questionWords = [
    "?",
    "كيف",
    "ليش",
    "متى",
    "أين",
    "وين",
    "شو",
    "what",
    "why",
    "how",
    "when",
    "where",
    "who",
    "which",
  ];

  return (
    text.trim().endsWith("?") ||
    questionWords.some((w) => text.toLowerCase().includes(w.toLowerCase()))
  );
}

/**
 * Detect if Friday is mentioned.
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
 * Handle incoming audio messages.
 */
async function handleAudioMessage(message, from) {
  try {
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

    /* -------------------------------------------------------
     🔍 1) CHECK FOR LOCATION / OFFERS / DOCTORS KEYWORDS
    ------------------------------------------------------- */

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

    /* -------------------------------------------------------
     📅 2) FRIDAY DETECTION
    ------------------------------------------------------- */

    if (containsFriday(transcript)) {
      await sendTextMessage(
        from,
        "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
      );

      setTimeout(async () => {
        await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇");
        await sendAppointmentOptions(from);
      }, 2000);

      return;
    }

    /* -------------------------------------------------------
     ❓ 3) QUESTION DETECTION (NEW FEATURE)
     ------------------------------------------------------- */

    if (isQuestion(transcript)) {
      console.log("❓ User asked a question during the flow.");

      const answer = await askAI(transcript);
      await sendTextMessage(from, answer);

      // Continue the booking flow if it exists
      if (tempBookings[from]) {
        const step = tempBookings[from];

        if (!step.name) {
          await sendTextMessage(from, "👤 الآن يرجى تزويدي باسمك:");
        } else if (!step.phone) {
          await sendTextMessage(from, "📱 الرجاء إرسال رقم جوالك:");
        } else if (!step.service) {
          await sendTextMessage(
            from,
            "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
          );
        }
      } else {
        // No booking in progress
        await sendTextMessage(
          from,
          "هل ترغب في البدء بعملية الحجز؟ قل: أريد حجز موعد 👍"
        );
      }

      return;
    }

    /* -------------------------------------------------------
     📝 4) BOOKING LOGIC
    ------------------------------------------------------- */

    // No active booking: detect if user wants to book or just chat
    if (!tempBookings[from]) {
      if (
        transcript.includes("حجز") ||
        transcript.toLowerCase().includes("book") ||
        transcript.includes("موعد") ||
        transcript.includes("appointment")
      ) {
        tempBookings[from] = {};
        await sendAppointmentOptions(from);
      } else {
        const reply = await askAI(transcript);
        await sendTextMessage(from, reply);
      }
      return;
    }

    // Step 1: Name
    if (tempBookings[from] && !tempBookings[from].name) {
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

    // Step 2: Phone
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

      await sendServiceList(from);
      await sendTextMessage(
        from,
        "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
      );
      return;
    }

    // Step 3: Service
    if (tempBookings[from] && !tempBookings[from].service) {
      tempBookings[from].service = transcript;
      const booking = tempBookings[from];
      await saveBooking(booking);
      await sendBookingConfirmation(from, booking);
      delete tempBookings[from];
      return;
    }
  } catch (err) {
    console.error("❌ Audio processing failed:", err);
    throw err;
  }
}

module.exports = { handleAudioMessage };
