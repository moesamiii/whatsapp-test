/**
 * sendMediaFlows.js
 *
 * Purpose:
 * - Handle media message flows (offers, doctors, etc.).
 * - Keep WhatsApp message sending logic modular and reusable.
 * - Integrate with Google Sheets booking via helpers.js.
 */

const axios = require("axios");
const { sendTextMessage, sendServiceList, saveBooking } = require("./helpers");
const { OFFER_IMAGES, DOCTOR_IMAGES } = require("./mediaAssets");
const { sendImageMessage } = require("./messageHandlers");

// ---------------------------------------------
// ⏱️ Helper: delay
// ---------------------------------------------
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------
// 📅 Start booking flow (entry point)
// ---------------------------------------------
async function sendStartBookingButton(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending start booking intro to ${to}`);

    const text =
      language === "en"
        ? "📅 Ready to book your appointment? Let's start!"
        : "📅 جاهز لحجز موعدك؟ لنبدأ!";

    await sendTextMessage(to, text);
    await delay(600);

    // Directly show service list (no buttons)
    await sendServiceList(to);

    console.log("✅ DEBUG => Booking flow started successfully");
  } catch (err) {
    console.error("❌ DEBUG => Error starting booking:", err.message);
  }
}

// ---------------------------------------------
// 🎁 Send Offers (auto booking prompt)
// ---------------------------------------------
async function sendOffersImages(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending offers & services flow to ${to}...`);

    // Step 1: Intro message
    await sendTextMessage(
      to,
      language === "en"
        ? "💊 Here are our current offers and services:"
        : "💊 هذه عروضنا وخدماتنا الحالية:"
    );

    await delay(600);

    // Step 2: Send offer images sequentially
    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1) await delay(900);
    }

    // Step 3: Invite to booking (without button)
    await delay(800);
    await sendTextMessage(
      to,
      language === "en"
        ? "✨ Would you like to book an appointment for one of these offers? Let’s start!"
        : "✨ هل ترغب بحجز موعد لأحد هذه العروض؟ لنبدأ الآن!"
    );

    await delay(800);
    await sendServiceList(to);

    console.log(
      "✅ Offers flow completed — booking flow started automatically."
    );
  } catch (err) {
    console.error("❌ DEBUG => Error in offers flow:", err.message);
  }
}

// ---------------------------------------------
// 👨‍⚕️ Send Doctors & Booking Flow
// ---------------------------------------------
async function sendDoctorsImages(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending doctors flow to ${to}...`);

    // Step 1: Intro message
    await sendTextMessage(
      to,
      language === "en"
        ? "👨‍⚕️ Meet our professional medical team:"
        : "👨‍⚕️ تعرف على فريقنا الطبي المتخصص:"
    );

    await delay(600);

    // Step 2: Send doctor images
    for (let i = 0; i < DOCTOR_IMAGES.length; i++) {
      await sendImageMessage(to, DOCTOR_IMAGES[i]);
      if (i < DOCTOR_IMAGES.length - 1) await delay(900);
    }

    // Step 3: Smooth transition into booking
    await delay(1000);
    await sendTextMessage(
      to,
      language === "en"
        ? "✨ Would you like to book an appointment with one of our doctors? Let's start!"
        : "✨ هل ترغب بحجز موعد مع أحد أطبائنا؟ لنبدأ!"
    );

    await delay(700);
    await sendServiceList(to);

    console.log(
      "✅ Doctors flow completed — booking flow initiated automatically."
    );
  } catch (err) {
    console.error("❌ DEBUG => Error in doctors flow:", err.message);
  }
}

// ---------------------------------------------
// 🧾 Handle booking interaction (fallback entry)
// ---------------------------------------------
async function handleBookingFlow(to, userData = {}, language = "ar") {
  try {
    console.log(`📥 DEBUG => Booking flow triggered for ${to}`);
    await sendServiceList(to);
    console.log("✅ Booking flow initiated — awaiting service selection.");
  } catch (err) {
    console.error("❌ DEBUG => Failed to handle booking flow:", err.message);
  }
}

// ---------------------------------------------
// ✅ Export everything
// ---------------------------------------------
module.exports = {
  sendOffersImages,
  sendDoctorsImages,
  handleBookingFlow,
  sendStartBookingButton,
};
