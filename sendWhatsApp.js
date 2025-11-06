// sendWhatsApp.js
export default async function handler(req, res) {
  // ✅ Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { name, phone, service, appointment, image, images } = req.body || {};

  // ✅ Validate required fields
  if (!name || !phone) {
    return res.status(400).json({ error: "Missing name or phone" });
  }

  // 🦷 Build message text
  const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n📅 ${appointment}`;

  // ✅ WhatsApp API endpoint and headers
  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  };

  try {
    // ✅ Collect all images (supports both single + multiple)
    const imageList = Array.isArray(images)
      ? images.filter(
          (img) => typeof img === "string" && img.startsWith("http")
        )
      : image
      ? [image]
      : [];

    let allImageResults = [];
    let anyImageFailed = false;

    // ✅ Send all images sequentially
    for (const img of imageList) {
      console.log("📤 Sending image:", img);

      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: {
          link: img,
          caption: messageText,
        },
      };

      const imageResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(imagePayload),
      });

      const imageData = await imageResponse.json();
      console.log("🖼️ WhatsApp image response:", imageData);

      allImageResults.push({ image: img, response: imageData });

      if (!imageResponse.ok || imageData.error) {
        console.error("❌ Image message failed:", imageData);
        anyImageFailed = true;
      }
    }

    // ✅ Fallback: if all images failed, send text only
    if (
      imageList.length > 0 &&
      anyImageFailed &&
      allImageResults.every((r) => r.response.error)
    ) {
      console.log(
        "⚠️ All image messages failed — sending fallback text only..."
      );
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
        allImageResults,
        textData,
        message: "All images failed, sent text instead",
      });
    }

    // ✅ If at least one image succeeded — send follow-up text
    if (imageList.length > 0) {
      console.log("💬 Sending follow-up text...");
      const followupPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: "📞 للحجز أو الاستفسار، تواصل معنا الآن عبر واتساب!",
        },
      };

      const followupResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(followupPayload),
      });

      const followupData = await followupResponse.json();
      console.log("✅ Follow-up text response:", followupData);

      return res.status(200).json({
        success: true,
        imagesSent: imageList.length,
        allImageResults,
        followupData,
        message: "Images (one or more) sent successfully with follow-up text",
      });
    }

    // ✅ No image case — send plain text
    console.log("💬 Sending text message only...");
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
