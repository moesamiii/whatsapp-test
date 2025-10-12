// index.js (keeps server boot, simple routes, and registers webhook routes)
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { registerWebhookRoutes } = require("./webhookHandler"); // NEW file

const { detectSheetName, getAllBookings } = require("./helpers");

const app = express();
app.use(bodyParser.json());

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret";

// Detect sheet name on startup
detectSheetName();

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
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// ---------------------------------------------
// Register webhook routes (GET /webhook and POST /webhook)
// ---------------------------------------------
registerWebhookRoutes(app, VERIFY_TOKEN);

// ---------------------------------------------
// Run Server
// ---------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);

//Ban Words Logic
const {
  containsBanWords,
  sendBanWordsResponse,
  isEnglish,
  isLocationRequest,
  isOffersRequest,
  isDoctorsRequest,
} = require("./messageHandlers");

// In your message handler function:
async function handleIncomingMessage(from, messageText) {
  // CHECK FOR BAN WORDS FIRST - HIGHEST PRIORITY
  if (containsBanWords(messageText)) {
    const language = isEnglish(messageText) ? "en" : "ar";
    await sendBanWordsResponse(from, language);
    return; // STOP - don't process anything else
  }

  // Then continue with normal processing
  const language = isEnglish(messageText) ? "en" : "ar";

  if (isLocationRequest(messageText)) {
    await sendLocationMessages(from, language);
  } else if (isOffersRequest(messageText)) {
    await sendOffersImages(from, language);
  } else if (isDoctorsRequest(messageText)) {
    await sendDoctorsImages(from, language);
  }
  // ... rest of your logic
}
