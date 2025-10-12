/**
 * webhookHandler.js
 *
 * Rewritten for:
 * - Centralized language detection (global.userLanguage)
 * - Phone-number exception: when user language is Arabic and they send phone in English digits,
 *   language is NOT switched to English.
 * - All outgoing helpers & askAI receive `language` to force reply language (Option A).
 *
 * NOTE: Helpers used here are expected to accept language as an extra argument:
 * - askAI(text, language)
 * - sendTextMessage(to, message, language)
 * - sendServiceList(to, language)
 * - sendAppointmentOptions(to, language)
 * - sendLocationMessages(to, language)
 * - sendOffersImages(to, language)
 * - sendDoctorsImages(to, language)
 * - sendBanWordsResponse(to, language)
 *
 * If your helpers don't match these signatures yet, update them accordingly.
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

// Helper: normalize digits (Arabic numerals -> ASCII) for phone detection
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

// Heuristic: is this text likely a phone number?
function looksLikePhoneNumber(text = "") {
  const digits = normalizeArabicDigitsForCheck(text);
  // Consider phone-like if it has at least 7 digits (loose) or matches Jordanian 07XXXXXXXX strictly
  if (/^07\d{8}$/.test(digits)) return true;
  return digits.length >= 7 && digits.length <= 15;
}

// Determine language for this incoming message with phone exception
function decideLanguage(from, text) {
  // Ensure global store exists
  global.userLanguage = global.userLanguage || {};
  const prev = global.userLanguage[from]; // may be undefined

  const detectedEnglish = isEnglish(text);
  const incomingLang = detectedEnglish ? "en" : "ar";

  // If user previously had language and incoming looks like a phone number,
  // preserve previous language (special exception requested).
  if (prev && looksLikePhoneNumber(text)) {
    return prev;
  }

  // Otherwise, update to detected
  return incomingLang;
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

      // Ensure global tempBookings object exists
      const tempBookings = (global.tempBookings = global.tempBookings || {});
      global.userLanguage = global.userLanguage || {};

      // AUDIO messages -> delegate
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // INTERACTIVE messages (buttons / lists)
      if (message.type === "interactive") {
        const interactiveType = message.interactive?.type;
        const id =
          interactiveType === "list_reply"
            ? message.interactive?.list_reply?.id
            : message.interactive?.button_reply?.id;

        // Decide language for interactive inputs:
        // Use stored language if present, otherwise default to 'ar'
        const language = global.userLanguage[from] || "ar";

        if (id?.startsWith("slot_")) {
          const appointment = id.replace("slot_", "").toUpperCase();
          const fridayWords = ["الجمعة", "Friday", "friday"];

          if (
            fridayWords.some((word) =>
              appointment.toLowerCase().includes(word.toLowerCase())
            )
          ) {
            // localized message - we keep Arabic text here (clinic closed on Friday)
            // if you want an English text path, update this block to handle language === 'en'
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
          tempBookings[from].language = language;
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

      // Decide language for this message (with phone exception)
      const language = decideLanguage(from, text);
      // persist detected language globally
      global.userLanguage[from] = language;

      // 🚫 Check for ban words
      if (containsBanWords(text)) {
        await sendBanWordsResponse(from, language);
        return res.sendStatus(200);
      }

      // Shortcut detection (location/offers/doctors) - use unified language
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
        fridayWords.some((word) =>
          text.toLowerCase().includes(word.toLowerCase())
        )
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

      // Booking flow state machine

      // Step 1: Appointment shortcut (text like "3", "6", "9")
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        const appointment = `${text} PM`;
        tempBookings[from] = tempBookings[from] || {};
        tempBookings[from].appointment = appointment;
        tempBookings[from].language = language;
        await sendTextMessage(
          from,
          language === "en"
            ? "👍 Appointment chosen! Now please send your name:"
            : "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:",
          language
        );
        return res.sendStatus(200);
      }

      // Step 2: Name input
      if (tempBookings[from] && !tempBookings[from].name) {
        const userName = text.trim();
        // validateNameWithAI should accept language to tailor its checks (if you want).
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
        await sendTextMessage(
          from,
          language === "en"
            ? "📱 Great! Now send your phone number:"
            : "📱 ممتاز! الآن أرسل رقم جوالك:",
          language
        );
        return res.sendStatus(200);
      }

      // Step 3: Phone input
      if (tempBookings[from] && !tempBookings[from].phone) {
        // Normalize Arabic digits and non-digits
        const normalized = normalizeArabicDigitsForCheck(text);

        const isValidPhone = /^07\d{8}$/.test(normalized);

        if (!isValidPhone) {
          await sendTextMessage(
            from,
            language === "en"
              ? "⚠️ Please send a valid Jordanian phone like: 0785050875"
              : "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875",
            language
          );
          return res.sendStatus(200);
        }

        // Save phone, keep language as previously decided (phone DOES NOT flip the language)
        tempBookings[from].phone = normalized;
        tempBookings[from].language = language;

        // Send service list (language-aware)
        await sendServiceList(from, language);
        await sendTextMessage(
          from,
          language === "en"
            ? "💊 Please choose a service from the dropdown above:"
            : "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:",
          language
        );
        return res.sendStatus(200);
      }

      // Step 4: Service input (manual text fallback) with AI validation
      if (tempBookings[from] && !tempBookings[from].service) {
        const booking = tempBookings[from];
        const userService = text.trim();

        // Make askAI validate service in the right language
        const prompt =
          language === "en"
            ? `Do we offer this service in our clinic: "${userService}"? Answer only "yes" or "no". If no, suggest available services.`
            : `هل نقدم هذه الخدمة في عيادتنا: "${userService}"؟ أجب فقط بـ نعم أو لا. إذا لا، اقترح الخدمات المتاحة.`;

        const aiReply = await askAI(prompt, language);

        const lower = (aiReply || "").toLowerCase();
        const isValidService = lower.includes("نعم") || lower.includes("yes");

        if (!isValidService) {
          await sendTextMessage(
            from,
            language === "en"
              ? `⚠️ We don't offer "${userService}". Please choose a valid service from the list.`
              : `⚠️ لا نقدم "${userService}" كخدمة. يرجى اختيار خدمة صحيحة من القائمة.`,
            language
          );
          await sendServiceList(from, language);
          return res.sendStatus(200);
        }

        booking.service = userService;
        await saveBooking(booking);

        await sendTextMessage(
          from,
          language === "en"
            ? `✅ Booking saved:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
            : `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`,
          language
        );

        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // Step 5: AI chat fallback (no active booking)
      if (!tempBookings[from]) {
        // If user asks to book in Arabic/English, show appointment options
        const lowerText = text.toLowerCase();
        if (
          lowerText.includes("حجز") ||
          lowerText.includes("book") ||
          lowerText.includes("appointment") ||
          lowerText.includes("موعد")
        ) {
          await sendAppointmentOptions(from, language);
        } else {
          // askAI is called with language to force the response language
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
