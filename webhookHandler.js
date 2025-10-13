/**
 * webhookHandler.js
 *
 * Handles WhatsApp webhook verification (GET) and message events (POST).
 * Supports text, audio, interactive messages, and booking logic.
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
  isLocationRequest,
  isOffersRequest,
  isDoctorsRequest,
  isEnglish,
  containsBanWords,
  sendBanWordsResponse,
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");

function registerWebhookRoutes(app, VERIFY_TOKEN) {
  // ✅ Webhook verification (used once when connecting to Meta)
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook verified successfully!");
      res.status(200).send(challenge);
    } else {
      console.warn("❌ Webhook verification failed");
      res.sendStatus(403);
    }
  });

  // ✅ Webhook message handling (runs every time a message is received)
  app.post("/webhook", async (req, res) => {
    try {
      console.log("📩 Incoming webhook:", JSON.stringify(req.body, null, 2));

      const body = req.body;
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = message?.from;

      if (!message || !from) return res.sendStatus(200);

      // Make sure tempBookings exists
      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // 🎧 Audio message → delegate to webhookProcessor
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 🧭 Interactive (buttons/lists)
      if (message.type === "interactive") {
        const interactiveType = message.interactive?.type;
        const id =
          interactiveType === "list_reply"
            ? message.interactive?.list_reply?.id
            : message.interactive?.button_reply?.id;

        // Appointment selection
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
              "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز 🌷"
            );
            setTimeout(async () => {
              await sendTextMessage(from, "📅 اختر الوقت المناسب 👇");
              await sendAppointmentOptions(from);
            }, 2000);
            return res.sendStatus(200);
          }

          tempBookings[from] = { appointment };
          await sendTextMessage(from, "👍 تم اختيار الموعد! الآن أرسل اسمك:");
          return res.sendStatus(200);
        }

        // Service selection
        if (id?.startsWith("service_")) {
          const serviceName = id.replace("service_", "").replace(/_/g, " ");
          if (!tempBookings[from] || !tempBookings[from].phone) {
            await sendTextMessage(
              from,
              "⚠️ يرجى إكمال الخطوات (الموعد، الاسم، رقم الجوال) أولاً."
            );
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

      // 💬 Text messages
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);
      const isPureNumber = /^\d+$/.test(text);

      // 🚫 Ban words
      if (containsBanWords(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, language);
        return res.sendStatus(200);
      }

      // Shortcuts
      if (!isPureNumber && isLocationRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, lang);
        return res.sendStatus(200);
      }
      if (!isPureNumber && isOffersRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendOffersImages(from, lang);
        return res.sendStatus(200);
      }
      if (!isPureNumber && isDoctorsRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
        await sendDoctorsImages(from, lang);
        return res.sendStatus(200);
      }

      // 📅 Friday handling
      const fridayWords = ["الجمعة", "Friday", "friday"];
      if (
        fridayWords.some((word) =>
          text.toLowerCase().includes(word.toLowerCase())
        )
      ) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر 🌷"
        );
        setTimeout(async () => {
          await sendTextMessage(from, "📅 اختر الوقت المناسب 👇");
          await sendAppointmentOptions(from);
        }, 2000);
        return res.sendStatus(200);
      }

      // Step 1️⃣ Appointment shortcut
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        const appointment = `${text} PM`;
        tempBookings[from] = { appointment };
        await sendTextMessage(from, "👍 تم اختيار الموعد! الآن أرسل اسمك:");
        return res.sendStatus(200);
      }

      // Step 2️⃣ Name
      if (tempBookings[from] && !tempBookings[from].name) {
        const userName = text.trim();
        const isValid = await validateNameWithAI(userName);
        if (!isValid) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة..."
          );
          return res.sendStatus(200);
        }
        tempBookings[from].name = userName;
        await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
        return res.sendStatus(200);
      }

      // Step 3️⃣ Phone
      if (tempBookings[from] && !tempBookings[from].phone) {
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
            "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875"
          );
          return res.sendStatus(200);
        }

        tempBookings[from].phone = normalized;
        await sendServiceList(from);
        await sendTextMessage(from, "💊 اختر الخدمة من القائمة أعلاه:");
        return res.sendStatus(200);
      }

      // Step 4️⃣ Service (manual)
      if (tempBookings[from] && !tempBookings[from].service) {
        const booking = tempBookings[from];
        const userService = text.trim();
        const aiReply = await askAI(
          `هل نقدم هذه الخدمة في عيادتنا: "${userService}"؟ أجب بـ نعم أو لا فقط.`
        );

        const isValidService =
          aiReply.toLowerCase().includes("نعم") ||
          aiReply.toLowerCase().includes("yes");

        if (!isValidService) {
          await sendTextMessage(
            from,
            `⚠️ لا نقدم "${userService}". اختر خدمة صحيحة من القائمة.`
          );
          await sendServiceList(from);
          return res.sendStatus(200);
        }

        booking.service = userService;
        await saveBooking(booking);
        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك بنجاح:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
        );
        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // Step 5️⃣ AI fallback
      if (!tempBookings[from]) {
        let reply;
        if (text.includes("حجز") || text.toLowerCase().includes("book")) {
          await sendAppointmentOptions(from);
        } else {
          reply = isPureNumber
            ? await askAI(`${text}\n\nملاحظة: الرد يجب أن يكون بالعربية فقط`)
            : await askAI(text);
          await sendTextMessage(from, reply);
        }
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook crashed:", err);
      res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { registerWebhookRoutes };
