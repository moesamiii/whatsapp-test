// index.js
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fetch = require("node-fetch"); // ensure it's installed: npm i node-fetch
const { registerWebhookRoutes } = require("./webhookHandler");
const { detectSheetName, getAllBookings } = require("./helpers");

const app = express();
app.use(bodyParser.json());

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ---------------------------------------------
// Startup logs
// ---------------------------------------------
console.log("🚀 Server starting...");
console.log("✅ VERIFY_TOKEN loaded:", !!VERIFY_TOKEN);
console.log("✅ WHATSAPP_TOKEN loaded:", !!WHATSAPP_TOKEN);
console.log("✅ PHONE_NUMBER_ID loaded:", PHONE_NUMBER_ID || "❌ Not found");

try {
  detectSheetName();
} catch (err) {
  console.error("⚠️ detectSheetName() failed:", err.message);
}

// ---------------------------------------------
// Serve dashboard and API
// ---------------------------------------------
app.use(express.static(path.join(__dirname))); // serve all HTML/CSS/JS
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Webhook for Clinic is running on Vercel!");
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

app.get("/api/bookings", async (req, res) => {
  try {
    const data = await getAllBookings();
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching bookings:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// ---------------------------------------------
// WhatsApp Message Sending (Supports Images)
// ---------------------------------------------
app.post("/sendWhatsApp", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { name, phone, service, appointment, image } = req.body || {};
    console.log("📩 Incoming request to /sendWhatsApp:", req.body);

    if (!name || !phone) {
      console.warn("⚠️ Missing name or phone number");
      return res.status(400).json({ error: "Missing name or phone number" });
    }

    const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n📅 ${appointment}`;
    const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    };

    console.log("📤 Sending message to:", phone);
    console.log("🖼️ Image URL:", image || "No image");

    // ---------- Case 1: Send Image Message ----------
    if (image && image.startsWith("http")) {
      console.log("📤 Sending image message...");

      const imagePayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: {
          link: image,
          caption: messageText,
        },
      };

      const imageResponse = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(imagePayload),
      });

      const imageData = await imageResponse.json();
      console.log("🖼️ Image response:", JSON.stringify(imageData));

      // If image fails, fallback to text
      if (!imageResponse.ok || imageData.error) {
        console.error("❌ Image failed:", imageData);

        const textPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: {
            body: messageText + "\n\n📞 للحجز أو الاستفسار، تواصل معنا الآن!",
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
        });
      }

      // Success — send follow-up text
      const followupPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: "📞 للحجز أو الاستفسار، تواصل معنا الآن!" },
      };

      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(followupPayload),
      });

      return res.status(200).json({
        success: true,
        imageData,
        message: "✅ Image sent successfully",
      });
    }

    // ---------- Case 2: Text Only ----------
    const textPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: {
        body: messageText + "\n\n📞 للحجز أو الاستفسار، تواصل معنا الآن!",
      },
    };

    const textResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(textPayload),
    });

    const textData = await textResponse.json();

    if (!textResponse.ok) {
      return res.status(500).json({ success: false, error: textData });
    }

    return res.status(200).json({
      success: true,
      textData,
    });
  } catch (error) {
    console.error("🚨 Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ---------------------------------------------
// Register Webhook Routes
// ---------------------------------------------
try {
  registerWebhookRoutes(app, VERIFY_TOKEN);
  console.log("✅ Webhook routes registered successfully.");
} catch (err) {
  console.error("⚠️ Error registering webhook routes:", err);
}

// ---------------------------------------------
// Run Server
// ---------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
