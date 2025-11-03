// sendWhatsApp.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, phone, service, appointment, image } = req.body || {};

    if (!name || !phone) {
      return res.status(400).json({ error: "Missing name or phone" });
    }

    const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n📅 ${appointment}`;

    const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    };

    // ✅ If image exists — send image first
    if (image && image.startsWith("http")) {
      console.log("🖼️ Sending image message to:", phone);

      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: { link: image, caption: messageText },
      };

      const imageResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(imagePayload),
      });

      const imageData = await imageResponse.json();
      console.log("🖼️ Image Response:", imageData);

      if (!imageResponse.ok) {
        console.error("❌ Image message failed:", imageData);
        return res.status(500).json({
          success: false,
          stage: "image",
          error: imageData,
        });
      }

      // Wait 2 seconds then send follow-up text
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const followupPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: "📞 للحجز أو الاستفسار، تواصل معنا الآن عبر واتساب!" },
      };

      const followupResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(followupPayload),
      });

      const followupData = await followupResponse.json();
      console.log("💬 Follow-up Response:", followupData);

      return res.status(200).json({
        success: true,
        imageData,
        followupData,
        message: "✅ Image and text sent successfully",
      });
    }

    // ✅ If no image — send text only
    const textPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: messageText },
    };

    const textResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(textPayload),
    });

    const textData = await textResponse.json();
    console.log("💬 Text Response:", textData);

    if (!textResponse.ok) {
      return res.status(500).json({
        success: false,
        error: textData,
        message: "Failed to send text message",
      });
    }

    return res.status(200).json({
      success: true,
      textData,
      message: "✅ Text message sent successfully",
    });
  } catch (error) {
    console.error("🚨 Unexpected Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
