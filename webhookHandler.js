/**
 * webhookHandler.js
 *
 * Responsibilities:
 * - Register the /webhook verification route (GET) and webhook receiver (POST).
 * - Handle non-audio messages: interactive (buttons/lists) and plain text messages.
 * - Manage the booking flow for text & interactive flows (appointment selection, name, phone, service).
 * - Delegate audio-specific handling (transcription + voice booking) to webhookProcessor.js.
 * - Filter inappropriate content using ban words detection.
 * - Handle side questions within booking flow and return to the exact booking step.
 * - Handle booking cancellation requests.
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

// ✅ Import Supabase for cancellation feature
const { createClient } = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ✅ Cancellation detection
function isCancellationRequest(text = "") {
  if (!text) return false;
  const t = text.trim().toLowerCase();

  const cancellationKeywords = [
    "الغاء",
    "الغي",
    "الغاء الحجز",
    "إلغاء",
    "إلغي",
    "إلغاء الحجز",
    "cancel",
    "cancellation",
    "cancel booking",
    "delete booking",
    "remove booking",
    "ما بدي",
    "ما ابدى",
    "مش باخذ موعد",
    "لا بدي موعد",
  ];

  return cancellationKeywords.some((kw) => t.includes(kw));
}

// ✅ Normalize phone number
function normalizePhone(text = "") {
  return text
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

// ✅ Find booking by phone number
async function findBookingByPhone(phone) {
  try {
    const normalized = normalizePhone(phone);
    const isValid = /^07\d{8}$/.test(normalized);

    if (!isValid) {
      return {
        found: false,
        message:
          "⚠️ رقم الهاتف غير صحيح. الرجاء إدخال رقم أردني بصيغة: 07XXXXXXXX",
      };
    }

    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", normalized);

    if (error) {
      console.error("Database error:", error);
      return { found: false, message: "⚠️ حدث خطأ في الاتصال بقاعدة البيانات" };
    }

    if (!data || data.length === 0) {
      return {
        found: false,
        message: "❌ لم نجد حجزاً بهذا الرقم. تأكد من إدخال الرقم الصحيح.",
      };
    }

    return { found: true, bookings: data };
  } catch (err) {
    console.error("Error finding booking:", err);
    return { found: false, message: "⚠️ حدث خطأ أثناء البحث عن الحجز" };
  }
}

// ✅ Cancel booking
async function cancelBooking(bookingId) {
  try {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "Canceled by User" })
      .eq("id", bookingId);

    if (error) {
      console.error("Cancellation error:", error);
      return { success: false, message: "⚠️ فشل إلغاء الحجز" };
    }

    return {
      success: true,
      message: "✅ تم إلغاء حجزك بنجاح. شكراً لتواصلك معنا.",
    };
  } catch (err) {
    console.error("Error canceling booking:", err);
    return { success: false, message: "⚠️ حدث خطأ أثناء إلغاء الحجز" };
  }
}

// ✅ Session storage (per-user conversation memory)
// ---
const sessions = {}; // { userId: { ...state } }

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      waitingForOffersConfirmation: false,
      waitingForDoctorConfirmation: false,
      waitingForBookingDetails: false,
      waitingForCancellationPhone: false, // ✅ NEW: Cancellation state
      lastIntent: null,
    };
  }
  return sessions[userId];
}

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

/**
 * Get the current booking step for a user
 * Returns: "appointment" | "name" | "phone" | "service" | null
 */
function getCurrentBookingStep(tempBookings, from) {
  const booking = tempBookings[from];

  if (!booking) return null;
  if (!booking.appointment) return "appointment";
  if (!booking.name) return "name";
  if (!booking.phone) return "phone";
  if (!booking.service) return "service";

  return null;
}

/**
 * Send prompt message based on current booking step
 */
async function sendStepPrompt(from, step) {
  const prompts = {
    appointment: async () => {
      await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇");
      await sendAppointmentOptions(from);
    },
    name: async () => {
      await sendTextMessage(from, "👤 من فضلك ارسل اسمك:");
    },
    phone: async () => {
      await sendTextMessage(from, "📱 الآن أرسل رقم جوالك:");
    },
    service: async () => {
      await sendServiceList(from);
      await sendTextMessage(
        from,
        "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
      );
    },
  };

  if (prompts[step]) {
    await prompts[step]();
  }
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
      const session = getSession(from);

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

      // ✅ Handle cancellation phone input
      if (session.waitingForCancellationPhone) {
        session.waitingForCancellationPhone = false;
        const result = await findBookingByPhone(text);

        if (!result.found) {
          await sendTextMessage(from, result.message);
          return res.sendStatus(200);
        }

        if (result.bookings.length === 1) {
          const booking = result.bookings[0];
          const cancelResult = await cancelBooking(booking.id);
          await sendTextMessage(from, cancelResult.message);
        } else {
          // Multiple bookings found - show them
          let bookingsList = "📋 وجدنا عدة حجوزات برقمك:\n\n";
          result.bookings.forEach((b, idx) => {
            bookingsList += `${idx + 1}. الخدمة: ${b.service}\n   الموعد: ${
              b.appointment
            }\n   الحالة: ${b.status}\n\n`;
          });
          bookingsList +=
            "الرجاء الاتصال بنا على الرقم المعروض في القائمة لإلغاء الحجز المطلوب.";
          await sendTextMessage(from, bookingsList);
        }
        return res.sendStatus(200);
      }

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

      // ✅ Cancellation request detection
      if (isCancellationRequest(text)) {
        session.waitingForCancellationPhone = true;
        await sendTextMessage(
          from,
          "🔍 من فضلك أرسل رقم الهاتف المسجل لديك لإيجاد الحجز:"
        );
        return res.sendStatus(200);
      }

      // 📍 Location / offers / doctors detection
      if (isLocationRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, language);
        return res.sendStatus(200);
      }

      // Offers logic (smart)
      if (isOffersRequest(text)) {
        session.waitingForOffersConfirmation = true;
        session.lastIntent = "offers";

        const language = isEnglish(text) ? "en" : "ar";
        await sendOffersValidity(from, language);

        return res.sendStatus(200);
      }

      //Offer confirmation logic
      if (session.waitingForOffersConfirmation) {
        if (isOffersConfirmation(text)) {
          session.waitingForOffersConfirmation = false;
          session.lastIntent = null;

          const language = isEnglish(text) ? "en" : "ar";
          await sendOffersImages(from, language);
          return res.sendStatus(200);
        }

        // User said something else → reset and keep going
        session.waitingForOffersConfirmation = false;
        session.lastIntent = null;
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
        // ⭐ User asked a side question while booking
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);

          // Return to the name step
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
        // ⭐ User asked a side question while booking
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);

          // Return to the phone step
          await sendTextMessage(from, "تمام! الآن أرسل رقم جوالك:");
          return res.sendStatus(200);
        }

        const normalized = normalizePhone(text);
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
        // ⭐ User asked a side question while booking
        if (isSideQuestion(text)) {
          const answer = await askAI(text);
          await sendTextMessage(from, answer);

          // Return to the service step
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
