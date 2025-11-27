/**
 * webhookHandler.js
 *
 * Updated with Supabase cancellation flow
 */

const { askAI, sendTextMessage, sendAppointmentOptions } = require("./helpers");
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
  isCancellationRequest,
  isEnglish,
  containsBanWords,
  sendBanWordsResponse,
  isGreeting,
  getGreeting,
} = require("./messageHandlers");

const { handleAudioMessage } = require("./webhookProcessor");
const {
  handleInteractiveMessage,
  handleTextMessage,
  getSession,
} = require("./bookingFlowHandler");

// ✅ Supabase
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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

  // Webhook POST Handler
  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = message?.from;
      const session = getSession(from);

      if (!message || !from) return res.sendStatus(200);

      if (!message.text && !message.audio && !message.interactive) {
        console.log("ℹ️ Ignored non-text system webhook event");
        return res.sendStatus(200);
      }

      const tempBookings = (global.tempBookings = global.tempBookings || {});

      // 🎤 Audio
      if (message.type === "audio") {
        await handleAudioMessage(message, from);
        return res.sendStatus(200);
      }

      // 🟦 Interactive Buttons / Lists
      if (message.type === "interactive") {
        await handleInteractiveMessage(message, from, tempBookings);
        return res.sendStatus(200);
      }

      // 💬 Text
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      // 👋 Greetings first
      if (isGreeting(text)) {
        await sendTextMessage(from, getGreeting(isEnglish(text)));
        return res.sendStatus(200);
      }

      // 🚫 Ban words
      if (containsBanWords(text)) {
        await sendBanWordsResponse(from, isEnglish(text) ? "en" : "ar");
        delete global.tempBookings[from];
        return res.sendStatus(200);
      }

      // =======================================
      // ❌ SUPABASE CANCELLATION LOGIC START
      // =======================================

      // If user says "cancel"
      if (isCancellationRequest(text)) {
        session.waitingForCancellationPhone = true;

        const msg = isEnglish(text)
          ? "Sure! Please send me the phone number used for the booking:"
          : "أكيد! أرسل رقم الجوال المسجل بالحجز:";

        await sendTextMessage(from, msg);
        return res.sendStatus(200);
      }

      // If system is currently waiting for user to send phone number
      if (session.waitingForCancellationPhone) {
        const phone = text.replace(/\D/g, "");

        if (phone.length < 7) {
          await sendTextMessage(
            from,
            isEnglish(text)
              ? "❌ Invalid phone number, please send a correct one."
              : "❌ الرقم غير صحيح، أعد إرسال رقم الجوال."
          );
          return res.sendStatus(200);
        }

        session.waitingForCancellationPhone = false;

        // 🔍 Find booking in Supabase
        const { data: bookings, error } = await supabase
          .from("bookings")
          .select("*")
          .eq("phone", phone)
          .neq("status", "cancelled")
          .order("id", { ascending: false })
          .limit(1);

        if (error) {
          console.error("Supabase error:", error);
          await sendTextMessage(
            from,
            isEnglish(text)
              ? "⚠️ Error accessing the booking system."
              : "⚠️ حدث خطأ أثناء الوصول لقاعدة البيانات."
          );
          return res.sendStatus(200);
        }

        if (!bookings || bookings.length === 0) {
          await sendTextMessage(
            from,
            isEnglish(text)
              ? "❌ No active booking found with that phone number."
              : "❌ لم يتم العثور على حجز بهذا الرقم."
          );
          return res.sendStatus(200);
        }

        const booking = bookings[0];

        // 🟢 Update status to cancelled
        await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", booking.id);

        const responseMessage = isEnglish(text)
          ? `✅ Your booking has been cancelled.

📋 Booking Details:
👤 Name: ${booking.name}
📞 Phone: ${booking.phone}
💊 Service: ${booking.service}
📅 Appointment: ${booking.appointment}`
          : `✅ تم إلغاء الحجز بنجاح.

📋 تفاصيل الحجز:
👤 الاسم: ${booking.name}
📞 الجوال: ${booking.phone}
💊 الخدمة: ${booking.service}
📅 الموعد: ${booking.appointment}`;

        await sendTextMessage(from, responseMessage);
        return res.sendStatus(200);
      }

      // =======================================
      // ❌ SUPABASE CANCELLATION LOGIC END
      // =======================================

      // 📍 Location request
      if (isLocationRequest(text)) {
        await sendLocationMessages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      // 🎁 Offers
      if (isOffersRequest(text)) {
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
        session.lastIntent = null;
      }

      // 👨‍⚕️ Doctors
      if (isDoctorsRequest(text)) {
        await sendDoctorsImages(from, isEnglish(text) ? "en" : "ar");
        return res.sendStatus(200);
      }

      // Friday off message
      const fridayWords = ["الجمعة", "Friday", "friday"];
      if (
        fridayWords.some((w) => text.toLowerCase().includes(w.toLowerCase()))
      ) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة. يرجى اختيار يوم آخر 🌷"
        );
        setTimeout(async () => {
          await sendTextMessage(from, "📅 اختر الوقت المناسب للحجز 👇");
          await sendAppointmentOptions(from);
        }, 1200);
        return res.sendStatus(200);
      }

      // Otherwise continue booking flow
      await handleTextMessage(text, from, tempBookings);

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ Webhook handler error:", err);
      return res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
