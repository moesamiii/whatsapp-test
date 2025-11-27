// helpers.js
const axios = require("axios");
const { askAI, validateNameWithAI } = require("./aiHelper");

// WhatsApp API env vars
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ---------------------------------------------
// 💬 WhatsApp messaging utilities
// ---------------------------------------------
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
    console.error("❌ WhatsApp send error:", err.message);
  }
}

// ---------------------------------------------
// 📅 Appointment buttons
// ---------------------------------------------
async function sendAppointmentButtons(to) {
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

// ---------------------------------------------
// 💊 Service List (dropdown)
// ---------------------------------------------
async function sendServiceList(to) {
  try {
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
                  { id: "service_فحص_عام", title: "فحص عام" },
                  { id: "service_تنظيف_الأسنان", title: "تنظيف الأسنان" },
                  { id: "service_تبييض_الأسنان", title: "تبييض الأسنان" },
                  { id: "service_حشو_الأسنان", title: "حشو الأسنان" },
                ],
              },
              {
                title: "الخدمات المتقدمة",
                rows: [
                  { id: "service_علاج_الجذور", title: "علاج الجذور" },
                  { id: "service_تركيب_التركيبات", title: "تركيب التركيبات" },
                  { id: "service_تقويم_الأسنان", title: "تقويم الأسنان" },
                  { id: "service_خلع_الأسنان", title: "خلع الأسنان" },
                ],
              },
              {
                title: "خدمات التجميل",
                rows: [
                  { id: "service_الفينير", title: "الفينير" },
                  { id: "service_زراعة_الأسنان", title: "زراعة الأسنان" },
                  { id: "service_ابتسامة_هوليود", title: "ابتسامة هوليود" },
                  { id: "service_خدمة_أخرى", title: "خدمة أخرى" },
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

    console.log("✅ Service dropdown sent");
  } catch (err) {
    console.error("❌ Error sending service dropdown:", err.message);
  }
}

module.exports = {
  askAI,
  validateNameWithAI,
  sendTextMessage,
  sendAppointmentButtons,
  sendServiceList,
};
