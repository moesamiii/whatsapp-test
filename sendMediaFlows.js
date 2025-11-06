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
// 📱 Send Booking Start Button
// ---------------------------------------------
async function sendBookingStartButton(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending booking start button to ${to}`);

    const bodyText =
      language === "en"
        ? "📅 Ready to book your appointment? Click the button below to start!"
        : "📅 جاهز لحجز موعدك؟ اضغط على الزر بالأسفل للبدء!";

    const buttonText = language === "en" ? "Start Booking" : "بدء الحجز";

    await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: bodyText,
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "start_booking_flow",
                  title: buttonText,
                },
              },
            ],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ DEBUG => Booking start button sent successfully");
  } catch (err) {
    console.error("❌ DEBUG => Error sending booking button:", err.message);
    // Fallback to text message
    await sendTextMessage(
      to,
      language === "en"
        ? "📅 Ready to book your appointment? Let's start!"
        : "📅 جاهز لحجز موعدك؟ لنبدأ!"
    );
    await delay(600);
    await sendServiceList(to);
  }
}

// ---------------------------------------------
// 📅 Start booking flow (entry point) - WITH BUTTON
// ---------------------------------------------
async function sendStartBookingButton(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending start booking intro to ${to}`);

    // First send intro text
    const introText =
      language === "en"
        ? "🎉 Welcome! I can help you book an appointment at our clinic."
        : "🎉 أهلاً وسهلاً! يمكنني مساعدتك في حجز موعد في عيادتنا.";

    await sendTextMessage(to, introText);
    await delay(800);

    // Then send the booking start button
    await sendBookingStartButton(to, language);

    console.log("✅ DEBUG => Booking start button sent successfully");
  } catch (err) {
    console.error("❌ DEBUG => Error starting booking:", err.message);
  }
}

// ---------------------------------------------
// 🎁 Send Offers (with booking button)
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

    // Step 3: Invite to booking WITH button (make sure this is the last message)
    await delay(1000);

    // Send the booking button directly without additional text
    await sendBookingStartButton(to, language);

    console.log("✅ Offers flow completed — booking button shown.");
  } catch (err) {
    console.error("❌ DEBUG => Error in offers flow:", err.message);
  }
}

// ---------------------------------------------
// 👨‍⚕️ Send Doctors & Booking Flow (with button)
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

    // Step 3: Invite to booking WITH button (make sure this is the last message)
    await delay(1000);

    // Send the booking button directly without additional text
    await sendBookingStartButton(to, language);

    console.log("✅ Doctors flow completed — booking button shown.");
  } catch (err) {
    console.error("❌ DEBUG => Error in doctors flow:", err.message);
  }
}

// ---------------------------------------------
// 🧾 Handle booking interaction (when button is clicked)
// ---------------------------------------------
async function handleBookingFlow(to, userData = {}, language = "ar") {
  try {
    console.log(
      `📥 DEBUG => Booking flow triggered for ${to} (button clicked)`
    );

    // Send confirmation message
    await sendTextMessage(
      to,
      language === "en"
        ? "🎉 Great! Let's book your appointment. Please choose a service:"
        : "🎉 ممتاز! لنحجز موعدك. يرجى اختيار الخدمة:"
    );

    await delay(600);

    // Start the service selection
    await sendServiceList(to);

    console.log("✅ Booking flow initiated — awaiting service selection.");
  } catch (err) {
    console.error("❌ DEBUG => Failed to handle booking flow:", err.message);
  }
}

// ---------------------------------------------
// 🆕 Quick Booking Button (standalone)
// ---------------------------------------------
async function sendQuickBookingButton(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending quick booking button to ${to}`);

    const bodyText =
      language === "en"
        ? "💫 Need to book an appointment quickly? Click below to start!"
        : "💫 تحتاج لحجز موعد بسرعة؟ اضغط بالأسفل للبدء!";

    const buttonText = language === "en" ? "Book Now" : "احجز الآن";

    await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: bodyText,
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "quick_booking",
                  title: buttonText,
                },
              },
            ],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ DEBUG => Quick booking button sent successfully");
  } catch (err) {
    console.error(
      "❌ DEBUG => Error sending quick booking button:",
      err.message
    );
    // Fallback
    await handleBookingFlow(to, {}, language);
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
  sendBookingStartButton,
  sendQuickBookingButton,
};
