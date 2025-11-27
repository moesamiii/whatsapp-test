/**
 * webhookHandler.js (UPDATED)
 *
 * Responsibilities:
 * - Register the /webhook verification route (GET) and webhook receiver (POST).
 * - Route messages to appropriate handlers based on type.
 * - Coordinate the overall webhook flow.
 * - Handle booking deletion flow.
 */

const {
  askAI,
  sendTextMessage,
  sendAppointmentOptions,
  getBookingsByPhone, // ✅ NEW
  deleteBookingById, // ✅ NEW
  sendBookingsList, // ✅ NEW
} = require("./helpers");

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
  isDeleteBookingRequest, // ✅ NEW
  isCancelRequest, // ✅ NEW
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

      // Ensure global tempBookings and deletionFlow objects exist
      const tempBookings = (global.tempBookings = global.tempBookings || {});
      const deletionFlow = (global.deletionFlow = global.deletionFlow || {}); // ✅ NEW

      // 🎙️ Handle audio messages separately
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 🎛️ Interactive messages (buttons / lists)
      if (message.type === "interactive") {
        const interactiveType = message.interactive?.type;
        const id =
          interactiveType === "list_reply"
            ? message.interactive?.list_reply?.id
            : message.interactive?.button_reply?.id;

        // ✅ NEW: Handle booking deletion confirmation
        if (id?.startsWith("delete_")) {
          const bookingId = id.replace("delete_", "");

          try {
            const deleted = await deleteBookingById(bookingId);

            if (deleted) {
              await sendTextMessage(
                from,
                "✅ تم حذف الحجز بنجاح!\n\nإذا كنت ترغب بحجز موعد جديد، أخبرني فقط 😊"
              );
            } else {
              await sendTextMessage(
                from,
                "⚠️ عذراً، لم نتمكن من العثور على الحجز. ربما تم حذفه مسبقاً."
              );
            }
          } catch (err) {
            console.error("❌ Delete booking error:", err.message);
            await sendTextMessage(
              from,
              "⚠️ حدث خطأ أثناء حذف الحجز. الرجاء المحاولة لاحقاً."
            );
          }

          delete deletionFlow[from];
          return res.sendStatus(200);
        }

        // ✅ NEW: Handle "Keep booking" button
        if (id === "keep_booking") {
          await sendTextMessage(
            from,
            "👍 تمام! حجزك محفوظ. إذا احتجت أي مساعدة أخرى، أخبرني 😊"
          );
          delete deletionFlow[from];
          return res.sendStatus(200);
        }

        // Handle regular booking interactive messages
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

      // ✅ NEW: Handle booking deletion request
      if (isDeleteBookingRequest(text) || isCancelRequest(text)) {
        console.log(`🗑️ Delete booking request from ${from}`);

        deletionFlow[from] = { step: "awaiting_phone" };

        await sendTextMessage(
          from,
          "🔍 حسناً، لحذف حجزك أرسل رقم الجوال المسجل به الحجز:"
        );

        return res.sendStatus(200);
      }

      // ✅ NEW: Handle deletion flow - phone number input
      if (deletionFlow[from]?.step === "awaiting_phone") {
        const normalized = text
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

        const isValid = /^07\d{8}$/.test(normalized);

        if (!isValid) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 07XXXXXXXX"
          );
          return res.sendStatus(200);
        }

        // Fetch bookings for this phone number
        try {
          const bookings = await getBookingsByPhone(normalized);

          if (!bookings || bookings.length === 0) {
            await sendTextMessage(
              from,
              "❌ لم نجد أي حجوزات مسجلة بهذا الرقم.\n\nتأكد من الرقم، أو إذا كنت ترغب بحجز جديد، أخبرني 😊"
            );
            delete deletionFlow[from];
            return res.sendStatus(200);
          }

          // Send list of bookings with delete buttons
          await sendBookingsList(from, bookings);
          delete deletionFlow[from];
        } catch (err) {
          console.error("❌ Error fetching bookings:", err.message);
          await sendTextMessage(
            from,
            "⚠️ حدث خطأ أثناء البحث عن الحجوزات. الرجاء المحاولة لاحقاً."
          );
          delete deletionFlow[from];
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
