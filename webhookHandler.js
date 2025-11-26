/**
 * webhookHandler.js
 *
 * Responsibilities:
 * - Register the /webhook verification route (GET) and webhook receiver (POST).
 * - Handle non-audio messages: interactive (buttons/lists) and plain text messages.
 * - Manage the booking flow for text & interactive flows (appointment selection, name, phone, service).
 * - Handle booking deletion flow.
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
  getBookingsByPhone,
  deleteBookingById,
  sendBookingsList,
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

      // ✅ Ignore system / non-user messages (e.g. delivery, read, typing indicators)
      if (!message.text && !message.audio && !message.interactive) {
        console.log("ℹ️ Ignored non-text system webhook event");
        return res.sendStatus(200);
      }

      // Ensure global tempBookings and deletionFlow objects exist
      const tempBookings = (global.tempBookings = global.tempBookings || {});
      const deletionFlow = (global.deletionFlow = global.deletionFlow || {});

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

        // Handle booking deletion confirmation
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

        // Handle "Keep booking" button
        if (id === "keep_booking") {
          await sendTextMessage(
            from,
            "👍 تمام! حجزك محفوظ. إذا احتجت أي مساعدة أخرى، أخبرني 😊"
          );
          delete deletionFlow[from];
          return res.sendStatus(200);
        }

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

      // 🗑️ Handle booking deletion request
      if (isDeleteBookingRequest(text) || isCancelRequest(text)) {
        console.log(`🗑️ Delete booking request from ${from}`);

        deletionFlow[from] = { step: "awaiting_phone" };

        await sendTextMessage(
          from,
          "🔍 حسناً، لحذف حجزك أرسل رقم الجوال المسجل به الحجز:"
        );

        return res.sendStatus(200);
      }

      // 🗑️ Handle deletion flow - phone number input
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

      // 🌟 Offers Logic (Smart 2-Step Flow)
      if (isOffersRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendOffersValidity(from);
        return res.sendStatus(200);
      }

      // 🌟 User confirms: "Send offers"
      if (isOffersConfirmation(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendOffersImages(from, language);
        return res.sendStatus(200);
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
        // ⭐ User asked a question while booking
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

      // 🧩 Step 3: Phone input
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

      // 🧩 Step 4: Service input
      if (tempBookings[from] && !tempBookings[from].service) {
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);
          await sendTextMessage(from, "نرجع للحجز… ما هي الخدمة المطلوبة؟");
          return res.sendStatus(200);
        }

        const booking = tempBookings[from];
        const userService = text.trim();

        // ✅ Define valid services and their possible keywords
        const SERVICE_KEYWORDS = {
          "تنظيف الأسنان": ["تنظيف", "كلين", "كلينينج", "clean", "تنضيف"],
          "تبييض الأسنان": ["تبييض", "تبيض", "whitening"],
          "حشو الأسنان": ["حشو", "حشوة", "حشوات", "fill", "filling"],
          "زراعة الأسنان": ["زراعة", "زرع", "implant", "زراعه"],
          "ابتسامة هوليود": ["ابتسامة", "هوليود", "ابتسامه", "smile"],
          "تقويم الأسنان": ["تقويم", "braces"],
          "خلع الأسنان": ["خلع", "قلع", "remove", "extraction"],
          "جلسة ليزر بشرة": ["ليزر", "جلسة", "بشرة", "laser"],
          فيلر: ["فيلر", "filler"],
          بوتوكس: ["بوتوكس", "botox"],
        };

        // ❌ Common nonsense or forbidden body areas
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

        // 🔍 Normalize text for safer matching
        const normalized = userService
          .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, "")
          .toLowerCase();

        // ❌ Detect nonsense / forbidden areas
        if (FORBIDDEN_WORDS.some((word) => normalized.includes(word))) {
          await sendTextMessage(
            from,
            "⚠️ يبدو أنك ذكرت منطقة من الجسم لا تتعلق بخدماتنا. يرجى اختيار خدمة خاصة بالأسنان أو البشرة فقط."
          );
          await sendServiceList(from);
          return res.sendStatus(200);
        }

        // ✅ Fuzzy match against valid keywords
        let matchedService = null;
        for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
          if (
            keywords.some((kw) => normalized.includes(kw.toLowerCase())) ||
            normalized.includes(service.replace(/\s/g, ""))
          ) {
            matchedService = service;
            break;
          }
        }

        // If still nothing found, use AI for backup validation
        if (!matchedService) {
          try {
            const aiCheck = await askAI(
              `هل "${userService}" خدمة تتعلق بطب الأسنان أو البشرة في عيادة تجميل؟ أجب فقط بـ نعم أو لا.`
            );
            if (aiCheck.toLowerCase().includes("نعم")) {
              // Still safe to ask the user to clarify which exact service
              await sendTextMessage(
                from,
                "💬 ممكن توضح أكثر نوع الخدمة؟ مثلاً: حشو الأسنان، تبييض، فيلر..."
              );
              return res.sendStatus(200);
            }
          } catch (err) {
            console.warn(
              "⚠️ AI service validation fallback failed:",
              err.message
            );
          }
        }

        // ❌ Not matched → reject gracefully
        if (!matchedService) {
          await sendTextMessage(
            from,
            `⚠️ لا يمكننا تحديد "${userService}" كخدمة صحيحة.\nالخدمات المتاحة لدينا:\n- ${Object.keys(
              SERVICE_KEYWORDS
            ).join("\n- ")}`
          );
          await sendServiceList(from);
          return res.sendStatus(200);
        }

        // ✅ Valid service found → continue booking
        booking.service = matchedService;
        await saveBooking(booking);

        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
        );

        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // 💬 Step 5: Booking or AI fallback
      if (!tempBookings[from]) {
        // 🗓️ If user wants to book (even with typos)
        if (isBookingRequest(text)) {
          console.log(`✅ Booking intent detected from ${from}`);
          await sendAppointmentOptions(from);
          return res.sendStatus(200);
        }

        // 💬 Otherwise fallback to AI
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
