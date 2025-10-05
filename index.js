const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();

const webhookRoute = require("./routes/webhook");

const app = express();
app.use(bodyParser.json());

// ✅ Routes
app.use("/webhook", webhookRoute);

app.get("/", (req, res) => {
  res.send("✅ WhatsApp Webhook for Clinic is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
