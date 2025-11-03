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
    const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n${appointment}`;
    const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

    // ✅ 1. Send the image with caption
    if (image) {
      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: {
          link: image,
          caption: messageText,
        },
      };

      console.log("📤 Sending image message...");
      const imageResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify(imagePayload),
      });

      const imageData = await imageResponse.json();
      console.log("🖼️ WhatsApp image response:", imageData);

      if (!imageResponse.ok) {
        return res
          .status(500)
          .json({ success: false, error: imageData, message: "Image failed" });
      }

      // ✅ 2. Follow-up text (optional)
      const followupPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: "📅 للحجز أو الاستفسار، تواصل معنا الآن!" },
      };

      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify(followupPayload),
      });

      return res.status(200).json({ success: true, imageData });
    }

    // 📝 If no image, send plain text
    const textPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: messageText },
    };

    const textResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify(textPayload),
    });

    const textData = await textResponse.json();
    console.log("💬 WhatsApp text response:", textData);

    if (!textResponse.ok) {
      return res.status(500).json({ success: false, error: textData });
    }

    return res.status(200).json({ success: true, textData });
  } catch (error) {
    console.error("🚨 Server error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
