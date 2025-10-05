const axios = require("axios");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

async function sendTextMessage(to, text) {
  return axios.post(
    `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, text: { body: text } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

async function sendAppointmentOptions(to) {
  await sendTextMessage(
    to,
    "📅 اختر الموعد المناسب:\n1️⃣ 3 PM\n2️⃣ 6 PM\n3️⃣ 9 PM"
  );
}

module.exports = { sendTextMessage, sendAppointmentOptions };
