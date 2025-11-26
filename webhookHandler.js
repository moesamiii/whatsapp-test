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
 * - Handle booking cancellation requests and update Supabase database.
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
const { createClient } = require("@supabase/supabase-js");

// 🔑 Initialize Supabase
const SUPABASE_URL = "https://ylsbmxedhycjqaorjkvm.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2JteGVkaHljanFhb3Jqa3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTk5NTUsImV4cCI6MjA3NjM5NTk1NX0.W61xOww2neu6RA4yCJUob66p4OfYcgLSVw3m3yttz1E";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
 * Detect cancellation request keywords
 */
function isCancellationRequest(text = "") {
  if (!text) return false;
  const t = text.trim().toLowerCase();

  const cancelKeywords = [
    "إلغاء",
    "الغي",
    "الغاء",
    "الغ",
    "cancel",
    "delete",
    "حذف",
    "أريد الغاء",
    "اريد الغاء",
    "لا أريد",
    "لا اريد",
    "لا أبي",
    "لا ابي",
    "الحجز الغي",
    "الحجز الغاء",
    "الحجز ألغي",
    "الحجز الغايه",
  ];

  return cancelKeywords.some((kw) => t.includes(kw));
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

/**
 * Cancel user booking in Supabase
 */
async function cancelUserBooking(from, phone) {
  try {
    // Find booking by phone number (since we don't have booking ID in WhatsApp)
    const { data: existingBooking, error: fetchError } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error("❌ Error fetching booking for cancellation:", fetchError);
      return false;
    }

    if (!existingBooking || existingBooking.length === 0) {
      await sendTextMessage(from, "⚠️ لم نجد حجزًا مسجلاً باسم هذا الرقم.");
      return false;
    }

    const booking = existingBooking[0];

    // Update status to "Canceled By User"
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status: "Canceled By User" })
      .eq("id", booking.id);

    if (updateError) {
      console.error("❌ Error updating booking status:", updateError);
      await sendTextMessage(from, "❌ حدث خطأ أثناء إلغاء الحجز.");
      return false;
    }

    // Log to history
    await supabase.from("booking_history").insert([
      {
        booking_id: booking.id,
        old_status: booking.status || "Still",
        new_status: "Canceled By User",
        changed_by: "WhatsApp User",
      },
    ]);

    console.log(`✅ Booking canceled: ${booking.name} (${phone})`);
    await sendTextMessage(
      from,
      "✅ تم إلغاء حجزك بنجاح 😢\nإذا غيرت رأيك، تواصل معنا مجددًا للحجز من جديد 💙"
    );

    return true;
  } catch (err) {
    console.error("❌ Error in cancelUserBooking:", err.message);
    return false;
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

      // 📍 Location / offers / doctors detection
      if (isLocationRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, language);
        return res.sendStatus(200);
      }

      // Offers logic (smart)
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

      // 🚨 CANCELLATION REQUEST - Check if user wants to cancel booking
      if (isCancellationRequest(text)) {
        console.log(`🚨 Cancellation request detected from ${from}`);

        // If user is in booking process, clear it
        if (tempBookings[from]) {
          delete tempBookings[from];
          await sendTextMessage(from, "✅ تم إلغاء عملية الحجز الحالية 👌");
          return res.sendStatus(200);
        }

        // If user has completed a booking, ask for phone to find it in database
        await sendTextMessage(
          from,
          "للتأكد من إلغاء حجزك، أرسل لنا رقم الجوال المسجل في الحجز:"
        );

        // Store that we're waiting for a cancellation phone
        tempBookings[from] = { awaitingCancellationPhone: true };
        return res.sendStatus(200);
      }

      // ⛔ If user is providing phone for cancellation
      if (
        tempBookings[from] &&
        tempBookings[from].awaitingCancellationPhone &&
        !tempBookings[from].name
      ) {
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

        // Try to cancel the booking
        await cancelUserBooking(from, normalized);
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
