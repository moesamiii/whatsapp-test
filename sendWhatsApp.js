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

  const {
    name,
    phone,
    service,
    appointment,
    image,
    images = [],
  } = req.body || {};

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
    // 🟢 Case 1: Multiple images provided
    if (Array.isArray(images) && images.length > 0) {
      console.log(`📤 Received ${images.length} image(s) for sending`);

      // 1️⃣ Send text message first (main message)
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

      console.log("💬 Sending main text message...");
      const textResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(textPayload),
      });

      const textData = await textResponse.json();
      console.log("✅ Text message response:", textData);

      // 2️⃣ Send all images one by one
      const sentImages = [];
      for (const img of images) {
        if (!img || typeof img !== "string" || !img.startsWith("http"))
          continue;

        const imagePayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "image",
          image: {
            link: img,
            caption: `📸 عرض خاص من ${name}`,
          },
        };

        console.log("📤 Sending image:", img);

        const imageResponse = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(imagePayload),
        });

        const imageData = await imageResponse.json();
        console.log("🖼️ Image response:", imageData);
        sentImages.push(imageData);
      }

      // ✅ Return combined response
      return res.status(200).json({
        success: true,
        textData,
        sentImages,
        message: "All images and text sent successfully",
      });
    }

    // 🟠 Case 2: Single image provided
    if (image && image.startsWith("http")) {
      console.log("📤 Single image detected:", image);

      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: {
          link: image,
          caption: messageText,
        },
      };

      console.log("📤 Sending single image...");
      const imageResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(imagePayload),
      });

      const imageData = await imageResponse.json();
      console.log("🖼️ Single image response:", imageData);

      if (!imageResponse.ok || imageData.error) {
        console.error("❌ Image send failed:", imageData);
        // fallback
        const fallbackPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: {
            body:
              messageText +
              "\n\n📞 للحجز أو الاستفسار، تواصل معنا الآن عبر واتساب!",
          },
        };

        const fallbackRes = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(fallbackPayload),
        });

        const fallbackData = await fallbackRes.json();

        return res.status(200).json({
          success: true,
          fallback: true,
          fallbackData,
          message: "Image failed, sent text instead",
        });
      }

      // Send follow-up text
      const followupPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: "📞 للحجز أو الاستفسار، تواصل معنا الآن عبر واتساب!",
        },
      };

      const followupRes = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(followupPayload),
      });

      const followupData = await followupRes.json();
      console.log("✅ Follow-up text sent:", followupData);

      return res.status(200).json({
        success: true,
        imageData,
        followupData,
        message: "Single image and text sent successfully",
      });
    }

    // 🔵 Case 3: No image(s) — text only
    console.log("💬 Sending text only...");
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

    const textRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(textPayload),
    });

    const textData = await textRes.json();
    console.log("✅ Text response:", textData);

    if (!textRes.ok) {
      console.error("❌ Text send failed:", textData);
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
