/**
 * webhookHandler.js
 *
 * Responsibilities:
 * - Register the /webhook verification route (GET) and webhook receiver (POST).
 * - Route messages to appropriate handlers based on type.
 * - Coordinate the overall webhook flow.
 */

const { askAI, sendTextMessage, sendAppointmentOptions } = require("./helpers");

const {
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendOffersValidity,
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isEnglish,
  containsBanWords,
  sendBanWordsResponse,
  isGreeting,
  getGreeting,
  isCancelRequest, // ✅ NEW IMPORT
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");

const {
  handleInteractiveMessage,
  handleTextMessage,
  getSession,
} = require("./bookingFlowHandler");

const { findBookingByPhone, cancelBooking } = require("./supabaseService"); // ✅ NEW IMPORT

function registerWebhookRoutes(app, VERIFY_TOKEN) {
  // Webhook verification
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  // Webhook message handling (POST)
  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = message?.from;
      const session = getSession(from);

      if (!message || !from) return res.sendStatus(200);

      // Ignore system events
      if (!message.text && !message.audio && !message.interactive) {
        console.log("ℹ️ Ignored non-text webhook event");
        return res.sendStatus(200);
      }

      // tempBookings global object
      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // 🎙️ Audio messages
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 🎛️ Interactive messages
      if (message.type === "interactive") {
        await handleInteractiveMessage(message, from, tempBookings);
        return res.sendStatus(200);
      }

      // 💬 Text messages
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      // 👋 Greeting
      if (isGreeting(text)) {
        const reply = getGreeting(isEnglish(text));
        await sendTextMessage(from, reply);
        return res.sendStatus(200);
      }

      // 🚫 Ban Words
      if (containsBanWords(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, lang);

        if (global.tempBookings[from]) {
          delete global.tempBookings[from];
        }
        return res.sendStatus(200);
      }

      // 📍 Location
      if (isLocationRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, lang);
        return res.sendStatus(200);
      }

      // 🎁 Offers request
      if (isOffersRequest(text)) {
        session.waitingForOffersConfirmation = true;
        session.lastIntent = "offers";

        const lang = isEnglish(text) ? "en" : "ar";
        await sendOffersValidity(from, lang);
        return res.sendStatus(200);
      }

      // 🎁 Offers confirmation
      if (session.waitingForOffersConfirmation) {
        if (isOffersConfirmation(text)) {
          session.waitingForOffersConfirmation = false;
          session.lastIntent = null;

          const lang = isEnglish(text) ? "en" : "ar";
          await sendOffersImages(from, lang);
          return res.sendStatus(200);
        }

        session.waitingForOffersConfirmation = false;
        session.lastIntent = null;
      }

      // 👨‍⚕️ Doctors
      if (isDoctorsRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendDoctorsImages(from, lang);
        return res.sendStatus(200);
      }

      // 🕌 Friday closed
      const fridayWords = ["الجمعة", "Friday", "friday"];
      if (fridayWords.some((w) => text.toLowerCase().includes(w))) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز 🌷"
        );

        setTimeout(async () => {
          await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت المناسب 👇");
          await sendAppointmentOptions(from);
        }, 2000);

        return res.sendStatus(200);
      }

      // =====================================================
      // 🛑 CANCEL BOOKING FLOW (NEW)
      // =====================================================

      // Step 1: User says "إلغاء الحجز"
      if (isCancelRequest(text)) {
        session.waitingForCancelPhone = true;
        await sendTextMessage(from, "🔢 أرسل رقم الجوال المرتبط بالحجز:");
        return res.sendStatus(200);
      }

      // Step 2: User sends phone number
      if (session.waitingForCancelPhone) {
        session.waitingForCancelPhone = false;

        const phone = text.replace(/\D/g, "");
        const booking = await findBookingByPhone(phone);

        if (!booking) {
          await sendTextMessage(from, "❌ لم يتم العثور على حجز بهذا الرقم.");
          return res.sendStatus(200);
        }

        await cancelBooking(booking.id);
        await sendTextMessage(from, "✅ تم إلغاء الحجز بنجاح.");

        return res.sendStatus(200);
      }

      // =====================================================
      // 📅 Booking flow (existing)
      // =====================================================

      await handleTextMessage(text, from, tempBookings);

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook handler error:", err.message || err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
