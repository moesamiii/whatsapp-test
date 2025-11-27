/**
 * bookingFlowHandler.js
 *
 * Responsibilities:
 * - Handle booking flow + cancel booking flow
 */

const {
  askAI,
  sendTextMessage,
  sendAppointmentOptions,
  saveBooking,
} = require("./helpers");

const { isBookingRequest, isCancelRequest } = require("./messageHandlers");

const { findBookingByPhone, cancelBooking } = require("./supabaseService");

const {
  handleNameStep,
  handlePhoneStep,
  handleServiceStep,
  isSideQuestion,
} = require("./bookingSteps");

// ---------------------------------------------
// 🧠 Sessions memory per user
// ---------------------------------------------
const sessions = {};

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      waitingForOffersConfirmation: false,
      waitingForDoctorConfirmation: false,
      waitingForBookingDetails: false,
      waitingForCancelPhone: false, // <--- NEW
      lastIntent: null,
    };
  }
  return sessions[userId];
}

/**
 * Handle interactive WhatsApp messages
 */
async function handleInteractiveMessage(message, from, tempBookings) {
  const interactiveType = message.interactive?.type;
  const id =
    interactiveType === "list_reply"
      ? message.interactive?.list_reply?.id
      : message.interactive?.button_reply?.id;

  if (id?.startsWith("slot_")) {
    const appointment = id.replace("slot_", "").toUpperCase();

    const fridayWords = ["الجمعة", "Friday", "friday"];
    if (fridayWords.some((w) => appointment.toLowerCase().includes(w))) {
      await sendTextMessage(
        from,
        "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر."
      );
      setTimeout(async () => {
        await sendAppointmentOptions(from);
      }, 1500);
      return;
    }

    tempBookings[from] = { appointment };
    await sendTextMessage(from, "👍 تم اختيار الموعد! الآن أرسل اسمك:");
    return;
  }

  if (id?.startsWith("service_")) {
    const serviceName = id.replace("service_", "").replace(/_/g, " ");
    if (!tempBookings[from] || !tempBookings[from].phone) {
      await sendTextMessage(from, "⚠️ يرجى إكمال خطوات الحجز أولاً.");
      return;
    }

    tempBookings[from].service = serviceName;
    const booking = tempBookings[from];
    await saveBooking(booking);

    await sendTextMessage(
      from,
      `✅ تم حفظ الحجز:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
    );

    delete tempBookings[from];
    return;
  }
}

/**
 * Handle text messages in booking flow
 */
async function handleTextMessage(text, from, tempBookings) {
  const session = getSession(from);

  /* ---------------------------------------------
   * ✨ CANCEL BOOKING FLOW
   * ---------------------------------------------*/
  if (isCancelRequest(text)) {
    session.waitingForCancelPhone = true;
    await sendTextMessage(from, "🔢 أرسل رقم الجوال المرتبط بالحجز:");
    return;
  }

  if (session.waitingForCancelPhone) {
    session.waitingForCancelPhone = false;

    const phone = text.replace(/\D/g, "");
    const booking = await findBookingByPhone(phone);

    if (!booking) {
      await sendTextMessage(from, "❌ لم يتم العثور على حجز بهذا الرقم.");
      return;
    }

    await cancelBooking(booking.id);

    await sendTextMessage(from, "✅ تم إلغاء الحجز بنجاح.");
    return;
  }

  /* ---------------------------------------------
   * 🧩 Bookings
   * ---------------------------------------------*/
  if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
    tempBookings[from] = { appointment: `${text} PM` };
    await sendTextMessage(from, "👍 الآن أرسل اسمك:");
    return;
  }

  if (tempBookings[from] && !tempBookings[from].name) {
    await handleNameStep(text, from, tempBookings);
    return;
  }

  if (tempBookings[from] && !tempBookings[from].phone) {
    await handlePhoneStep(text, from, tempBookings);
    return;
  }

  if (tempBookings[from] && !tempBookings[from].service) {
    await handleServiceStep(text, from, tempBookings);
    return;
  }

  if (!tempBookings[from] && isBookingRequest(text)) {
    await sendAppointmentOptions(from);
    return;
  }

  // AI fallback
  const answer = await askAI(text);
  await sendTextMessage(from, answer);
}

module.exports = {
  getSession,
  handleInteractiveMessage,
  handleTextMessage,
};
