/**
 * webhookHandler.js
 *
 * Responsibilities:
 * - Register the /webhook verification route (GET) and webhook receiver (POST).
 * - Handle text, audio, and interactive messages.
 * - Manage appointment booking flow (appointment → name → phone → service).
 * - Validate inputs strictly and keep user progress intact.
 * - Filter inappropriate content.
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

// ✅ Official clinic services list (100% verified)
const VALID_SERVICES = [
  // Dentistry
  "تنظيف الأسنان",
  "تلميع الأسنان",
  "تبييض الأسنان",
  "حشوة الأسنان",
  "خلع ضرس",
  "علاج العصب",
  "تقويم الأسنان",
  "زراعة الأسنان",
  "تركيب ابتسامة هوليود",

  // Dermatology & Cosmetic
  "بوتوكس",
  "فيلر",
  "ميزوثيرابي",
  "ليزر إزالة الشعر",
  "تقشير البشرة",
  "علاج حب الشباب",
  "جلسة تنظيف بشرة",
  "ديرما بن",
  "علاج التصبغات",

  // Women & Others
  "طبيبة نساء وولادة",
  "كشف نسائية",
  "تحاليل مخبرية",
  "استشارة طبية",
];

// ✅ Normalize Arabic & English text safely
function normalizeText(txt) {
  return txt
    .toLowerCase()
    .trim()
    .replace(/[^\u0621-\u064Aa-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

// ✅ Try to find partial match for service (tolerates slight spelling mistakes)
function findMatchingService(userInput) {
  const normalizedInput = normalizeText(userInput);

  // Exact match first
  let exact = VALID_SERVICES.find((s) => normalizeText(s) === normalizedInput);
  if (exact) return exact;

  // Partial match (contains key word)
  let partial = VALID_SERVICES.find(
    (s) =>
      normalizeText(s).includes(normalizedInput) ||
      normalizedInput.includes(normalizeText(s))
  );

  return partial || null;
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

      // ✅ Ignore non-user system events
      if (!message.text && !message.audio && !message.interactive) {
        console.log("ℹ️ Ignored non-text system webhook event");
        return res.sendStatus(200);
      }

      // Create global booking memory
      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // 🎙️ Handle audio messages
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 🎛️ Handle interactive messages (buttons/lists)
      if (message.type === "interactive") {
        const interactiveType = message.interactive?.type;
        const id =
          interactiveType === "list_reply"
            ? message.interactive?.list_reply?.id
            : message.interactive?.button_reply?.id;

        if (id?.startsWith("slot_")) {
          const appointment = id.replace("slot_", "").toUpperCase();
          const fridayWords = ["الجمعة", "Friday", "friday"];

          if (
            fridayWords.some((w) =>
              appointment.toLowerCase().includes(w.toLowerCase())
            )
          ) {
            await sendTextMessage(
              from,
              "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
            );

            setTimeout(async () => {
              await sendTextMessage(from, "📅 اختر الوقت المناسب 👇");
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

        if (id?.startsWith("service_")) {
          const serviceName = id.replace("service_", "").replace(/_/g, " ");
          if (!tempBookings[from] || !tempBookings[from].phone) {
            await sendTextMessage(
              from,
              "⚠️ يرجى إكمال خطوات الحجز أولاً (الموعد، الاسم، رقم الجوال)"
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

      // 💬 Text message
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      // 🚫 Ban words filter
      if (containsBanWords(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, language);

        if (global.tempBookings?.[from]) delete global.tempBookings[from];
        console.log(`⚠️ Cleared booking state for ${from} due to banned words`);
        return res.sendStatus(200);
      }

      // 📍 Common quick actions
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

      // 📅 Friday closure check
      const fridayWords = ["الجمعة", "Friday", "friday"];
      if (
        fridayWords.some((w) => text.toLowerCase().includes(w.toLowerCase()))
      ) {
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

      // 🧩 Step 1: Appointment shortcut
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        const appointment = `${text} PM`;
        tempBookings[from] = { appointment };
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      // 🧩 Step 2: Name input
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

      // 🧩 Step 3: Phone input
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
        await sendTextMessage(from, "💊 يرجى اختيار الخدمة من القائمة أعلاه:");
        return res.sendStatus(200);
      }

      // 🧩 Step 4: Service input (bulletproof + no reset)
      if (tempBookings[from] && !tempBookings[from].service) {
        const booking = tempBookings[from];
        const userService = text.trim();
        const matchedService = findMatchingService(userService);

        if (!matchedService) {
          console.log(`❌ Invalid service entered by ${from}: ${userService}`);
          await sendTextMessage(
            from,
            `⚠️ الخدمة "${userService}" غير متوفرة لدينا حاليًا.\n👇 يرجى اختيار إحدى الخدمات التالية:`
          );
          await sendServiceList(from); // Keep user in the same booking flow
          return res.sendStatus(200);
        }

        booking.service = matchedService;
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

      // 💬 Step 5: AI Chat fallback (non-booking messages)
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
      console.error("❌ Webhook handler error:", err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
