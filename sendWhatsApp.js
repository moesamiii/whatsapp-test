// sendWhatsApp.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, service, appointment, image } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ error: "Missing name or phone" });
  }

  try {
    // 🧩 Build base message text
    const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n${appointment}`;

    const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

    // 🖼️ If image exists, send an image message
    const messagePayload = image
      ? {
          messaging_product: "whatsapp",
          to: phone,
          type: "image",
          image: {
            link: image,
            caption: messageText, // shows text under image
          },
        }
      : {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: messageText },
        };

    console.log(
      "📦 Sending to WhatsApp API:",
      JSON.stringify(messagePayload, null, 2)
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify(messagePayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ WhatsApp API Error:", data);
      return res.status(500).json({ success: false, error: data });
    }

    console.log("✅ WhatsApp message sent successfully:", data);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("🚨 Server Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
