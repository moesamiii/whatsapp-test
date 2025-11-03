// sendWhatsApp.js
export default async function handler(req, res) {
  // ✅ Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, service, appointment, image } = req.body || {};

  // ✅ Validate required fields
  if (!name || !phone) {
    return res.status(400).json({ error: "Missing name or phone" });
  }

  // 🦷 Main WhatsApp message
  const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n📅 ${appointment}`;

  // ✅ WhatsApp API setup
  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  };

  try {
    // ✅ 1️⃣ Send image if exists
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

      console.log("📤 Sending image...");
      const imageResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(imagePayload),
      });

      const imageData = await imageResponse.json();
      console.log("🖼️ Image Response:", imageData);

      if (!imageResponse.ok) {
        console.error("❌ Image failed:", imageData);
        return res.status(500).json({
          success: false,
          stage: "image",
          error: imageData,
          message: "Failed to send image",
        });
      }

      // ✅ 2️⃣ Delay 2 seconds for natural feel
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // ✅ 3️⃣ Send follow-up text
      const followupPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: "📞 للحجز أو الاستفسار، تواصل معنا الآن عبر واتساب!",
        },
      };

      console.log("💬 Sending follow-up...");
      const followupResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(followupPayload),
      });

      const followupData = await followupResponse.json();
      console.log("✅ Follow-up sent:", followupData);

      return res.status(200).json({
        success: true,
        imageData,
        followupData,
        message: "Image and text sent successfully",
      });
    }

    // ✅ 4️⃣ No image → send text only
    const textPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: messageText },
    };

    console.log("💬 Sending text only...");
    const textResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(textPayload),
    });

    const textData = await textResponse.json();
    console.log("✅ Text Response:", textData);

    if (!textResponse.ok) {
      return res.status(500).json({ success: false, error: textData });
    }

    return res.status(200).json({
      success: true,
      textData,
      message: "Text message sent successfully",
    });
  } catch (error) {
    console.error("🚨 Server Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
