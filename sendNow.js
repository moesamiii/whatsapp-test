// ✅ متوافق مع CommonJS
const axios = require("axios");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // توكن Meta Cloud
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID; // ID رقم واتساب
const to = "962772741757"; // رقم المستقبل بدون +
const message =
  "مرحبًا 👋 اليوم عندنا عروض خاصة! 🎉 خصومات حصرية لفترة محدودة 💥";

async function sendMessage() {
  try {
    const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: message },
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ تم إرسال الرسالة بنجاح:", response.data);
  } catch (error) {
    console.error(
      "❌ خطأ أثناء الإرسال:",
      error.response?.data || error.message
    );
  }
}

sendMessage();
