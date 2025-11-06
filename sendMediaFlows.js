/**
 * sendMediaFlows.js
 *
 * Purpose:
 * - Handle media message flows such as sending offers or doctors images.
 * - Keep WhatsApp message sending logic modular and reusable.
 */

const { sendTextMessage } = require("./helpers");
const { OFFER_IMAGES, DOCTOR_IMAGES } = require("./mediaAssets");
const { sendImageMessage } = require("./messageHandlers_base"); // to avoid circular import

// Small helper for timed delays
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 🎁 Send Offers & Services Images
 */
async function sendOffersImages(to, language = "ar") {
  try {
    if (language === "en") {
      await sendTextMessage(to, "💊 Here are our offers and services:");
    } else {
      await sendTextMessage(to, "💊 هذه عروضنا وخدماتنا الحالية:");
    }

    await delay(500);

    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1) await delay(800);
    }

    await delay(500);

    if (language === "en") {
      await sendTextMessage(
        to,
        "✨ For more details or to book an appointment, just let me know!"
      );
    } else {
      await sendTextMessage(
        to,
        "✨ لمزيد من التفاصيل أو لحجز موعد، أخبرني فقط!"
      );
    }

    console.log("✅ Offers images sent successfully.");
  } catch (err) {
    console.error("❌ Failed to send offers images:", err.message || err);
  }
}

/**
 * 👨‍⚕️ Send Doctors Images
 */
async function sendDoctorsImages(to, language = "ar") {
  try {
    if (language === "en") {
      await sendTextMessage(to, "👨‍⚕️ Meet our professional medical team:");
    } else {
      await sendTextMessage(to, "👨‍⚕️ تعرف على فريقنا الطبي المتخصص:");
    }

    await delay(500);

    for (let i = 0; i < DOCTOR_IMAGES.length; i++) {
      await sendImageMessage(to, DOCTOR_IMAGES[i]);
      if (i < DOCTOR_IMAGES.length - 1) await delay(800);
    }

    await delay(500);

    if (language === "en") {
      await sendTextMessage(
        to,
        "✨ Our experienced doctors are here to provide you with the best care! To book an appointment, just let us know 😊"
      );
    } else {
      await sendTextMessage(
        to,
        "✨ أطباؤنا ذوو الخبرة هنا لتقديم أفضل رعاية لك! لحجز موعد، فقط أخبرنا 😊"
      );
    }

    console.log("✅ Doctors images sent successfully.");
  } catch (err) {
    console.error("❌ Failed to send doctors images:", err.message || err);
  }
}

module.exports = {
  sendOffersImages,
  sendDoctorsImages,
};
