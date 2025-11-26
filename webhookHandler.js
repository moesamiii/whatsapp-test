/**
 * webhookHandler.js
 *
 * Responsibilities:
 * - Register the /webhook verification route (GET) and webhook receiver (POST).
 * - Handle non-audio messages: interactive (buttons/lists) and plain text messages.
 * - Manage the booking flow for text & interactive flows (appointment selection, name, phone, service).
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
  isEnglish,
  containsBanWords,
  sendBanWordsResponse,
  isGreeting,
  getGreeting,
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");

/**
 * NEW: Stronger side-question detection for Arabic & English
 */
function isSideQuestion(text = "") {
  if (!text) return false;

  const t = text.trim().toLowerCase();

  const triggers = [
    "?",
    "كم",
    "price",
    "how",
    "ليش",
    "why",
    "مدة",
    "when",
    "where",
    "who",
    "which",
    "هل ",
    "شو ",
    "what ",
    "does",
    "can i",
    "can you",
  ];

  return t.endsWith("?") || triggers.some((w) => t.includes(w));
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

      if (!message.text && !message.audio && !message.interactive) {
        console.log("ℹ️ Ignored non-text system webhook event");
        return res.sendStatus(200);
      }

      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // AUDIO HANDLING
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // INTERACTIVE HANDLING ............................................................
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

      // TEXT HANDLING ...................................................................

      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      if (isGreeting(text)) {
        const reply = getGreeting(isEnglish(text));
        await sendTextMessage(from, reply);
        return res.sendStatus(200);
      }

      if (containsBanWords(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, language);

        if (global.tempBookings && global.tempBookings[from]) {
          delete global.tempBookings[from];
        }

        return res.sendStatus(200);
      }

      if (isLocationRequest(text)) {
        await sendLocationMessages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      if (isOffersRequest(text)) {
        await sendOffersValidity(from);
        return res.sendStatus(200);
      }

      if (isOffersConfirmation(text)) {
        await sendOffersImages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      if (isDoctorsRequest(text)) {
        await sendDoctorsImages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      // FRIDAY
      const fridayWords = ["الجمعة", "friday"];
      if (
        fridayWords.some((word) =>
          text.toLowerCase().includes(word.toLowerCase())
        )
      ) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية، اختر يوم آخر 🌷"
        );

        setTimeout(async () => {
          await sendAppointmentOptions(from);
        }, 2000);

        return res.sendStatus(200);
      }

      // SHORTCUT FOR APPOINTMENT (3 / 6 / 9)
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        const appointment = `${text} PM`;
        tempBookings[from] = { appointment };
        await sendTextMessage(from, "👍 تم اختيار الموعد! الآن ارسل اسمك:");
        return res.sendStatus(200);
      }

      // --------------------------------------------------------------------------------
      // STEP 2: NAME
      // --------------------------------------------------------------------------------
      if (tempBookings[from] && !tempBookings[from].name) {
        // ⭐ NEW FEATURE: Detect question → answer → return to name step
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);
          await sendTextMessage(from, "نكمّل الحجز؟ أرسل اسمك 😊");
          return res.sendStatus(200);
        }

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

      // --------------------------------------------------------------------------------
      // STEP 3: PHONE
      // --------------------------------------------------------------------------------
      if (tempBookings[from] && !tempBookings[from].phone) {
        // ⭐ NEW FEATURE: Detect question → answer → return to phone step
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
        await sendTextMessage(from, "💊 يرجى اختيار الخدمة من القائمة أعلاه:");
        return res.sendStatus(200);
      }

      // --------------------------------------------------------------------------------
      // STEP 4: SERVICE
      // --------------------------------------------------------------------------------
      if (tempBookings[from] && !tempBookings[from].service) {
        // ⭐ NEW FEATURE: Detect question → answer → return to service step
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);
          await sendTextMessage(from, "نرجع للحجز… ما هي الخدمة المطلوبة؟");
          return res.sendStatus(200);
        }

        // (ALL your service validation logic remains unchanged)
        //----------------------------------------------------------------------
        const booking = tempBookings[from];
        const userService = text.trim();

        const SERVICE_KEYWORDS = {
          "تنظيف الأسنان": ["تنظيف", "كلين", "clean"],
          "تبييض الأسنان": ["تبييض", "whitening"],
          "حشو الأسنان": ["حشو", "fill"],
          "زراعة الأسنان": ["زراعة", "implant"],
          "ابتسامة هوليود": ["ابتسامة", "smile"],
          "تقويم الأسنان": ["تقويم", "braces"],
          "خلع الأسنان": ["خلع", "remove"],
          "جلسة ليزر بشرة": ["ليزر", "بشرة", "laser"],
          فيلر: ["فيلر", "filler"],
          بوتوكس: ["بوتوكس", "botox"],
        };

        const FORBIDDEN_WORDS = [
          "أنف",
          "بطن",
          "ظهر",
          "رجل",
          "يد",
          "عين",
          "أذن",
          "وجه",
          "شعر",
          "رقبة",
          "تصفير",
          "تحمير",
          "تزريق",
          "تخصير",
          "تسويد",
        ];

        const normalized = userService
          .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, "")
          .toLowerCase();

        if (FORBIDDEN_WORDS.some((word) => normalized.includes(word))) {
          await sendTextMessage(from, "⚠️ يرجى اختيار خدمة أسنان أو بشرة فقط.");
          await sendServiceList(from);
          return res.sendStatus(200);
        }

        let matchedService = null;
        for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
          if (keywords.some((kw) => normalized.includes(kw))) {
            matchedService = service;
            break;
          }
        }

        if (!matchedService) {
          try {
            const aiCheck = await askAI(
              `هل "${userService}" خدمة أسنان أو بشرة؟ أجب نعم أو لا.`
            );
            if (aiCheck.includes("نعم")) {
              await sendTextMessage(from, "💬 وضّح أكثر نوع الخدمة المطلوبة…");
              return res.sendStatus(200);
            }
          } catch {}

          await sendTextMessage(from, `⚠️ الخدمة غير معروفة: "${userService}"`);
          await sendServiceList(from);
          return res.sendStatus(200);
        }

        booking.service = matchedService;
        await saveBooking(booking);

        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
        );

        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // FALLBACK (no booking active)
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
      console.error("❌ Webhook handler error:", err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
