// helpers.js (UPDATED WITH CANCEL BOOKING FEATURE)
const axios = require("axios");
const { askAI, validateNameWithAI } = require("./aiHelper");

// Google Sheets helper functions
const {
  detectSheetName,
  saveBooking,
  updateBooking,
  getAllBookings,
  testGoogleConnection,
} = require("./sheetsHelper");

// 🔥 NEW — Database helper functions (for status updates only)
const {
  findLastBookingByPhone,
  updateBookingStatus,
} = require("./databaseHelper"); // <-- YOU MUST CREATE THIS FILE (I'll send it next)

// Environment variables
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// =============================================
// 💬 WHATSAPP MESSAGING FUNCTIONS
// =============================================

async function sendTextMessage(to, text) {
  try {
    console.log(`📤 DEBUG => Sending WhatsApp message to ${to}:`, text);
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ DEBUG => Message sent successfully");
  } catch (err) {
    console.error(
      "❌ DEBUG => WhatsApp send error:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 📅 Appointment Buttons
// ---------------------------------------------
async function sendAppointmentButtons(to) {
  console.log(`📤 DEBUG => Sending appointment buttons to ${to}`);
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "📅 اختر الموعد المناسب لك:" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "slot_3pm", title: "3 PM" } },
              { type: "reply", reply: { id: "slot_6pm", title: "6 PM" } },
              { type: "reply", reply: { id: "slot_9pm", title: "9 PM" } },
            ],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Appointment buttons sent");
  } catch (err) {
    console.error("❌ Error sending appointment buttons:", err.message);
  }
}

async function sendAppointmentOptions(to) {
  console.log(`📤 DEBUG => Sending appointment options to ${to}`);
  await sendAppointmentButtons(to);
}

// ---------------------------------------------
// 💊 Service Buttons (OLD)
// ---------------------------------------------
async function sendServiceButtons(to) {
  console.log(`📤 DEBUG => Sending service buttons to ${to}`);
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "💊 اختر نوع الخدمة المطلوبة:" },
          action: {
            buttons: [
              {
                type: "reply",
                reply: { id: "service_تنظيف", title: "تنظيف الأسنان" },
              },
              {
                type: "reply",
                reply: { id: "service_تبييض", title: "تبييض الأسنان" },
              },
              {
                type: "reply",
                reply: { id: "service_حشو", title: "حشو الأسنان" },
              },
            ],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Service buttons sent");
  } catch (err) {
    console.error("❌ Error sending service buttons:", err.message);
  }
}

// ---------------------------------------------
// 💊 Service Dropdown List (NEW)
// ---------------------------------------------
async function sendServiceList(to) {
  console.log(`📤 DEBUG => Sending service dropdown list to ${to}`);
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: {
            type: "text",
            text: "💊 اختر الخدمة المطلوبة",
          },
          body: {
            text: "يرجى اختيار نوع الخدمة من القائمة:",
          },
          action: {
            button: "عرض الخدمات",
            sections: [
              {
                title: "الخدمات الأساسية",
                rows: [
                  {
                    id: "service_فحص_عام",
                    title: "فحص عام",
                    description: "فحص شامل للأسنان والتشخيص",
                  },
                  {
                    id: "service_تنظيف_الأسنان",
                    title: "تنظيف الأسنان",
                    description: "تنظيف وإزالة الجير والتصبغات",
                  },
                  {
                    id: "service_تبييض_الأسنان",
                    title: "تبييض الأسنان",
                    description: "تبييض الأسنان بالليزر",
                  },
                  {
                    id: "service_حشو_الأسنان",
                    title: "حشو الأسنان",
                    description: "علاج التسوس وحشو الأسنان",
                  },
                ],
              },
              {
                title: "الخدمات المتقدمة",
                rows: [
                  {
                    id: "service_علاج_الجذور",
                    title: "علاج الجذور",
                    description: "علاج قناة الجذر والعصب",
                  },
                  {
                    id: "service_تركيب_التركيبات",
                    title: "تركيب التركيبات",
                    description: "تركيب التيجان والجسور",
                  },
                  {
                    id: "service_تقويم_الأسنان",
                    title: "تقويم الأسنان",
                    description: "تنظيم الأسنان",
                  },
                  {
                    id: "service_خلع_الأسنان",
                    title: "خلع الأسنان",
                    description: "خلع بسيط أو جراحي",
                  },
                ],
              },
            ],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Service list sent");
  } catch (err) {
    console.error("❌ Error sending service list:", err.message);
    await sendServiceButtons(to); // fallback
  }
}

// ======================================================
// 🔥🔥🔥 NEW — CANCEL BOOKING FEATURE
// ======================================================

/**
 * Step 1 ⮕ Ask user for phone number when they say "cancel"
 */
async function askForCancellationPhone(to) {
  await sendTextMessage(
    to,
    "📌 من فضلك ارسل رقم الجوال المستخدم في الحجز حتى أقوم بإلغاء الحجز."
  );
}

/**
 * Step 2 ⮕ Process cancellation once phone is received
 */
async function processCancellation(to, phone) {
  try {
    console.log("🔍 Looking for last booking with phone:", phone);

    const booking = await findLastBookingByPhone(phone);

    if (!booking) {
      await sendTextMessage(
        to,
        "❌ لم أجد أي حجز مرتبط بهذا الرقم. تأكد من كتابته بشكل صحيح."
      );
      return;
    }

    // Update status → Canceled (OFFICIAL CHOICE)
    await updateBookingStatus(booking.id, "Canceled");

    await sendTextMessage(
      to,
      `🟣 تم إلغاء الحجز بنجاح:\n👤 ${booking.name}\n📅 ${booking.appointment}\n💊 ${booking.service}`
    );
  } catch (err) {
    console.error("❌ Error processing cancellation:", err.message);
    await sendTextMessage(to, "⚠️ حدث خطأ أثناء إلغاء الحجز. حاول لاحقًا.");
  }
}

// =============================================
// EXPORTS
// =============================================
module.exports = {
  // AI
  askAI,
  validateNameWithAI,

  // WhatsApp
  sendTextMessage,
  sendAppointmentButtons,
  sendAppointmentOptions,
  sendServiceButtons,
  sendServiceList,

  // Sheets
  detectSheetName,
  saveBooking,
  updateBooking,
  getAllBookings,
  testGoogleConnection,

  // NEW — CANCEL BOOKING
  askForCancellationPhone,
  processCancellation,
};
