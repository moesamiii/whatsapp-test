// sendWhatsApp.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, service, appointment } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ error: "Missing name or phone" });
  }

  try {
    const message = `👋 مرحبًا ${name}! تم حجز موعدك لخدمة ${service} الساعة ${appointment}.`;

    const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone, // Example: "962785050875"
        type: "text",
        text: { body: message },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ WhatsApp API Error:", data);
      return res.status(500).json({ success: false, error: data });
    }

    console.log("✅ Message sent successfully:", data);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("🚨 Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
