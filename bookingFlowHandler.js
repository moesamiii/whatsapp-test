/**
 * bookingFlowHandler.js (FINAL — Save ONLY to Supabase)
 *
 * Responsibilities:
 * - Handle booking flow (name → phone → service)
 * - Handle cancel flow (detect → ask for phone → cancel)
 * - Handle interactive buttons (slots + services)
 */

const {
  askAI,
  sendTextMessage,
  sendAppointmentOptions,
  saveBooking, // <── now saves ONLY to Supabase (helpers.js)
  askForCancellationPhone,
  processCancellation,
} = require("./helpers");

const { isBookingRequest, isCancelRequest } = require("./messageHandlers");

const {
  handleNameStep,
  handlePhoneStep,
  handleServiceStep,
} = require("./bookingSteps");

// ---------------------------------------------
// 🧠 Sessions = per-user conversation state
// ---------------------------------------------
const sessions = {}; // { userId: { ...state } }

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      waitingForOffersConfirmation: false,
      waitingForDoctorConfirmation: false,
      waitingForBookingDetails: false,

      waitingForCancelPhone: false,
      lastIntent: null,
    };
  }
  return sessions[userId];
}

/**
 * ===========================
 *  📌 HANDLE BUTTON MESSAGES
 * ===========================
 */
async function handleInteractiveMessage(message, from, tempBookings) {
  const itype = message.interactive?.type;

  const id =
    itype === "list_reply"
      ? message.interactive?.list_reply?.id
      : message.interactive?.button_reply?.id;

  // ========== APPOINTMENT BUTTON ==========
  if (id?.startsWith("slot_")) {
    const appointment = id.replace("slot_", "").toUpperCase();
    tempBookings[from] = { appointment };

    await sendTextMessage(from, "👍 تم اختيار الموعد! الآن أرسل اسمك:");
    return;
  }

  // ========== SERVICE BUTTON ==========
  if (id?.startsWith("service_")) {
    const serviceName = id.replace("service_", "").replace(/_/g, " ");

    if (!tempBookings[from] || !tempBookings[from].phone) {
      await sendTextMessage(
        from,
        "⚠️ يجب إكمال خطوات الحجز قبل اختيار الخدمة."
      );
      return;
    }

    tempBookings[from].service = serviceName;
    const booking = tempBookings[from];

    // 1️⃣ SAVE BOOKING (helpers.js → ONLY Supabase)
    await saveBooking(booking);

    // 2️⃣ Confirmation
    await sendTextMessage(
      from,
      `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
    );

    delete tempBookings[from];
    return;
  }
}

/**
 * ===========================
 *  💬 HANDLE TEXT MESSAGES
 * ===========================
 */
async function handleTextMessage(text, from, tempBookings) {
  const session = getSession(from);

  /**
   * ---------------------------------------------
   * 🔥 CANCEL BOOKING SYSTEM
   * ---------------------------------------------
   */

  // Step 1 — Detect cancel intent
  if (isCancelRequest(text)) {
    session.waitingForCancelPhone = true;

    // stop any booking flow currently running
    if (tempBookings[from]) delete tempBookings[from];

    await askForCancellationPhone(from);
    return;
  }

  // Step 2 — Waiting for phone input to cancel booking
  if (session.waitingForCancelPhone) {
    const phone = text.replace(/\D/g, "");

    if (phone.length < 8) {
      await sendTextMessage(from, "⚠️ رقم الجوال غير صحيح. حاول مجددًا:");
      return;
    }

    session.waitingForCancelPhone = false;

    await processCancellation(from, phone);
    return;
  }

  /**
   * ---------------------------------------------
   * 🔥 BOOKING FLOW
   * ---------------------------------------------
   */

  // Quick shortcut (3,6,9 → PM)
  if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
    const appointment = `${text} PM`;
    tempBookings[from] = { appointment };

    await sendTextMessage(from, "👍 تم اختيار الموعد! الآن أرسل اسمك:");
    return;
  }

  // NAME STEP
  if (tempBookings[from] && !tempBookings[from].name) {
    await handleNameStep(text, from, tempBookings);
    return;
  }

  // PHONE STEP
  if (tempBookings[from] && !tempBookings[from].phone) {
    await handlePhoneStep(text, from, tempBookings);
    return;
  }

  // SERVICE STEP
  if (tempBookings[from] && !tempBookings[from].service) {
    await handleServiceStep(text, from, tempBookings);
    return;
  }

  // User wants to start booking
  if (!tempBookings[from] && isBookingRequest(text)) {
    await sendAppointmentOptions(from);
    return;
  }

  /**
   * ---------------------------------------------
   * 🤖 AI fallback
   * ---------------------------------------------
   */
  if (!tempBookings[from]) {
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
