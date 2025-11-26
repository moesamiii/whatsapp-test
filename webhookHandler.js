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

  // ⭐️⭐️ NEW IMPORTS ⭐️⭐️
  getBookingsByPhone,
  deleteBookingsByPhone,
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

      // Ensure delete state exists
      const deleteState = (global.deleteState = global.deleteState || {});

      // Ignore system messages
      if (!message.text && !message.audio && !message.interactive) {
        console.log("ℹ️ Ignored non-text system webhook event");
        return res.sendStatus(200);
      }

      // Ensure global tempBookings object exists
      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // 🎙️ Handle audio
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 🎛️ Interactive messages
      if (message.type === "interactive") {
        const interactiveType = message.interactive?.type;
        const id =
          interactiveType === "list_reply"
            ? message.interactive?.list_reply?.id
            : message.interactive?.button_reply?.id;

        // SLOT (time)
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

        // SERVICE
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

      // 💬 TEXT MESSAGE
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      // -------------------------------------------------------
      // ⭐️⭐️ DELETE BOOKING FLOW ⭐️⭐️
      // -------------------------------------------------------
      const deleteWords = [
        "الغاء",
        "الغي",
        "الغى",
        "بدي الغي",
        "cancel",
        "cancel booking",
      ];

      // STEP 1 — Detect delete intent
      if (deleteWords.some((w) => text.toLowerCase().includes(w))) {
        deleteState[from] = "WAITING_FOR_PHONE";
        await sendTextMessage(from, "✔️ اكيد! ارسل رقمك لحذف الحجز");
        return res.sendStatus(200);
      }

      // STEP 2 — User sends phone number after delete request
      if (deleteState[from] === "WAITING_FOR_PHONE") {
        const phone = text.replace(/[^\d]/g, "");

        if (!/^07\d{8}$/.test(phone)) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال رقم أردني صحيح يبدأ بـ 07"
          );
          return res.sendStatus(200);
        }

        const bookings = await getBookingsByPhone(phone);

        if (!bookings || bookings.length === 0) {
          await sendTextMessage(from, "❌ لا يوجد أي حجز مسجل على هذا الرقم.");
          delete deleteState[from];
          return res.sendStatus(200);
        }

        const success = await deleteBookingsByPhone(phone);

        if (success) {
          await sendTextMessage(from, "🗑️ تم الغاء الحجز بنجاح 🤍");
        } else {
          await sendTextMessage(from, "⚠️ حدث خطأ أثناء حذف الحجز.");
        }

        delete deleteState[from];
        return res.sendStatus(200);
      }
      // -------------------------------------------------------
      // END DELETE FLOW
      // -------------------------------------------------------

      // 👋 Greeting detection
      if (isGreeting(text)) {
        const reply = getGreeting(isEnglish(text));
        await sendTextMessage(from, reply);
        return res.sendStatus(200);
      }

      // 🚫 Ban words
      if (containsBanWords(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, language);

        if (global.tempBookings && global.tempBookings[from]) {
          delete global.tempBookings[from];
        }

        return res.sendStatus(200);
      }

      // 📍 Location
      if (isLocationRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, language);
        return res.sendStatus(200);
      }

      // Offers
      if (isOffersRequest(text)) {
        const lang = isEnglish(text) ? "en" : "ar";
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

      // 📅 Friday check
      const fridayWords = ["الجمعة", "Friday", "friday"];
      if (fridayWords.some((word) => text.toLowerCase().includes(word))) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
        );

        setTimeout(async () => {
          await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت المناسب 👇");
          await sendAppointmentOptions(from);
        }, 2000);

        return res.sendStatus(200);
      }

      // Appointment shortcut
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        const appointment = `${text} PM`;
        tempBookings[from] = { appointment };
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      // Name input
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

      // Phone
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
        await sendTextMessage(
          from,
          "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
        );
        return res.sendStatus(200);
      }

      // Service
      if (tempBookings[from] && !tempBookings[from].service) {
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);
          await sendTextMessage(from, "نرجع للحجز… ما هي الخدمة المطلوبة؟");
          return res.sendStatus(200);
        }

        const booking = tempBookings[from];
        const userService = text.trim();

        // VALID SERVICES
        const SERVICE_KEYWORDS = {
          "تنظيف الأسنان": ["تنظيف", "كلين", "clean", "تنضيف"],
          "تبييض الأسنان": ["تبييض", "تبيض", "whitening"],
          "حشو الأسنان": ["حشو", "حشوة", "fill"],
          "زراعة الأسنان": ["زراعة", "زرع", "implant"],
          "ابتسامة هوليود": ["ابتسامة", "هوليود", "smile"],
          "تقويم الأسنان": ["تقويم", "braces"],
          "خلع الأسنان": ["خلع", "extraction"],
          "جلسة ليزر بشرة": ["ليزر", "جلسة", "laser"],
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

        if (FORBIDDEN_WORDS.some((w) => normalized.includes(w))) {
          await sendTextMessage(
            from,
            "⚠️ هذه منطقة جسم غير مدعومة. يرجى اختيار خدمة تخص الأسنان أو البشرة فقط."
          );
          await sendServiceList(from);
          return res.sendStatus(200);
        }

        let matchedService = null;
        for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
          if (keywords.some((kw) => normalized.includes(kw.toLowerCase()))) {
            matchedService = service;
            break;
          }
        }

        // AI fallback
        if (!matchedService) {
          try {
            const aiCheck = await askAI(
              `هل "${userService}" خدمة تخص الأسنان أو البشرة؟ اكتب نعم أو لا فقط.`
            );

            if (aiCheck.toLowerCase().includes("نعم")) {
              await sendTextMessage(
                from,
                "💬 ممكن توضح نوع الخدمة بالتحديد؟ مثل: حشو، تبييض، فيلر..."
              );
              return res.sendStatus(200);
            }
          } catch (err) {}
        }

        if (!matchedService) {
          await sendTextMessage(
            from,
            `⚠️ "${userService}" غير معروف.\nالخدمات المتاحة:\n- ${Object.keys(
              SERVICE_KEYWORDS
            ).join("\n- ")}`
          );
          await sendServiceList(from);
          return res.sendStatus(200);
        }

        booking.service = matchedService;
        await saveBooking(booking);

        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
        );

        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // Default fallback
      if (!tempBookings[from]) {
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
