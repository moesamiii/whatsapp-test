// sendWhatsApp.js
export default async function handler(req, res) {
  // ✅ Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, phone, service, appointment, image } = req.body || {};

    // ✅ Validate required fields
    if (!name || !phone) {
      return res.status(400).json({ error: "Missing name or phone" });
    }

    // 🦷 Compose message
    const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n📅 ${appointment}`;

    // ✅ WhatsApp API setup
    const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    };

    let responseLog = {};

    // ✅ 1️⃣ Send image (if provided)
    if (image && image.startsWith("http")) {
      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: {
          link: image,
          caption: messageText,
        },
      };

      console.log("📤 Sending image message to:", phone);
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
          message: "Failed to send image via WhatsApp API",
        });
      }

      responseLog.imageData = imageData;

      // ✅ Optional: small delay for natural message flow
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // ✅ 2️⃣ Follow-up text
      const followupPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: "📞 للحجز أو الاستفسار، تواصل معنا الآن عبر واتساب!",
        },
      };

      console.log("💬 Sending follow-up text...");
      const followupResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(followupPayload),
      });

      const followupData = await followupResponse.json();
      console.log("✅ Follow-up text sent:", followupData);

      if (!followupResponse.ok) {
        console.error("⚠️ Follow-up failed:", followupData);
        return res.status(500).json({
          success: false,
          stage: "followup",
          error: followupData,
          message: "Follow-up message failed",
        });
      }

      responseLog.followupData = followupData;

      return res.status(200).json({
        success: true,
        ...responseLog,
        message: "✅ Image and follow-up message sent successfully",
      });
    }

    // ✅ 3️⃣ If no image, send text only
    const textPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: messageText },
    };

    console.log("💬 Sending text-only message...");
    const textResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(textPayload),
    });

    const textData = await textResponse.json();
    console.log("✅ Text-only Response:", textData);

    if (!textResponse.ok) {
      console.error("❌ Text message failed:", textData);
      return res.status(500).json({
        success: false,
        error: textData,
        message: "Failed to send text message via WhatsApp API",
      });
    }

    return res.status(200).json({
      success: true,
      textData,
      message: "✅ Text message sent successfully",
    });
  } catch (error) {
    console.error("🚨 Unexpected Server Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
}
