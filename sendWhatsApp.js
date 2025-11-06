// sendWhatsApp.js
export default async function handler(req, res) {
  // ✅ Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ✅ Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, phone, service, appointment, image } = req.body || {};

  // ✅ Validate required fields
  if (!name || !phone) {
    return res.status(400).json({ error: "Missing name or phone" });
  }

  // 🦷 Build WhatsApp message text
  const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n📅 ${appointment}`;

  // ✅ WhatsApp API endpoint and headers
  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  };

  try {
    // ✅ Case 1: Send image message (if image exists and is valid URL)
    if (image && image.startsWith("http")) {
      console.log("📤 Image URL received:", image);

      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: {
          link: image,
          caption: messageText,
        },
      };

      console.log(
        "📤 Sending image with caption...",
        JSON.stringify(imagePayload, null, 2)
      );

      const imageResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(imagePayload),
      });

      const imageData = await imageResponse.json();
      console.log(
        "🖼️ WhatsApp image response:",
        JSON.stringify(imageData, null, 2)
      );

      if (!imageResponse.ok || imageData.error) {
        console.error("❌ Image message failed:", imageData);

        // ⚠️ Fallback: Send text only if image fails
        console.log("⚠️ Falling back to text-only message...");
        const textPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: {
            body:
              messageText +
              "\n\n📞 للحجز أو الاستفسار، تواصل معنا الآن عبر واتساب!",
          },
        };

        const textResponse = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(textPayload),
        });

        const textData = await textResponse.json();

        return res.status(200).json({
          success: true,
          fallback: true,
          textData,
          imageError: imageData,
          message: "Image failed, sent text instead",
        });
      }

      // ✅ Send follow-up text message
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
      console.log("✅ Follow-up text response:", followupData);

      return res.status(200).json({
        success: true,
        imageData,
        followupData,
        message: "Image and follow-up text sent successfully",
      });
    }

    // ✅ Case 2: No image — send plain text
    const textPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: {
        body:
          messageText +
          "\n\n📞 للحجز أو الاستفسار، تواصل معنا الآن عبر واتساب!",
      },
    };

    console.log("💬 Sending text message only...");
    const textResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(textPayload),
    });

    const textData = await textResponse.json();
    console.log("✅ WhatsApp text response:", textData);

    if (!textResponse.ok) {
      console.error("❌ Text message failed:", textData);
      return res.status(500).json({ success: false, error: textData });
    }

    return res.status(200).json({
      success: true,
      textData,
      message: "Text message sent successfully",
    });
  } catch (error) {
    console.error("🚨 Server error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
}
