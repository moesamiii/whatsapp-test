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
// 📱 Send Booking Start Options (Interactive List)
// ---------------------------------------------
async function sendBookingStartOptions(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending booking start options to ${to}`);

    if (language === "en") {
      // English: Interactive List
      await axios.post(
        `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "list",
            header: {
              type: "text",
              text: "📅 Book Your Appointment",
            },
            body: {
              text: "Choose an option to start booking:",
            },
            action: {
              button: "Booking Options",
              sections: [
                {
                  title: "Appointment Types",
                  rows: [
                    {
                      id: "book_regular",
                      title: "🦷 Regular Appointment",
                      description: "Book a standard dental appointment",
                    },
                    {
                      id: "book_offer",
                      title: "🎁 Book with Offer",
                      description: "Book using one of our special offers",
                    },
                    {
                      id: "book_emergency",
                      title: "🚑 Emergency Visit",
                      description: "Need immediate dental care",
                    },
                  ],
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
    } else {
      // Arabic: Interactive List
      await axios.post(
        `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "list",
            header: {
              type: "text",
              text: "📅 حجز موعدك",
            },
            body: {
              text: "اختر خياراً لبدء الحجز:",
            },
            action: {
              button: "خيارات الحجز",
              sections: [
                {
                  title: "أنواع المواعيد",
                  rows: [
                    {
                      id: "book_regular",
                      title: "🦷 موعد عادي",
                      description: "حجز موعد أسنان عادي",
                    },
                    {
                      id: "book_offer",
                      title: "🎁 حجز مع عرض",
                      description: "احجز باستخدام أحد عروضنا الخاصة",
                    },
                    {
                      id: "book_emergency",
                      title: "🚑 زيارة طارئة",
                      description: "تحتاج إلى رعاية فورية للأسنان",
                    },
                  ],
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
    }

    console.log("✅ DEBUG => Booking start options sent successfully");
  } catch (err) {
    console.error("❌ DEBUG => Error sending booking options:", err.message);
    // Fallback to quick reply buttons
    await sendQuickReplyBooking(to, language);
  }
}

// ---------------------------------------------
// 🔄 Send Quick Reply Buttons (Alternative)
// ---------------------------------------------
async function sendQuickReplyBooking(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending quick reply booking to ${to}`);

    const messageText =
      language === "en"
        ? "📅 Ready to book your appointment? Choose an option below:"
        : "📅 جاهز لحجز موعدك؟ اختر من الخيارات بالأسفل:";

    await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: {
          body: messageText,
        },
        quick_replies: [
          {
            content_type: "text",
            payload: "start_booking_yes",
            title: language === "en" ? "✅ Yes, Book Now" : "✅ نعم، احجز الآن",
          },
          {
            content_type: "text",
            payload: "start_booking_later",
            title: language === "en" ? "⏰ Maybe Later" : "⏰ ربما لاحقاً",
          },
          {
            content_type: "text",
            payload: "start_booking_info",
            title: language === "en" ? "ℹ️ More Info" : "ℹ️ مزيد من المعلومات",
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ DEBUG => Quick reply booking sent successfully");
  } catch (err) {
    console.error("❌ DEBUG => Error sending quick reply:", err.message);
    // Ultimate fallback - direct text with emoji options
    await sendTextMessage(
      to,
      language === "en"
        ? "📅 Ready to book? Reply with:\n✅ YES - to start booking\n⏰ LATER - for later\nℹ️ INFO - for more information"
        : "📅 جاهز للحجز؟ رد بـ:\n✅ نعم - لبدء الحجز\n⏰ لاحقاً - للحجز لاحقاً\nℹ️ معلومات - لمزيد من المعلومات"
    );
  }
}

// ---------------------------------------------
// 📅 Start booking flow (entry point)
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

    // Then send the booking start options (interactive list)
    await sendBookingStartOptions(to, language);

    console.log("✅ DEBUG => Booking start flow initiated successfully");
  } catch (err) {
    console.error("❌ DEBUG => Error starting booking:", err.message);
  }
}

// ---------------------------------------------
// 🎁 Send Offers (with booking prompt)
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

    // Step 3: Invite to booking with interactive options
    await delay(1000);

    const promptText =
      language === "en"
        ? "✨ Would you like to book an appointment for one of these offers?"
        : "✨ هل ترغب بحجز موعد لأحد هذه العروض؟";

    await sendTextMessage(to, promptText);
    await delay(600);

    // Send booking options
    await sendBookingStartOptions(to, language);

    console.log("✅ Offers flow completed — booking options shown.");
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

    // Step 3: Invite to booking with interactive options
    await delay(1000);

    const promptText =
      language === "en"
        ? "✨ Would you like to book an appointment with one of our doctors?"
        : "✨ هل ترغب بحجز موعد مع أحد أطبائنا؟";

    await sendTextMessage(to, promptText);
    await delay(600);

    // Send booking options
    await sendBookingStartOptions(to, language);

    console.log("✅ Doctors flow completed — booking options shown.");
  } catch (err) {
    console.error("❌ DEBUG => Error in doctors flow:", err.message);
  }
}

// ---------------------------------------------
// 🧾 Handle booking interaction
// ---------------------------------------------
async function handleBookingFlow(to, userData = {}, language = "ar") {
  try {
    console.log(`📥 DEBUG => Booking flow triggered for ${to}`);

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
// 🔄 Handle Quick Reply Responses
// ---------------------------------------------
async function handleQuickReplyResponse(to, payload, language = "ar") {
  try {
    console.log(`📥 DEBUG => Quick reply received: ${payload}`);

    switch (payload) {
      case "start_booking_yes":
        await handleBookingFlow(to, {}, language);
        break;

      case "start_booking_later":
        await sendTextMessage(
          to,
          language === "en"
            ? "⏰ No problem! We'll be here when you're ready. Just say 'book' when you want to start!"
            : "⏰ لا مشكلة! سنكون هنا عندما تكون جاهزاً. فقط قل 'احجز' عندما تريد البدء!"
        );
        break;

      case "start_booking_info":
        await sendTextMessage(
          to,
          language === "en"
            ? "ℹ️ We offer:\n• Dental cleaning\n• Teeth whitening\n• Fillings\n• Root canal\n• And more!\nSay 'book' to see all services."
            : "ℹ️ نقدم:\n• تنظيف الأسنان\n• تبييض الأسنان\n• حشو الأسنان\n• علاج الجذور\n• والمزيد!\nقل 'احجز' لرؤية جميع الخدمات."
        );
        break;

      default:
        await handleBookingFlow(to, {}, language);
    }
  } catch (err) {
    console.error("❌ DEBUG => Error handling quick reply:", err.message);
  }
}

// ---------------------------------------------
// 🆕 Direct Booking Start (Simple Text)
// ---------------------------------------------
async function sendDirectBookingPrompt(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending direct booking prompt to ${to}`);

    const message =
      language === "en"
        ? "📅 To book an appointment, simply type: BOOK\n\nOr choose:\n✅ YES - Start booking now\n⏰ LATER - Remind me later\nℹ️ INFO - See services"
        : "📅 لحجز موعد، اكتب ببساطة: احجز\n\nأو اختر:\n✅ نعم - ابدأ الحجز الآن\n⏰ لاحقاً - ذكرني لاحقاً\nℹ️ معلومات - رؤية الخدمات";

    await sendTextMessage(to, message);

    console.log("✅ DEBUG => Direct booking prompt sent successfully");
  } catch (err) {
    console.error("❌ DEBUG => Error sending direct prompt:", err.message);
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
  sendBookingStartOptions,
  sendQuickReplyBooking,
  sendDirectBookingPrompt,
  handleQuickReplyResponse,
};
