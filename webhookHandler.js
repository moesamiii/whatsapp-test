/**
 * webhookHandler.js
 *
 * Fixes applied:
 * - Strong phone-number exception: preserve booking language when phone-like input arrives.
 * - Prefer tempBookings[from].language (if present) over newly-detected language.
 * - Ensure all outgoing calls pass the resolved `language`.
 *
 * NOTE: helpers.js must accept language on the calls used here.
 */

const {
  askAI,
  validateNameWithAI,
  sendTextMessage,
  sendServiceList,
  sendAppointmentOptions,
  saveBooking,
  sendBanWordsResponse,
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
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");

// Normalize Arabic digits to ascii digits for phone detection
function normalizeArabicDigitsForCheck(input = "") {
  return input
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
}

// Loose phone-like check
function looksLikePhoneNumber(text = "") {
  const digits = normalizeArabicDigitsForCheck(text);
  if (/^07\d{8}$/.test(digits)) return true;
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Decide language for an incoming text message.
 * Priority:
 * 1) If there is an active booking with language -> that language (and preserve on phone-like inputs)
 * 2) Else if global.userLanguage exists -> use it (and preserve on phone-like inputs)
 * 3) Else fallback to detection via isEnglish(text)
 *
 * Special rule: if message looks like a phone and booking language or previous language exists, preserve it.
 */
function decideLanguage(from, text, tempBookings = {}) {
  global.userLanguage = global.userLanguage || {};

  const bookingLang = tempBookings[from]?.language;
  const prevLang = global.userLanguage[from];

  // If booking language exists -> strong preference (and preserve for phone)
  if (bookingLang) {
    // If message is phone-like, return bookingLang
    if (looksLikePhoneNumber(text)) return bookingLang;
    // Otherwise allow detection to update bookingLang if different (but still prefer bookingLang for continuity)
    return bookingLang;
  }

  // If previous language exists and message looks like phone -> keep previous
  if (prevLang && looksLikePhoneNumber(text)) return prevLang;

  // Otherwise detect from text
  return isEnglish(text) ? "en" : "ar";
}

function registerWebhookRoutes(app, VERIFY_TOKEN) {
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

  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = message?.from;

      if (!message || !from) return res.sendStatus(200);

      const tempBookings = (global.tempBookings = global.tempBookings || {});
      global.userLanguage = global.userLanguage || {};

      // AUDIO -> delegate
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // INTERACTIVE messages
      if (message.type === "interactive") {
        const interactiveType = message.interactive?.type;
        const id =
          interactiveType === "list_reply"
            ? message.interactive?.list_reply?.id
            : message.interactive?.button_reply?.id;

        // Use booking language if available, otherwise stored language, else default 'ar'
        const language =
          tempBookings[from]?.language || global.userLanguage[from] || "ar";

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
              language === "en"
                ? "📅 Friday is a holiday and the clinic is closed. Please choose another day."
                : "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷",
              language
            );

            setTimeout(async () => {
              await sendTextMessage(
                from,
                language === "en"
                  ? "📅 Let's start booking — choose a time below 👇"
                  : "📅 لنبدأ الحجز، اختر الوقت المناسب 👇",
                language
              );
              await sendAppointmentOptions(from, language);
            }, 1200);

            return res.sendStatus(200);
          }

          tempBookings[from] = tempBookings[from] || {};
          tempBookings[from].appointment = appointment;
          // store language preference if not existing
          tempBookings[from].language = tempBookings[from].language || language;
          global.userLanguage[from] = global.userLanguage[from] || language;

          await sendTextMessage(
            from,
            language === "en"
              ? "👍 Appointment selected! Please send your name now:"
              : "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:",
            language
          );
          return res.sendStatus(200);
        }

        if (id?.startsWith("service_")) {
          const serviceName = id.replace("service_", "").replace(/_/g, " ");
          if (!tempBookings[from] || !tempBookings[from].phone) {
            await sendTextMessage(
              from,
              language === "en"
                ? "⚠️ Please complete booking steps first (appointment, name, phone)"
                : "⚠️ يرجى إكمال خطوات الحجز أولاً (الموعد، الاسم، رقم الجوال)",
              language
            );
            return res.sendStatus(200);
          }

          tempBookings[from].service = serviceName;
          const booking = tempBookings[from];
          await saveBooking(booking);

          await sendTextMessage(
            from,
            language === "en"
              ? `✅ Booking saved:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
              : `✅ تم حفظ حجزك:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`,
            language
          );

          delete tempBookings[from];
          return res.sendStatus(200);
        }

        return res.sendStatus(200);
      }

      // TEXT messages
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      // Decide language using booking preference and global userLanguage
      const language = decideLanguage(from, text, tempBookings);
      // persist language globally (for future non-booking messages)
      global.userLanguage[from] = language;
      // also persist in booking if present
      if (tempBookings[from])
        tempBookings[from].language = tempBookings[from].language || language;

      // Ban words
      if (containsBanWords(text)) {
        await sendBanWordsResponse(from, language);
        return res.sendStatus(200);
      }

      // Shortcuts
      if (isLocationRequest(text)) {
        await sendLocationMessages(from, language);
        return res.sendStatus(200);
      }

      if (isOffersRequest(text)) {
        await sendOffersImages(from, language);
        return res.sendStatus(200);
      }

      if (isDoctorsRequest(text)) {
        await sendDoctorsImages(from, language);
        return res.sendStatus(200);
      }

      // Friday check
      const fridayWords = ["الجمعة", "Friday", "friday"];
      if (
        fridayWords.some((w) => text.toLowerCase().includes(w.toLowerCase()))
      ) {
        await sendTextMessage(
          from,
          language === "en"
            ? "📅 Friday is a holiday and the clinic is closed — please choose another day."
            : "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷",
          language
        );

        setTimeout(async () => {
          await sendTextMessage(
            from,
            language === "en"
              ? "📅 Let's start booking — choose a time below 👇"
              : "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇",
            language
          );
          await sendAppointmentOptions(from, language);
        }, 1200);

        return res.sendStatus(200);
      }

      // Booking flow
      // Step 1: appointment shortcut
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        const appointment = `${text} PM`;
        tempBookings[from] = tempBookings[from] || {};
        tempBookings[from].appointment = appointment;
        tempBookings[from].language = tempBookings[from].language || language;
        global.userLanguage[from] = global.userLanguage[from] || language;

        await sendTextMessage(
          from,
          language === "en"
            ? "👍 Appointment chosen! Now please send your name:"
            : "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:",
          language
        );
        return res.sendStatus(200);
      }

      // Step 2: name input
      if (tempBookings[from] && !tempBookings[from].name) {
        const userName = text.trim();
        const isValid = await validateNameWithAI(userName, language);

        if (!isValid) {
          await sendTextMessage(
            from,
            language === "en"
              ? "⚠️ Please send a valid name like: John, Mary Smith..."
              : "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة...",
            language
          );
          return res.sendStatus(200);
        }

        tempBookings[from].name = userName;
        tempBookings[from].language = language;
        global.userLanguage[from] = language;

        await sendTextMessage(
          from,
          language === "en"
            ? "📱 Great! Now send your phone number:"
            : "📱 ممتاز! الآن أرسل رقم جوالك:",
          language
        );
        return res.sendStatus(200);
      }

      // Step 3: phone input
      if (tempBookings[from] && !tempBookings[from].phone) {
        // IMPORTANT: Do NOT let the phone content change language.
        // Use stored booking language first; if not present, fallback to global.userLanguage or detect.
        const bookingLang = tempBookings[from].language;
        const storedLang = global.userLanguage[from];
        const resolvedLanguage = bookingLang || storedLang || language;

        // Normalize digits
        const normalized = normalizeArabicDigitsForCheck(text);
        const isValidPhone = /^07\d{8}$/.test(normalized);

        if (!isValidPhone) {
          await sendTextMessage(
            from,
            resolvedLanguage === "en"
              ? "⚠️ Please send a valid Jordanian phone like: 0785050875"
              : "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875",
            resolvedLanguage
          );
          return res.sendStatus(200);
        }

        // Save phone and keep booking language (do NOT flip to English even if digits are ASCII)
        tempBookings[from].phone = normalized;
        tempBookings[from].language = resolvedLanguage;
        global.userLanguage[from] = resolvedLanguage;

        // Send service list using resolved language
        await sendServiceList(from, resolvedLanguage);
        await sendTextMessage(
          from,
          resolvedLanguage === "en"
            ? "💊 Please choose a service from the dropdown above:"
            : "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:",
          resolvedLanguage
        );
        return res.sendStatus(200);
      }

      // Step 4: service input (manual)
      if (tempBookings[from] && !tempBookings[from].service) {
        const booking = tempBookings[from];
        const userService = text.trim();
        const lang = booking.language || global.userLanguage[from] || language;

        const prompt =
          lang === "en"
            ? `Do we offer this service in our clinic: "${userService}"? Answer only "yes" or "no". If no, suggest available services.`
            : `هل نقدم هذه الخدمة في عيادتنا: "${userService}"؟ أجب فقط بـ نعم أو لا. إذا لا، اقترح الخدمات المتاحة.`;

        const aiReply = await askAI(prompt, lang);
        const lower = (aiReply || "").toLowerCase();
        const isValidService = lower.includes("نعم") || lower.includes("yes");

        if (!isValidService) {
          await sendTextMessage(
            from,
            lang === "en"
              ? `⚠️ We don't offer "${userService}". Please choose a valid service from the list.`
              : `⚠️ لا نقدم "${userService}" كخدمة. يرجى اختيار خدمة صحيحة من القائمة.`,
            lang
          );
          await sendServiceList(from, lang);
          return res.sendStatus(200);
        }

        booking.service = userService;
        await saveBooking(booking);

        await sendTextMessage(
          from,
          lang === "en"
            ? `✅ Booking saved:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
            : `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`,
          lang
        );

        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // Step 5: AI chat fallback when no booking active
      if (!tempBookings[from]) {
        const lowerText = text.toLowerCase();
        if (
          lowerText.includes("حجز") ||
          lowerText.includes("book") ||
          lowerText.includes("appointment") ||
          lowerText.includes("موعد")
        ) {
          await sendAppointmentOptions(from, language);
        } else {
          const reply = await askAI(text, language);
          await sendTextMessage(from, reply, language);
        }
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("Webhook handler error:", err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
