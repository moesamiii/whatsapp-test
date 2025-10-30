// index.js
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fetch = require("node-fetch");
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

// Detect sheet name on startup (if used)
try {
  detectSheetName();
} catch (err) {
  console.error("⚠️ detectSheetName() failed:", err.message);
}

// ---------------------------------------------
// Global booking memory
// ---------------------------------------------
global.tempBookings = global.tempBookings || {};
const tempBookings = global.tempBookings;

// ---------------------------------------------
// Basic routes (non-webhook)
// ---------------------------------------------
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Webhook for Clinic is running on Vercel!");
});

app.get("/dashboard", async (req, res) => {
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
// WhatsApp Message Sending Route
// ---------------------------------------------
app.post("/sendWhatsApp", async (req, res) => {
  try {
    const { name, phone, service, appointment } = req.body;
    console.log("📩 Incoming request to /sendWhatsApp:", req.body);

    // Validation
    if (!name || !phone) {
      console.warn("⚠️ Missing name or phone number");
      return res.status(400).json({ error: "Missing name or phone number" });
    }

    // Construct message
    const message = `👋 مرحبًا ${name}! تم حجز موعدك لخدمة ${service} الساعة ${appointment}.`;

    // Prepare payload for Meta API
    const payload = {
      messaging_product: "whatsapp",
      to: phone, // Example: 962785050875
      type: "text",
      text: { body: message },
    };

    console.log("📡 Sending message via WhatsApp API to:", phone);

    // Call Meta Cloud API
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();
    console.log("📬 WhatsApp API response:", data);

    if (!response.ok) {
      console.error("❌ WhatsApp API Error:", data);
      return res.status(500).json({ success: false, error: data });
    }

    console.log("✅ Message sent successfully to:", phone);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("🚨 Error sending WhatsApp message:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------
// Register webhook routes (GET /webhook and POST /webhook)
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
