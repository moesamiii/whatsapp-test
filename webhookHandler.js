/**
 * webhookHandler.js
 *
 * Responsibilities:
 * - Register the /webhook verification route (GET) and webhook receiver (POST).
 * - Handle non-audio messages: interactive (buttons/lists) and plain text messages.
 * - Manage the booking flow for text & interactive flows (appointment selection, name, phone, service).
 * - Handle instant booking cancellation via WhatsApp message.
 * - Delegate audio-specific handling (transcription + voice booking) to webhookProcessor.js.
 * - Filter inappropriate content using ban words detection.
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
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendOffersValidity,
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isDeleteBookingRequest,
  isCancelRequest,
  isEnglish,
  containsBanWords,
  sendBanWordsResponse,
  isGreeting,
  getGreeting,
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");

const { setBookingCancelled } = require("./updateStatus"); // NEW

function isSideQuestion(text = "") {
  if (!text) return false;
  const t = text.trim().toLowerCase();

  return (
    t.endsWith("?") ||
    t.includes("كم") ||
    t.includes("price") ||
    t.includes("how") ||
    t.includes("مدة") ||
    t.includes("ليش") ||
    t.includes("why") ||
    t.startsWith("هل ") ||
    t.startsWith("شو ") ||
    t.startsWith("what ")
  );
}

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

      if (!message || !from) return res.sendStatus(200);

      // Ignore system events
      if (!message.text && !message.audio && !message.interactive) {
        console.log("ℹ️ Ignored non-text system webhook event");
        return res.sendStatus(200);
      }

      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // 🎤 AUDIO HANDLING
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 🟣 INTERACTIVE HANDLING
      if (message.type === "interactive") {
        const interactiveType = message.interactive?.type;
        const id =
          interactiveType === "list_reply"
            ? message.interactive?.list_reply?.id
            : message.interactive?.button_reply?.id;

        // old deletion logic removed 100%

        // Appointment selection (3 PM, 6 PM, 9 PM)
        if (id?.startsWith("slot_")) {
          const appointment = id.replace("slot_", "").toUpperCase();
          const fridayWords = ["الجمعة", "Friday", "friday"];

          if (
            fridayWords.some((word) =>
              appointment.toLowerCase().includes(word.toLowerCase())
            )
          ) {
            await sendTextMessage(
              from,
              "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
            );

            setTimeout(async () => {
              await sendTextMessage(
                from,
                "📅 لنبدأ الحجز، اختر الوقت المناسب 👇"
              );
              await sendAppointmentOptions(from);
            }, 2000);

            return res.sendStatus(200);
          }

          tempBookings[from] = { appointment };
          await sendTextMessage(
            from,
            "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
          );
          return res.sendStatus(200);
        }

        // Service selection (list)
        if (id?.startsWith("service_")) {
          const serviceName = id.replace("service_", "").replace(/_/g, " ");

          if (!tempBookings[from] || !tempBookings[from].phone) {
            await sendTextMessage(from, "⚠️ يرجى إكمال خطوات الحجز أولاً.");
            return res.sendStatus(200);
          }

          tempBookings[from].service = serviceName;
          const booking = tempBookings[from];
          await saveBooking(booking);

          await sendTextMessage(
            from,
            `✅ تم حفظ حجزك:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
          );

          delete tempBookings[from];
          return res.sendStatus(200);
        }

        return res.sendStatus(200);
      }

      // 💬 TEXT MESSAGES
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      // Greetings
      if (isGreeting(text)) {
        const reply = getGreeting(isEnglish(text));
        await sendTextMessage(from, reply);
        return res.sendStatus(200);
      }

      // Ban words
      if (containsBanWords(text)) {
        await sendBanWordsResponse(from, isEnglish(text) ? "en" : "ar");
        if (tempBookings[from]) delete tempBookings[from];
        return res.sendStatus(200);
      }

      // ------------------------------------------------------
      // 🔥 INSTANT CANCELLATION LOGIC (REPLACES OLD DELETE FLOW)
      // ------------------------------------------------------
      if (isDeleteBookingRequest(text) || isCancelRequest(text)) {
        console.log(`🛑 User requested cancellation from ${from}`);

        // Convert WhatsApp number → Jordanian format
        let normalizedPhone = from.replace(/^962/, "0");

        // Update Supabase
        const updated = await setBookingCancelled(normalizedPhone);

        if (updated) {
          await sendTextMessage(
            from,
            "❌ تم إلغاء الحجز بنجاح.\nإذا رغبت بالحجز مرة أخرى، أنا هنا لخدمتك 😊"
          );
        } else {
          await sendTextMessage(
            from,
            "⚠️ حدث خطأ أثناء إلغاء الحجز. يرجى المحاولة لاحقاً."
          );
        }

        return res.sendStatus(200);
      }

      // 🌍 Location
      if (isLocationRequest(text)) {
        await sendLocationMessages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      // 💸 Offers
      if (isOffersRequest(text)) {
        await sendOffersValidity(from);
        return res.sendStatus(200);
      }

      if (isOffersConfirmation(text)) {
        await sendOffersImages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      // 👨‍⚕️ Doctors
      if (isDoctorsRequest(text)) {
        await sendDoctorsImages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      // 📆 Friday logic
      const fridayWords = ["الجمعة", "Friday", "friday"];
      if (
        fridayWords.some((word) =>
          text.toLowerCase().includes(word.toLowerCase())
        )
      ) {
        await sendTextMessage(from, "📅 يوم الجمعة عطلة رسمية.");
        setTimeout(async () => {
          await sendTextMessage(from, "📅 اختر الوقت المناسب لك 👇");
          await sendAppointmentOptions(from);
        }, 2000);
        return res.sendStatus(200);
      }

      // STEP 1: Appointment shortcut
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        tempBookings[from] = { appointment: `${text} PM` };
        await sendTextMessage(from, "👍 تم اختيار الموعد! الآن أرسل اسمك:");
        return res.sendStatus(200);
      }

      // STEP 2: Name input
      if (tempBookings[from] && !tempBookings[from].name) {
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);
          await sendTextMessage(from, "نكمّل الحجز؟ أرسل اسمك 😊");
          return res.sendStatus(200);
        }

        const userName = text.trim();
        const isValid = await validateNameWithAI(userName);

        if (!isValid) {
          await sendTextMessage(from, "⚠️ الرجاء إدخال اسم حقيقي.");
          return res.sendStatus(200);
        }

        tempBookings[from].name = userName;
        await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
        return res.sendStatus(200);
      }

      // STEP 3: Phone input
      if (tempBookings[from] && !tempBookings[from].phone) {
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);
          await sendTextMessage(from, "تمام! الآن أرسل رقم جوالك:");
          return res.sendStatus(200);
        }

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

        tempBookings[from].phone = normalized;
        await sendServiceList(from);
        await sendTextMessage(from, "💊 يرجى اختيار الخدمة:");
        return res.sendStatus(200);
      }

      // STEP 4: Service input
      if (tempBookings[from] && !tempBookings[from].service) {
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);
          await sendTextMessage(from, "نرجع للحجز… ما هي الخدمة المطلوبة؟");
          return res.sendStatus(200);
        }

        const booking = tempBookings[from];
        const userService = text.trim();

        // Ask user to clarify
        await sendTextMessage(from, "💬 يرجى اختيار الخدمة من القائمة:");
        await sendServiceList(from);
        return res.sendStatus(200);
      }

      // FALLBACK TO AI
      if (!tempBookings[from]) {
        if (isBookingRequest(text)) {
          await sendAppointmentOptions(from);
          return res.sendStatus(200);
        }

        const reply = await askAI(text);
        await sendTextMessage(from, reply);
        return res.sendStatus(200);
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook handler error:", err.message || err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
