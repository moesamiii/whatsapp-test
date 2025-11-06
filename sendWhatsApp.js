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

  // ✅ CHANGED: Accept both 'images' (array) and 'image' (single) for backwards compatibility
  const { name, phone, service, appointment, images, image } = req.body || {};

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
    let imagesSent = 0;
    let imageResponses = [];

    // ✅ NEW: Handle multiple images
    if (images && Array.isArray(images) && images.length > 0) {
      console.log(`📤 ${images.length} images received`);

      // Send each image sequentially
      for (let i = 0; i < images.length; i++) {
        const imageUrl = images[i];

        if (!imageUrl || !imageUrl.startsWith("http")) {
          console.warn(
            `⚠️ Skipping invalid image URL at index ${i}:`,
            imageUrl
          );
          imageResponses.push({
            index: i + 1,
            success: false,
            error: "Invalid URL",
          });
          continue;
        }

        try {
          const imagePayload = {
            messaging_product: "whatsapp",
            to: phone,
            type: "image",
            image: {
              link: imageUrl,
              // First image gets full caption, rest get numbered captions
              caption:
                i === 0 ? messageText : `📷 صورة ${i + 1} من ${images.length}`,
            },
          };

          console.log(`📤 Sending image ${i + 1}/${images.length}...`);
          console.log(`Image URL: ${imageUrl}`);

          const imageResponse = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(imagePayload),
          });

          const imageData = await imageResponse.json();
          console.log(
            `📷 Response for image ${i + 1}:`,
            JSON.stringify(imageData, null, 2)
          );

          if (imageResponse.ok && !imageData.error) {
            console.log(`✅ Image ${i + 1} sent successfully`);
            imagesSent++;
            imageResponses.push({
              index: i + 1,
              success: true,
              data: imageData,
            });
          } else {
            console.error(`❌ Image ${i + 1} failed:`, imageData);
            imageResponses.push({
              index: i + 1,
              success: false,
              error: imageData,
            });
          }

          // Add delay between messages to avoid rate limiting (1 second)
          if (i < images.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`❌ Error sending image ${i + 1}:`, error);
          imageResponses.push({
            index: i + 1,
            success: false,
            error: error.message,
          });
        }
      }

      // ⚠️ If all images failed, send text fallback
      if (imagesSent === 0) {
        console.log(
          "⚠️ All images failed, falling back to text-only message..."
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
          textData,
          imageResponses,
          imagesSent: 0,
          totalImages: images.length,
          message: "All images failed, sent text instead",
        });
      }

      // ✅ Send follow-up text message
      console.log("💬 Sending follow-up text...");

      // Add delay before follow-up
      await new Promise((resolve) => setTimeout(resolve, 1000));

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
      console.log("✅ Follow-up text sent:", followupData);

      return res.status(200).json({
        success: true,
        imagesSent,
        totalImages: images.length,
        imageResponses,
        followupData,
        message: `${imagesSent} of ${images.length} images sent successfully`,
      });
    }

    // ✅ OLD: Handle single image (backwards compatibility)
    if (image && image.startsWith("http")) {
      console.log("📤 Single image URL received:", image);

      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: {
          link: image,
          caption: messageText,
        },
      };

      console.log("📤 Sending single image with caption...");

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

        // Fallback to text
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

      // Send follow-up text
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

      return res.status(200).json({
        success: true,
        imageData,
        followupData,
        message: "Image and follow-up text sent successfully",
      });
    }

    // ✅ No images at all — send plain text
    console.log("💬 No images provided, sending text only...");

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
      imagesSent: 0,
      totalImages: 0,
      message: "Text message sent successfully (no images)",
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
