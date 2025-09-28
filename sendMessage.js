const axios = require("axios");

// بياناتك من Meta
const token =
  "EAAkC9kpfeuABPvZCSZCCId4imQF44jF17NTAgXZCA31O4HiOI86xcOK0AKLN1ETQnHk5CBAv9rrZBoLv4MGuWDxsZAbyJrya2fsLFR4h3WKGtJ6afPJSfqdPpKbMy4Sx5g7SeDQJsXjYvLxn49G0ZBIZBFHYGaTrC0TBPZCBgKC2kKZAnF3YmlypCyLAGCwuZBROr7cr1JpNOEKLDo1QYmW4ce3nyUJZA2poUvg45tYKHbNfxuL8owZD";

const phoneNumberId = "786972071168893"; // ✅ Phone Number ID الصحيح
const recipient = "962785050875"; // ✅ رقمك الدولي بعد التفعيل

async function sendMessage() {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: { body: "مرحبا 👋! هذه أول رسالة من Node.js 🚀" },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Message sent:", response.data);
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

sendMessage();
