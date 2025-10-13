// index.js (keeps server boot, simple routes, and registers webhook routes)
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { registerWebhookRoutes } = require("./webhookHandler");
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
    console.error("❌ Failed to fetch bookings:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// ---------------------------------------------
// Register webhook routes (GET /webhook and POST /webhook)
// ---------------------------------------------
registerWebhookRoutes(app, VERIFY_TOKEN);

// ---------------------------------------------
// Export for Vercel (NO app.listen here)
// ---------------------------------------------
module.exports = app;

// For local testing only (optional)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Server running locally on http://localhost:${PORT}`);
  });
}
