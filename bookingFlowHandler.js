/**
 * bookingFlowHandler.js
 *
 * Responsibilities:
 * - Coordinate booking flow steps.
 * - Handle interactive messages (buttons/lists) for appointments and services.
 * - Route text messages to appropriate step handlers.
 */

const {
  askAI,
  sendTextMessage,
  sendAppointmentOptions,
  saveBooking,
} = require("./helpers");

const { isBookingRequest } = require("./messageHandlers");

const {
  handleNameStep,
  handlePhoneStep,
  handleServiceStep,
  isSideQuestion,
} = require("./bookingSteps");

// ---------------------------------------------
// 🧠 Session storage (per-user conversation memory)
// ---------------------------------------------
const sessions = {}; // { userId: { ...state } }

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

/**
 * Handle interactive messages (buttons/lists)
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
        await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت المناسب 👇");
        await sendAppointmentOptions(from);
      }, 2000);

      return;
    }

    tempBookings[from] = { appointment };
    await sendTextMessage(from, "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:");
    return;
  }

  if (id?.startsWith("service_")) {
    const serviceName = id.replace("service_", "").replace(/_/g, " ");
    if (!tempBookings[from] || !tempBookings[from].phone) {
      await sendTextMessage(
        from,
        "⚠️ يرجى إكمال خطوات الحجز أولاً (الموعد، الاسم، رقم الجوال)"
      );
      return;
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
    return;
  }
}

/**
 * Handle text messages throughout the booking flow
 */
async function handleTextMessage(text, from, tempBookings) {
  // 🧩 Step 1: Appointment shortcut
  if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
    const appointment = `${text} PM`;
    tempBookings[from] = { appointment };
    await sendTextMessage(from, "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:");
    return;
  }

  // 🧩 Step 2: Name input
  if (tempBookings[from] && !tempBookings[from].name) {
    await handleNameStep(text, from, tempBookings);
    return;
  }

  // 🧩 Step 3: Phone input
  if (tempBookings[from] && !tempBookings[from].phone) {
    await handlePhoneStep(text, from, tempBookings);
    return;
  }

  // 🧩 Step 4: Service input
  if (tempBookings[from] && !tempBookings[from].service) {
    await handleServiceStep(text, from, tempBookings);
    return;
  }

  // 💬 Step 5: Booking or AI fallback
  if (!tempBookings[from]) {
    // 🗓️ If user wants to book (even with typos)
    if (isBookingRequest(text)) {
      console.log(`✅ Booking intent detected from ${from}`);
      await sendAppointmentOptions(from);
      return;
    }

    // 💬 Otherwise fallback to AI
    const reply = await askAI(text);
    await sendTextMessage(from, reply);
    return;
  }
}

module.exports = {
  getSession,
  handleInteractiveMessage,
  handleTextMessage,
};
