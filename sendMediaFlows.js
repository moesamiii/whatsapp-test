/**
 * sendMediaFlows.js
 *
 * Purpose:
 * - Handle media message flows such as sending offers or doctors images.
 * - Keep WhatsApp message sending logic modular and reusable.
 * - Now includes automatic booking (appointment button flow) after offers.
 */

const { sendTextMessage, sendAppointmentButtons } = require("./helpers");
const { OFFER_IMAGES, DOCTOR_IMAGES } = require("./mediaAssets");
const { sendImageMessage } = require("./messageHandlers"); // ✅ unified, no circular import risk

// ---------------------------------------------
// ⏱️ Helper: delay
// ---------------------------------------------
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 🎁 Send Offers & Services Images + Booking Buttons
 */
async function sendOffersImages(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending offers & booking flow to ${to}...`);

    // Intro text
    if (language === "en") {
      await sendTextMessage(to, "💊 Here are our offers and services:");
    } else {
      await sendTextMessage(to, "💊 هذه عروضنا وخدماتنا الحالية:");
    }

    await delay(500);

    // Send offer images sequentially
    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1) await delay(800);
    }

    await delay(600);

    // Follow-up message
    if (language === "en") {
      await sendTextMessage(
        to,
        "✨ For more details or to book an appointment, please choose a time below:"
      );
    } else {
      await sendTextMessage(
        to,
        "✨ لمزيد من التفاصيل أو لحجز موعد، اختر الوقت المناسب لك من الأزرار أدناه:"
      );
    }

    await delay(600);

    // Send appointment buttons (3 PM / 6 PM / 9 PM)
    await sendAppointmentButtons(to);

    console.log("✅ Offers + Booking buttons flow sent successfully.");
  } catch (err) {
    console.error("❌ Failed to send offers flow:", err.message || err);
  }
}

/**
 * 👨‍⚕️ Send Doctors Images (with optional booking flow)
 */
async function sendDoctorsImages(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending doctors media flow to ${to}...`);

    if (language === "en") {
      await sendTextMessage(to, "👨‍⚕️ Meet our professional medical team:");
    } else {
      await sendTextMessage(to, "👨‍⚕️ تعرف على فريقنا الطبي المتخصص:");
    }

    await delay(500);

    // Send doctor images sequentially
    for (let i = 0; i < DOCTOR_IMAGES.length; i++) {
      await sendImageMessage(to, DOCTOR_IMAGES[i]);
      if (i < DOCTOR_IMAGES.length - 1) await delay(800);
    }

    await delay(600);

    // Follow-up message + booking prompt
    if (language === "en") {
      await sendTextMessage(
        to,
        "✨ Our experienced doctors are ready to provide the best care! You can book your appointment below 👇"
      );
    } else {
      await sendTextMessage(
        to,
        "✨ أطباؤنا ذوو الخبرة جاهزون لتقديم أفضل رعاية لك! يمكنك حجز موعدك من الأزرار أدناه 👇"
      );
    }

    await delay(600);

    // Send appointment buttons as call-to-action
    await sendAppointmentButtons(to);

    console.log("✅ Doctors + Booking buttons flow sent successfully.");
  } catch (err) {
    console.error("❌ Failed to send doctors images:", err.message || err);
  }
}

// ---------------------------------------------
// ✅ Export
// ---------------------------------------------
module.exports = {
  sendOffersImages,
  sendDoctorsImages,
};
