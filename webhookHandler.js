/**
 * webhookHandler.js
 *
 * Added Feature:
 *  - User can cancel a booking using "الغاء" or "الغاء الحجز"
 *  - Bot asks for phone number
 *  - Checks Supabase bookings table
 *  - Deletes the booking if phone matches
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

// ---------------------------------------------
// 🆕 Supabase connection
// ---------------------------------------------
const supabase = require("./supabaseClient");

// ---------------------------------------------
// 🧠 Session storage
// ---------------------------------------------
const sessions = {};
const cancelRequest = {}; // Used ONLY for cancellation

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      waitingForOffersConfirmation: false,
      waitingForDoctorConfirmation: false,
      waitingForBookingDetails: false,
      lastIntent: null,
    };
  }
  return sessions[userId];
}

// ---------------------------------------------
// Helper: detect "side questions"
// ---------------------------------------------
function isSideQuestion(text = "") {
  if (!text) return false;
  const t = text.toLowerCase();
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

// ---------------------------------------------
// 🆕 Detect cancellation intent
// ---------------------------------------------
function isCancelRequest(text = "") {
  const t = text.trim();
  return (
    t === "الغاء" ||
    t === "إلغاء" ||
    t === "الغاء الحجز" ||
    t === "إلغاء الحجز" ||
    t.toLowerCase() === "cancel"
  );
}

// ---------------------------------------------
// 🆕 Normalize phone number
// ---------------------------------------------
function normalizePhone(text) {
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

// ---------------------------------------------
// 🆕 Cancel booking by phone from Supabase
// ---------------------------------------------
async function cancelBooking(phone, from) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("phone", phone);

  if (error) {
    console.error("DB error:", error);
    await sendTextMessage(from, "❌ حدث خطأ أثناء إلغاء الحجز.");
    return;
  }

  if (!data || data.length === 0) {
    await sendTextMessage(from, "⚠️ لا يوجد حجز بهذا الرقم.");
    return;
  }

  // Delete booking matched by phone
  const bookingId = data[0].id;

  await supabase.from("bookings").delete().eq("id", bookingId);

  // optional: save to history
  await supabase.from("booking_history").insert({
    booking_id: bookingId,
    old_status: data[0].status || "Booked",
    new_status: "Canceled",
    changed_by: "User",
  });

  await sendTextMessage(from, "✅ تم إلغاء الحجز بنجاح.");
}

// ---------------------------------------------
// Send step prompt
// ---------------------------------------------
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

  if (prompts[step]) await prompts[step]();
}

// ---------------------------------------------
// Webhook handler
// ---------------------------------------------
function registerWebhookRoutes(app, VERIFY_TOKEN) {
  // Verify webhook
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

  // POST webhook (messages)
  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = message?.from;
      const session = getSession(from);

      if (!message || !from) return res.sendStatus(200);

      // TEXT MESSAGE
      const text = message.text?.body?.trim();

      // 🆕 FIRST PRIORITY — Cancellation keywords
      if (text && isCancelRequest(text)) {
        cancelRequest[from] = true;
        await sendTextMessage(from, "📱 أرسل رقم الهاتف لإلغاء الحجز:");
        return res.sendStatus(200);
      }

      // 🆕 PROCESS PHONE FOR CANCELLATION
      if (cancelRequest[from]) {
        const phone = normalizePhone(text);

        if (!/^07\d{8}$/.test(phone)) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 07XXXXXXXX"
          );
          return res.sendStatus(200);
        }

        await cancelBooking(phone, from);

        delete cancelRequest[from];
        return res.sendStatus(200);
      }

      // ----------------------------------------------------
      // The rest of your original EXACT booking logic
      // ----------------------------------------------------

      // Ignore non user events
      if (!message.text && !message.audio && !message.interactive) {
        return res.sendStatus(200);
      }

      // audio
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // greetings
      if (text && isGreeting(text)) {
        const reply = getGreeting(isEnglish(text));
        await sendTextMessage(from, reply);
        return res.sendStatus(200);
      }

      // ban words
      if (text && containsBanWords(text)) {
        await sendBanWordsResponse(from, isEnglish(text) ? "en" : "ar");
        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // Location
      if (text && isLocationRequest(text)) {
        await sendLocationMessages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      // Offers
      if (text && isOffersRequest(text)) {
        session.waitingForOffersConfirmation = true;
        session.lastIntent = "offers";
        await sendOffersValidity(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      if (session.waitingForOffersConfirmation) {
        if (isOffersConfirmation(text)) {
          session.waitingForOffersConfirmation = false;
          session.lastIntent = null;
          await sendOffersImages(from, isEnglish(text) ? "en" : "ar");
          return res.sendStatus(200);
        }
        session.waitingForOffersConfirmation = false;
      }

      if (text && isDoctorsRequest(text)) {
        await sendDoctorsImages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      // Friday detector
      const fridayWords = ["الجمعة", "Friday", "friday"];
      if (text && fridayWords.some((w) => text.includes(w))) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز 🌷"
        );
        await sendAppointmentOptions(from);
        return res.sendStatus(200);
      }

      // ----------------------------------------------------
      // Booking flow (unchanged)
      // ----------------------------------------------------

      // Step 1: Quick appointment shortcut
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        tempBookings[from] = { appointment: `${text} PM` };
        await sendTextMessage(from, "👍 تم اختيار الموعد! أرسل اسمك الآن:");
        return res.sendStatus(200);
      }

      // Step 2: Name
      if (tempBookings[from] && !tempBookings[from].name) {
        if (isSideQuestion(text)) {
          await sendTextMessage(from, await askAI(text));
          await sendTextMessage(from, "نكمّل الحجز؟ أرسل اسمك 😊");
          return res.sendStatus(200);
        }

        if (!(await validateNameWithAI(text))) {
          await sendTextMessage(from, "⚠️ الرجاء إدخال اسم صحيح.");
          return res.sendStatus(200);
        }

        tempBookings[from].name = text;
        await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
        return res.sendStatus(200);
      }

      // Step 3: Phone
      if (tempBookings[from] && !tempBookings[from].phone) {
        const phone = normalizePhone(text);

        if (!/^07\d{8}$/.test(phone)) {
          await sendTextMessage(from, "⚠️ الرجاء إدخال رقم أردني صحيح.");
          return res.sendStatus(200);
        }

        tempBookings[from].phone = phone;
        await sendServiceList(from);
        return res.sendStatus(200);
      }

      // Step 4: Service
      if (tempBookings[from] && !tempBookings[from].service) {
        tempBookings[from].service = text;
        await saveBooking(tempBookings[from]);
        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك:\n👤 ${tempBookings[from].name}\n📱 ${tempBookings[from].phone}\n💊 ${tempBookings[from].service}\n📅 ${tempBookings[from].appointment}`
        );
        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // If no booking session → fallback to AI
      if (!tempBookings[from]) {
        if (isBookingRequest(text)) {
          await sendAppointmentOptions(from);
          return res.sendStatus(200);
        }

        await sendTextMessage(from, await askAI(text));
        return res.sendStatus(200);
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error("Webhook error:", err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
