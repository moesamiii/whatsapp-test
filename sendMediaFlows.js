/**
 * sendMediaFlows.js
 *
 * Purpose:
 * - Handle media message flows such as sending offers or doctors images.
 * - Keep WhatsApp message sending logic modular and reusable.
 * - Includes full booking integration (Book Appointment button ➜ services ➜ time).
 */

const axios = require("axios"); // ✅ Add axios import
const {
  sendTextMessage,
  sendAppointmentButtons,
  sendServiceList,
  saveBooking,
} = require("./helpers");
const { OFFER_IMAGES, DOCTOR_IMAGES } = require("./mediaAssets");
const { sendImageMessage } = require("./messageHandlers"); // unified import

// ---------------------------------------------
// ⏱️ Helper: delay
// ---------------------------------------------
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------
// 📅 Send "Book Appointment" button (entry point)
// ---------------------------------------------
async function sendStartBookingButton(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending 'Start Booking' button to ${to}`);

    const buttonText =
      language === "en"
        ? "📅 Ready to book an appointment?"
        : "📅 جاهز لحجز موعدك؟";

    const buttonActionText =
      language === "en"
        ? "Click below to start booking 👇"
        : "اضغط أدناه لبدء عملية الحجز 👇";

    // Send an interactive button for booking
    await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: `${buttonText}\n${buttonActionText}` },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "start_booking",
                  title: language === "en" ? "Start Booking" : "ابدأ الحجز",
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

    console.log("✅ DEBUG => Start Booking button sent successfully");
  } catch (err) {
    console.error(
      "❌ DEBUG => Failed to send start booking button:",
      err.message
    );
  }
}

// ---------------------------------------------
// 🎁 Send Offers & Booking Flow (UPDATED WITH BOOKING BUTTON)
// ---------------------------------------------
async function sendOffersImages(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending offers & booking flow to ${to}...`);

    // Step 1: Send intro message
    await sendTextMessage(
      to,
      language === "en"
        ? "💊 Here are our offers and services:"
        : "💊 هذه عروضنا وخدماتنا الحالية:"
    );

    await delay(500);

    // Step 2: Send offers images
    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1) await delay(800);
    }

    await delay(800);

    // Step 3: Send booking button directly (احجز)
    console.log(`📤 DEBUG => Sending 'احجز' booking button to ${to}`);

    await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text:
              language === "en"
                ? "✨ Would you like to book an appointment for one of these offers?\n\nClick below to start your booking 👇"
                : "✨ هل ترغب بحجز موعد لأحد هذه العروض؟\n\nاضغط أدناه لبدء الحجز 👇",
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "start_booking_offers",
                  title: language === "en" ? "Book Now" : "احجز",
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

    console.log("✅ Offers flow with 'احجز' booking button sent successfully.");
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

    // Step 1: Intro
    await sendTextMessage(
      to,
      language === "en"
        ? "👨‍⚕️ Meet our professional medical team:"
        : "👨‍⚕️ تعرف على فريقنا الطبي المتخصص:"
    );

    await delay(500);

    // Step 2: Send doctors images
    for (let i = 0; i < DOCTOR_IMAGES.length; i++) {
      await sendImageMessage(to, DOCTOR_IMAGES[i]);
      if (i < DOCTOR_IMAGES.length - 1) await delay(800);
    }

    await delay(600);

    // Step 3: Send booking button directly (احجز)
    console.log(`📤 DEBUG => Sending 'احجز' booking button to ${to}`);

    await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text:
              language === "en"
                ? "✨ Would you like to book an appointment with one of our doctors?\n\nClick below to start your booking 👇"
                : "✨ هل ترغب بحجز موعد مع أحد أطبائنا؟\n\nاضغط أدناه لبدء الحجز 👇",
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "start_booking_doctors",
                  title: language === "en" ? "Book Now" : "احجز",
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

    console.log(
      "✅ Doctors flow with 'احجز' booking button sent successfully."
    );
  } catch (err) {
    console.error("❌ DEBUG => Error in doctors flow:", err.message);
  }
}

// ---------------------------------------------
// 🧾 Handle booking interaction (after button press)
// ---------------------------------------------
async function handleBookingFlow(to, userData = {}, language = "ar") {
  try {
    console.log(`📥 DEBUG => Booking flow started for ${to}`);

    // Step 1: Send service list (dropdown)
    await sendServiceList(to);

    // Note: Don't send appointment buttons here yet!
    // Wait for user to select service first, then send appointment buttons
    // Your webhook will handle the flow step by step

    console.log("✅ Booking flow initiated (waiting for service selection)");
  } catch (err) {
    console.error("❌ DEBUG => Failed booking flow:", err.message);
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
