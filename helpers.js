/**
 * helpers.js (UPDATED — Now saves new bookings to BOTH Google Sheets + Supabase)
 */

const axios = require("axios");
const { askAI, validateNameWithAI } = require("./aiHelper");

// =============================================
// 📄 GOOGLE SHEETS (OLD BOOKING LOGIC — KEPT EXACTLY)
// =============================================
const {
  detectSheetName,
  saveBooking, // KEEP OLD BOOKING FLOW
  updateBooking, // KEEP OLD BOOKING FLOW
  getAllBookings, // KEEP OLD BOOKING FLOW
  testGoogleConnection,
} = require("./sheetsHelper");

// =============================================
// 🗄 SUPABASE — NOW USED FOR SAVING + CANCELLATION
// =============================================
const {
  findLastBookingByPhone,
  updateBookingStatus,
  insertBookingToSupabase, // <── NEW FUNCTION
} = require("./databaseHelper");

// =============================================
// 🌍 ENVIRONMENT VARIABLES
// =============================================
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// =============================================
// 💬 SEND WHATSAPP TEXT MESSAGE
// =============================================
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

    console.log("✅ Message sent successfully");
  } catch (err) {
    console.error("❌ WhatsApp send error:", err.response?.data || err.message);
  }
}

// =============================================
// 📅 APPOINTMENT BUTTONS
// =============================================
async function sendAppointmentButtons(to) {
  try {
    console.log(`📤 Sending appointment buttons to ${to}`);

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
  return sendAppointmentButtons(to);
}

// =============================================
// 💊 SERVICE BUTTONS (OLD VERSION)
// =============================================
async function sendServiceButtons(to) {
  try {
    console.log(`📤 Sending service buttons to ${to}`);

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

// =============================================
// 💊 SERVICE LIST (NEW DROPDOWN)
// =============================================
async function sendServiceList(to) {
  try {
    console.log(`📤 Sending service dropdown list to ${to}`);

    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "💊 اختر الخدمة المطلوبة" },
          body: { text: "يرجى اختيار نوع الخدمة من القائمة:" },
          action: {
            button: "عرض الخدمات",
            sections: [
              {
                title: "الخدمات الأساسية",
                rows: [
                  {
                    id: "service_فحص_عام",
                    title: "فحص عام",
                    description: "فحص شامل للأسنان",
                  },
                  {
                    id: "service_تنظيف_الأسنان",
                    title: "تنظيف الأسنان",
                    description: "تنظيف وإزالة الجير",
                  },
                  {
                    id: "service_تبييض_الأسنان",
                    title: "تبييض الأسنان",
                    description: "تبييض بالليزر",
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
    sendServiceButtons(to); // fallback
  }
}

// ======================================================
// 🔥 CANCEL BOOKING (SUPABASE + PHONE NORMALIZATION)
// ======================================================

async function askForCancellationPhone(to) {
  await sendTextMessage(
    to,
    "📌 من فضلك ارسل رقم الجوال المستخدم في الحجز حتى أقوم بإلغاء الحجز."
  );
}

async function processCancellation(to, phone) {
  try {
    console.log("📌 Raw phone received:", phone);

    phone = phone.replace(/\D/g, "").replace(/^0+/, "");

    const booking = await findLastBookingByPhone(phone);

    if (!booking) {
      await sendTextMessage(
        to,
        "❌ لم أجد أي حجز مرتبط بهذا الرقم. تأكد من كتابته بشكل صحيح."
      );
      return;
    }

    await updateBookingStatus(booking.id, "Canceled");

    await sendTextMessage(
      to,
      `🟣 تم إلغاء الحجز بنجاح:\n👤 ${booking.name}\n📅 ${booking.appointment}\n💊 ${booking.service}`
    );
  } catch (err) {
    console.error("❌ Error during cancellation:", err.message);
    await sendTextMessage(to, "⚠️ حدث خطأ أثناء إلغاء الحجز. حاول لاحقًا.");
  }
}

// =============================================
// 📤 EXPORTS
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

  // OLD Booking Logic
  detectSheetName,
  saveBooking,
  updateBooking,
  getAllBookings,
  testGoogleConnection,

  // Supabase
  insertBookingToSupabase, // <── NEW EXPORT

  // Cancellation
  askForCancellationPhone,
  processCancellation,
};
