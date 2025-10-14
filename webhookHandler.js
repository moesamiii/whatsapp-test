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
  isLocationRequest,
  isOffersRequest,
  isDoctorsRequest,
  isEnglish,
  containsBanWords,
  sendBanWordsResponse,
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");

// ✅ FIX: List of valid services (must match your dropdown exactly)
const VALID_SERVICES = [
  "فحص عام",
  "تنظيف الأسنان",
  "تبييض الأسنان",
  "حشو الأسنان",
  "علاج الجذور",
  "تركيب التركيبات",
  "تقويم الأسنان",
  "خلع الأسنان",
  "الفينير",
  "زراعة الأسنان",
  "ابتسامة هوليود",
  "خدمة أخرى",
];

// ✅ FIX: Helper to reset user state completely
function resetUserState(from, tempBookings) {
  console.log(`🔄 DEBUG => Resetting conversation state for ${from}`);
  delete tempBookings[from];
}

// ✅ FIX: Check if service confirmation is recent (within 5 minutes)
function isServiceConfirmationFresh(booking) {
  if (!booking.serviceConfirmedAt) return false;
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return booking.serviceConfirmedAt > fiveMinutesAgo;
}

// ✅ FIX: Validate booking is complete and fresh before saving
function canSaveBooking(booking) {
  return (
    booking.name &&
    booking.phone &&
    booking.service &&
    booking.appointment &&
    isServiceConfirmationFresh(booking)
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

      // Ensure global tempBookings object exists
      const tempBookings = (global.tempBookings = global.tempBookings || {});

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

          // ✅ FIX: Validate booking state before accepting service
          if (!tempBookings[from] || !tempBookings[from].phone) {
            await sendTextMessage(
              from,
              "⚠️ يرجى إكمال خطوات الحجز أولاً (الموعد، الاسم، رقم الجوال)"
            );
            resetUserState(from, tempBookings);
            return res.sendStatus(200);
          }

          // ✅ FIX: Validate service is in our list
          if (!VALID_SERVICES.includes(serviceName)) {
            await sendTextMessage(
              from,
              "⚠️ خدمة غير صحيحة. يرجى اختيار خدمة من القائمة."
            );
            await sendServiceList(from);
            return res.sendStatus(200);
          }

          tempBookings[from].service = serviceName;
          tempBookings[from].serviceConfirmedAt = Date.now(); // ✅ FIX: Timestamp

          const booking = tempBookings[from];

          // ✅ FIX: Final validation before saving
          if (!canSaveBooking(booking)) {
            await sendTextMessage(
              from,
              "⚠️ حدث خطأ في الحجز. يرجى المحاولة مرة أخرى."
            );
            resetUserState(from, tempBookings);
            return res.sendStatus(200);
          }

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

      // 🚫 FIX: Check for ban words AND reset state
      if (containsBanWords(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendBanWordsResponse(from, language);

        // ✅ CRITICAL FIX: Reset conversation state after ban
        resetUserState(from, tempBookings);
        return res.sendStatus(200);
      }

      // 📍 Location / offers / doctors detection
      if (isLocationRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, language);
        return res.sendStatus(200);
      }

      if (isOffersRequest(text)) {
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
        await sendTextMessage(
          from,
          "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
        );
        return res.sendStatus(200);
      }

      // 🧩 Step 4: Service input (manual fallback)
      if (tempBookings[from] && !tempBookings[from].service) {
        const booking = tempBookings[from];
        const userService = text.trim();

        // ✅ FIX: Check if service confirmation is stale
        if (!isServiceConfirmationFresh(booking)) {
          console.log(`⚠️ DEBUG => Stale booking attempt for ${from}`);
        }

        // ✅ FIX: Better AI validation with more flexible prompt
        const aiReply = await askAI(
          `أنت مساعد عيادة طبية. لدينا هذه الخدمات: فحص عام، تنظيف الأسنان، تبييض الأسنان، حشو الأسنان، علاج الجذور، تركيب التركيبات، تقويم الأسنان، خلع الأسنان، الفينير، زراعة الأسنان، ابتسامة هوليود.

العميل يريد: "${userService}"

هل هذه الخدمة موجودة لدينا أو قريبة من خدماتنا؟ أجب فقط بـ "نعم" إذا كانت موجودة أو مشابهة، أو "لا" إذا كانت غير متعلقة بالأسنان أو الطب نهائياً.`
        );

        const isValidService =
          aiReply.toLowerCase().includes("نعم") ||
          aiReply.toLowerCase().includes("yes");

        if (!isValidService) {
          await sendTextMessage(
            from,
            `⚠️ عذراً، لا نقدم "${userService}" في عيادتنا. يرجى اختيار خدمة من القائمة أدناه:`
          );
          await sendServiceList(from);
          return res.sendStatus(200);
        }

        booking.service = userService;
        booking.serviceConfirmedAt = Date.now(); // ✅ FIX: Timestamp when service is validated

        // ✅ FIX: Final validation before saving
        if (!canSaveBooking(booking)) {
          await sendTextMessage(
            from,
            "⚠️ انتهت صلاحية الحجز. يرجى البدء من جديد."
          );
          resetUserState(from, tempBookings);
          await sendAppointmentOptions(from);
          return res.sendStatus(200);
        }

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

      // 💬 Step 5: AI Chat fallback
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
