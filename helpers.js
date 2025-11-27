// helpers.js (UPDATED - WhatsApp, AI, Google Sheets, Supabase)
const axios = require("axios");
const { askAI, validateNameWithAI } = require("./aiHelper");

// ---------------------------------------------
// Supabase Booking Search + Cancel
// ---------------------------------------------
const { findBookingByPhone, cancelBooking } = require("./supabaseService");

// ---------------------------------------------
// Google Sheets functions
// ---------------------------------------------
const {
  detectSheetName,
  saveBooking,
  updateBooking,
  getAllBookings,
  testGoogleConnection,
} = require("./sheetsHelper");

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// =============================================
// 💬 WHATSAPP MESSAGING FUNCTIONS
// =============================================

// ---------------------------------------------
// 1) Send plain text message
// ---------------------------------------------
async function sendTextMessage(to, text) {
  try {
    console.log(`📤 Sending WhatsApp message to ${to}:`, text);

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

    console.log("✅ WhatsApp message sent successfully");
  } catch (err) {
    console.error(
      "❌ WhatsApp message send error:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 2) Appointment time slot buttons
// ---------------------------------------------
async function sendAppointmentButtons(to) {
  console.log(`📤 Sending appointment buttons to ${to}`);

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
    console.error(
      "❌ Error sending appointment buttons:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 3) Send appointment options (shortcut)
// ---------------------------------------------
async function sendAppointmentOptions(to) {
  await sendAppointmentButtons(to);
}

// ---------------------------------------------
// 4) OLD service buttons (fallback)
// ---------------------------------------------
async function sendServiceButtons(to) {
  console.log(`📤 Sending service buttons to ${to}`);

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
    console.error(
      "❌ Error sending service buttons:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 5) Enhanced Service List (NEW UI)
// ---------------------------------------------
async function sendServiceList(to) {
  console.log(`📤 Sending service dropdown list to ${to}`);

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
                    description: "تشخيص شامل",
                  },
                  {
                    id: "service_تنظيف_الأسنان",
                    title: "تنظيف الأسنان",
                    description: "إزالة الجير",
                  },
                  {
                    id: "service_تبييض_الأسنان",
                    title: "تبييض الأسنان",
                    description: "ليزر / مواد مبيضة",
                  },
                  {
                    id: "service_حشو_الأسنان",
                    title: "حشو الأسنان",
                    description: "علاج التسوس",
                  },
                ],
              },
              {
                title: "الخدمات المتقدمة",
                rows: [
                  {
                    id: "service_علاج_الجذور",
                    title: "علاج الجذور",
                    description: "قناة الجذر",
                  },
                  {
                    id: "service_تركيب_التركيبات",
                    title: "التركيبات",
                    description: "تيجان وجسور",
                  },
                  {
                    id: "service_تقويم_الأسنان",
                    title: "تقويم الأسنان",
                    description: "تنظيم الاعوجاج",
                  },
                  {
                    id: "service_خلع_الأسنان",
                    title: "خلع الأسنان",
                    description: "خلع بسيط أو جراحي",
                  },
                ],
              },
              {
                title: "خدمات التجميل",
                rows: [
                  {
                    id: "service_الفينير",
                    title: "الفينير",
                    description: "قشور تجميلية",
                  },
                  {
                    id: "service_زراعة_الأسنان",
                    title: "زراعة الأسنان",
                    description: "تعويض الأسنان",
                  },
                  {
                    id: "service_ابتسامة_هوليود",
                    title: "ابتسامة هوليود",
                    description: "تصميم ابتسامة",
                  },
                  {
                    id: "service_خدمة_أخرى",
                    title: "خدمة أخرى",
                    description: "خدمة غير موجودة بالقائمة",
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

    console.log("✅ Service list sent successfully");
  } catch (err) {
    console.error(
      "❌ Error sending service list:",
      err.response?.data || err.message
    );

    // Fallback if WhatsApp List is not supported
    await sendServiceButtons(to);
  }
}

// =============================================
// 📤 EXPORT EVERYTHING
// =============================================
module.exports = {
  // AI
  askAI,
  validateNameWithAI,

  // WhatsApp Messaging
  sendTextMessage,
  sendAppointmentButtons,
  sendAppointmentOptions,
  sendServiceButtons,
  sendServiceList,

  // Google Sheets (existing booking system)
  detectSheetName,
  saveBooking,
  updateBooking,
  getAllBookings,
  testGoogleConnection,

  // Supabase search + cancel (NEW)
  findBookingByPhone,
  cancelBooking,
};
