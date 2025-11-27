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
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");

const {
  handleInteractiveMessage,
  handleTextMessage,
  getSession,
} = require("./bookingFlowHandler");

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

      // ✅ Ignore system / non-user messages (e.g. delivery, read, typing indicators)
      if (!message.text && !message.audio && !message.interactive) {
        console.log("ℹ️ Ignored non-text system webhook event");
        return res.sendStatus(200);
      }

      // Ensure global tempBookings object exists
      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // 🎙️ Handle audio messages separately
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 🎛️ Interactive messages (buttons / lists)
      if (message.type === "interactive") {
        await handleInteractiveMessage(message, from, tempBookings);
        return res.sendStatus(200);
      }

      // 💬 Text messages
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      // 👋 Greeting detection (before any other logic)
      if (isGreeting(text)) {
        const reply = getGreeting(isEnglish(text));
        await sendTextMessage(from, reply);
        return res.sendStatus(200);
      }

      // 🚫 Check for ban words
      if (containsBanWords(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, language);

        // 🔒 Reset any ongoing booking session to prevent accidental saves
        if (global.tempBookings && global.tempBookings[from]) {
          delete global.tempBookings[from];
          console.log(
            `⚠️ Cleared booking state for ${from} due to ban word usage`
          );
        }

        return res.sendStatus(200);
      }

      // 📍 Location / offers / doctors detection
      if (isLocationRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, language);
        return res.sendStatus(200);
      }

      // Offers logic (smart)
      if (isOffersRequest(text)) {
        session.waitingForOffersConfirmation = true;
        session.lastIntent = "offers";

        const language = isEnglish(text) ? "en" : "ar";
        await sendOffersValidity(from, language);

        return res.sendStatus(200);
      }

      //Offer confirmation logic
      if (session.waitingForOffersConfirmation) {
        if (isOffersConfirmation(text)) {
          session.waitingForOffersConfirmation = false;
          session.lastIntent = null;

          const language = isEnglish(text) ? "en" : "ar";
          await sendOffersImages(from, language);
          return res.sendStatus(200);
        }

        // User said something else → reset and keep going
        session.waitingForOffersConfirmation = false;
        session.lastIntent = null;
      }

      if (isDoctorsRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendDoctorsImages(from, language);
        return res.sendStatus(200);
      }

      // 📅 Friday check
      const fridayWords = ["الجمعة", "Friday", "friday"];
      if (
        fridayWords.some((word) =>
          text.toLowerCase().includes(word.toLowerCase())
        )
      ) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
        );

        setTimeout(async () => {
          await sendTextMessage(
            from,
            "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇"
          );
          await sendAppointmentOptions(from);
        }, 2000);

        return res.sendStatus(200);
      }

      // 💬 Delegate text message handling to booking flow handler
      await handleTextMessage(text, from, tempBookings);

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook handler error:", err.message || err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
