/**
 * webhookHandler.js
 *
 * Responsibilities:
 * - Register the /webhook verification route (GET) and webhook receiver (POST).
 * - Handle non-audio messages: interactive (buttons/lists) and plain text messages.
 * - Manage the booking flow (appointment → name → phone → service).
 * - Delegate audio handling (transcription) to webhookProcessor.js.
 * - Filter inappropriate content using ban words detection.
 * - Prevent nonsense bookings with a whitelist + reset safety.
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
  // ✅ Webhook verification
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  // ✅ Webhook receiver
  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = message?.from;

      if (!message || !from) return res.sendStatus(200);

      // Ignore system events
      if (!message.text && !message.audio && !message.interactive) {
        console.log("ℹ️ Ignored system event");
        return res.sendStatus(200);
      }

      // Ensure global states exist
      const tempBookings = (global.tempBookings = global.tempBookings || {});
      global.invalidAttempts = global.invalidAttempts || {};

      // 🎙️ Audio messages handled separately
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 💬 Text content
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      // 💬 Reset command (“hello” / “إعادة”)
      if (/^(hi|hello|هلا|مرحبا|السلام|إعادة)$/i.test(text)) {
        delete tempBookings[from];
        delete global.invalidAttempts[from];
        await sendTextMessage(from, "أهلًا وسهلًا 👋 كيف أقدر أساعدك اليوم؟");
        return res.sendStatus(200);
      }

      // 🚫 Ban words detection
      if (containsBanWords(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, language);

        // 🔒 Reset booking session to prevent any continuation
        if (tempBookings[from]) delete tempBookings[from];
        if (global.invalidAttempts[from]) delete global.invalidAttempts[from];
        console.log(
          `⚠️ Cleared booking state for ${from} due to ban word usage`
        );
        return res.sendStatus(200);
      }

      // 📍 Quick-intent detection
      if (isLocationRequest(text)) {
        await sendLocationMessages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      if (isOffersRequest(text)) {
        await sendOffersImages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      if (isDoctorsRequest(text)) {
        await sendDoctorsImages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      // 📅 Friday closure notice
      const fridayWords = ["الجمعة", "friday"];
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

      // 🎛️ Interactive messages (buttons/lists)
      if (message.type === "interactive") {
        const type = message.interactive?.type;
        const id =
          type === "list_reply"
            ? message.interactive?.list_reply?.id
            : message.interactive?.button_reply?.id;

        if (id?.startsWith("slot_")) {
          const appointment = id.replace("slot_", "").toUpperCase();
          if (fridayWords.some((w) => appointment.toLowerCase().includes(w))) {
            await sendTextMessage(
              from,
              "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز 🌷"
            );
            setTimeout(async () => {
              await sendAppointmentOptions(from);
            }, 2000);
            return res.sendStatus(200);
          }

          tempBookings[from] = { appointment };
          await sendTextMessage(from, "👍 تم اختيار الموعد! أرسل اسمك:");
          return res.sendStatus(200);
        }

        if (id?.startsWith("service_")) {
          const serviceName = id.replace("service_", "").replace(/_/g, " ");
          if (!tempBookings[from] || !tempBookings[from].phone) {
            await sendTextMessage(
              from,
              "⚠️ يرجى إكمال الخطوات السابقة (الموعد، الاسم، رقم الجوال)"
            );
            return res.sendStatus(200);
          }

          tempBookings[from].service = serviceName;
          const booking = tempBookings[from];
          await saveBooking(booking);

          await sendTextMessage(
            from,
            `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
          );
          delete tempBookings[from];
          return res.sendStatus(200);
        }
      }

      // 🧩 Step 1: Appointment shortcut (3, 6, 9)
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        tempBookings[from] = { appointment: `${text} PM` };
        await sendTextMessage(from, "👍 تم اختيار الموعد! أرسل اسمك:");
        return res.sendStatus(200);
      }

      // 🧩 Step 2: Name
      if (tempBookings[from] && !tempBookings[from].name) {
        const name = text.trim();
        const valid = await validateNameWithAI(name);
        if (!valid) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة..."
          );
          return res.sendStatus(200);
        }
        tempBookings[from].name = name;
        await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
        return res.sendStatus(200);
      }

      // 🧩 Step 3: Phone
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

        if (!/^07\d{8}$/.test(normalized)) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875"
          );
          return res.sendStatus(200);
        }

        tempBookings[from].phone = normalized;
        await sendServiceList(from);
        await sendTextMessage(
          from,
          "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
        );
        return res.sendStatus(200);
      }

      // 🧩 Step 4: Service (strict whitelist)
      if (tempBookings[from] && !tempBookings[from].service) {
        const booking = tempBookings[from];
        const userService = text.trim();

        const VALID_SERVICES = [
          "تنظيف الأسنان",
          "تبييض الأسنان",
          "حشو الأسنان",
          "زراعة الأسنان",
          "ابتسامة هوليود",
          "تقويم الأسنان",
          "خلع الأسنان",
          "جلسة ليزر بشرة",
          "فيلر",
          "بوتوكس",
        ];

        global.invalidAttempts[from] = global.invalidAttempts[from] || 0;

        const foundService = VALID_SERVICES.find(
          (svc) =>
            userService.includes(svc) ||
            svc.includes(userService) ||
            userService.replace(/\s/g, "") === svc.replace(/\s/g, "")
        );

        if (!foundService) {
          global.invalidAttempts[from]++;
          if (global.invalidAttempts[from] >= 3) {
            await sendTextMessage(
              from,
              "⚠️ تم إدخال خدمات غير صحيحة عدة مرات.\nأرسل *إعادة* أو *Hello* للبدء من جديد."
            );
            delete tempBookings[from];
            global.invalidAttempts[from] = 0;
            return res.sendStatus(200);
          }

          await sendTextMessage(
            from,
            `⚠️ لا نقدم "${userService}" كخدمة حالياً.\nالخدمات المتاحة:\n- ${VALID_SERVICES.join(
              "\n- "
            )}`
          );
          await sendServiceList(from);
          return res.sendStatus(200);
        }

        // Valid service → save booking
        global.invalidAttempts[from] = 0;
        booking.service = foundService;
        await saveBooking(booking);

        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
        );

        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // 🧩 Step 5: Generic fallback (AI chat)
      if (!tempBookings[from]) {
        if (text.includes("حجز") || text.toLowerCase().includes("book")) {
          await sendAppointmentOptions(from);
        } else {
          const reply = await askAI(text);
          await sendTextMessage(from, reply);
        }
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook handler error:", err.message || err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
