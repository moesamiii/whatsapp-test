/**
 * webhookHandler.js (FINAL UPDATED WITH CANCEL BOOKING)
 *
 * Responsibilities:
 * - Verify webhook
 * - Receive WhatsApp messages
 * - Detect intents (location / offers / doctors / booking / cancel)
 * - Handle booking flow
 * - Handle audio transcription
 */

const { askAI, sendTextMessage, sendAppointmentOptions } = require("./helpers");

const {
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendOffersValidity,
  containsBanWords,
  sendBanWordsResponse,
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isCancelRequest,
  isEnglish,
  isGreeting,
  getGreeting,
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");

const {
  getSession,
  handleInteractiveMessage,
  handleTextMessage,
} = require("./bookingFlowHandler");

const { askForCancellationPhone, processCancellation } = require("./helpers");

// ---------------------------------------------
// REGISTER WHATSAPP WEBHOOK ROUTES
// ---------------------------------------------
function registerWebhookRoutes(app, VERIFY_TOKEN) {
  /** ----------------------------
   *   GET — Webhook Verification
   * ---------------------------- */
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  });

  /** ----------------------------
   *   POST — WhatsApp Event Receiver
   * ---------------------------- */
  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;
      const message =
        body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || null;

      if (!message) return res.sendStatus(200);

      const from = message.from;
      const session = getSession(from);

      const text = message.text?.body?.trim() || null;

      const tempBookings = (global.tempBookings = global.tempBookings || {});

      /** ------------------------------------
       *  🎙️ AUDIO MESSAGES → send to processor
       * ------------------------------------ */
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      /** ------------------------------------
       *  🎛️ INTERACTIVE MESSAGES (Buttons / List)
       * ------------------------------------ */
      if (message.type === "interactive") {
        await handleInteractiveMessage(message, from, tempBookings);
        return res.sendStatus(200);
      }

      /** ------------------------------------
       *  ✉️ IGNORE SYSTEM MESSAGES
       * ------------------------------------ */
      if (!text) return res.sendStatus(200);

      /** ------------------------------------
       *  👋 GREETING DETECTION
       * ------------------------------------ */
      if (isGreeting(text)) {
        const reply = getGreeting(isEnglish(text));
        await sendTextMessage(from, reply);
        return res.sendStatus(200);
      }

      /** ------------------------------------
       *  🚫 BAN WORD DETECTION
       * ------------------------------------ */
      if (containsBanWords(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, lang);

        // clear booking state for safety
        if (tempBookings[from]) delete tempBookings[from];
        if (session.waitingForCancelPhone)
          session.waitingForCancelPhone = false;

        return res.sendStatus(200);
      }

      /** ------------------------------------
       *  🌍 LOCATION REQUEST
       * ------------------------------------ */
      if (isLocationRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, lang);
        return res.sendStatus(200);
      }

      /** ------------------------------------
       *  🎁 OFFERS REQUEST
       * ------------------------------------ */
      if (isOffersRequest(text)) {
        session.waitingForOffersConfirmation = true;

        const lang = isEnglish(text) ? "en" : "ar";
        await sendOffersValidity(from, lang);
        return res.sendStatus(200);
      }

      // Offers confirmation
      if (session.waitingForOffersConfirmation) {
        if (isOffersConfirmation(text)) {
          session.waitingForOffersConfirmation = false;

          const lang = isEnglish(text) ? "en" : "ar";
          await sendOffersImages(from, lang);
          return res.sendStatus(200);
        }

        session.waitingForOffersConfirmation = false;
      }

      /** ------------------------------------
       *  👨‍⚕️ DOCTORS
       * ------------------------------------ */
      if (isDoctorsRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendDoctorsImages(from, lang);
        return res.sendStatus(200);
      }

      /** ------------------------------------
       *  ❗ CANCEL BOOKING REQUEST
       * ------------------------------------ */
      if (isCancelRequest(text)) {
        session.waitingForCancelPhone = true;

        // cancel any booking flow running
        if (tempBookings[from]) delete tempBookings[from];

        await askForCancellationPhone(from);
        return res.sendStatus(200);
      }

      // User is now sending phone for cancellation
      if (session.waitingForCancelPhone) {
        const phone = text.replace(/\D/g, "");

        if (phone.length < 8) {
          await sendTextMessage(from, "⚠️ رقم الجوال غير صحيح. حاول مرة أخرى:");
          return res.sendStatus(200);
        }

        session.waitingForCancelPhone = false;
        await processCancellation(from, phone);
        return res.sendStatus(200);
      }

      /** ------------------------------------
       *  🗓️ BOOKING FLOW
       * ------------------------------------ */
      await handleTextMessage(text, from, tempBookings);

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook Handler Error:", err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
