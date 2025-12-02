/**
 * webhookProcessor.js
 *
 * Updated to:
 * - Handle cancellation from voice messages
 * - Detect user questions during booking
 * - Answer using AI
 * - Then return to the correct booking step
 */

const {
  askAI,
  validateNameWithAI,
  sendTextMessage,
  sendServiceList,
  sendAppointmentOptions,
  saveBooking,
  askForCancellationPhone,
} = require("./helpers");

const {
  transcribeAudio,
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  isLocationRequest,
  isOffersRequest,
  isDoctorsRequest,
  isCancelRequest, // ✅ ADD THIS
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
 * Detect if the user is asking a question.
 */
function isQuestion(text = "") {
  if (!text) return false;

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
  ];

  return (
    text.trim().endsWith("?") ||
    questionWords.some((w) => text.toLowerCase().includes(w.toLowerCase()))
  );
}

/**
 * Detect Friday words.
 */
function containsFriday(text = "") {
  const fridayWords = ["الجمعة", "Friday", "friday"];
  return fridayWords.some((w) => text.toLowerCase().includes(w.toLowerCase()));
}

/**
 * Send booking confirmation message.
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
 * Get session helper
 */
function getSession(from) {
  if (!global.userSessions) {
    global.userSessions = {};
  }
  if (!global.userSessions[from]) {
    global.userSessions[from] = {
      waitingForCancelPhone: false,
      waitingForOffersConfirmation: false,
    };
  }
  return global.userSessions[from];
}

/**
 * ---------------------------
 * MAIN AUDIO PROCESSOR
 * ---------------------------
 */
async function handleAudioMessage(message, from) {
  try {
    const tempBookings = (global.tempBookings = global.tempBookings || {});
    const session = getSession(from);

    const mediaId = message?.audio?.id;
    if (!mediaId) return;

    console.log("🎙️ Audio message received. Transcribing:", mediaId);

    const transcript = await transcribeAudio(mediaId, from);

    if (!transcript) {
      await sendTextMessage(
        from,
        "⚠️ لم أتمكن من فهم الرسالة الصوتية، حاول مرة أخرى 🎙️"
      );
      return;
    }

    console.log(`🗣️ User said: "${transcript}"`);

    /* -------------------------------------------------------
     STEP 1 — CANCELLATION CHECK (HIGHEST PRIORITY)
    ------------------------------------------------------- */
    if (isCancelRequest(transcript)) {
      console.log("🔍 CANCEL detected from voice message for user:", from);

      session.waitingForCancelPhone = true;
      delete tempBookings[from];

      await askForCancellationPhone(from);
      return;
    }

    /* -------------------------------------------------------
     STEP 2 — QUICK INTENT CHECKS
    ------------------------------------------------------- */

    if (isLocationRequest(transcript)) {
      const lang = isEnglish(transcript) ? "en" : "ar";
      await sendLocationMessages(from, lang);
      return;
    }

    if (isOffersRequest(transcript)) {
      const lang = isEnglish(transcript) ? "en" : "ar";
      await sendOffersImages(from, lang);
      return;
    }

    if (isDoctorsRequest(transcript)) {
      const lang = isEnglish(transcript) ? "en" : "ar";
      await sendDoctorsImages(from, lang);
      return;
    }

    if (containsFriday(transcript)) {
      await sendTextMessage(
        from,
        "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز 🌷"
      );
      setTimeout(async () => {
        await sendTextMessage(from, "📅 اختر الموعد المناسب لك 👇");
        await sendAppointmentOptions(from);
      }, 2000);
      return;
    }

    /* -------------------------------------------------------
     STEP 3 — QUESTION DETECTION
    ------------------------------------------------------- */

    if (isQuestion(transcript)) {
      console.log("❓ Detected question during conversation.");

      // AI answers the question
      const answer = await askAI(transcript);
      await sendTextMessage(from, answer);

      // After answering → return to booking stage
      const userBooking = tempBookings[from];

      if (userBooking) {
        if (!userBooking.name) {
          await sendTextMessage(from, "👤 الآن يرجى تزويدي باسمك:");
        } else if (!userBooking.phone) {
          await sendTextMessage(from, "📱 الرجاء إرسال رقم جوالك:");
        } else if (!userBooking.service) {
          await sendTextMessage(
            from,
            "💊 يرجى اختيار الخدمة من القائمة المنسدلة:"
          );
        }
      } else {
        await sendTextMessage(
          from,
          "هل ترغب في بدء الحجز؟ قل: أريد حجز موعد 👍"
        );
      }

      return;
    }

    /* -------------------------------------------------------
     STEP 4 — BOOKING FLOW
    ------------------------------------------------------- */

    // No booking yet
    if (!tempBookings[from]) {
      if (
        transcript.includes("حجز") ||
        transcript.toLowerCase().includes("book") ||
        transcript.includes("موعد") ||
        transcript.includes("appointment")
      ) {
        tempBookings[from] = {}; // start session
        await sendAppointmentOptions(from);
      } else {
        // Regular AI chat
        const reply = await askAI(transcript);
        await sendTextMessage(from, reply);
      }
      return;
    }

    // User must send name
    if (!tempBookings[from].name) {
      const isValidName = await validateNameWithAI(transcript);

      if (!isValidName) {
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

    // User must send phone
    if (!tempBookings[from].phone) {
      const normalized = normalizeArabicDigits(transcript);

      if (!/^07\d{8}$/.test(normalized)) {
        await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 078XXXXXXX"
        );
        return;
      }

      tempBookings[from].phone = normalized;

      await sendServiceList(from);
      await sendTextMessage(from, "💊 يرجى اختيار الخدمة من القائمة المنسدلة:");
      return;
    }

    // User selects service
    if (!tempBookings[from].service) {
      tempBookings[from].service = transcript;

      const booking = tempBookings[from];

      await saveBooking(booking);
      await sendBookingConfirmation(from, booking);

      delete tempBookings[from];
      return;
    }
  } catch (err) {
    console.error("❌ Audio processing error:", err);
    throw err;
  }
}

module.exports = { handleAudioMessage };
