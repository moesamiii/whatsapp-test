const express = require("express");
const bodyParser = require("body-parser");
const {
  askAI,
  validateNameWithAI,
  sendTextMessage,
  sendAppointmentButtons,
  sendServiceButtons,
  sendAppointmentOptions,
  saveBooking,
  detectSheetName,
} = require("./helpers");

const app = express();
app.use(bodyParser.json());

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret";

// Detect sheet name on startup
detectSheetName();

// ---------------------------------------------
// Global booking memory (prevents random resets)
// ---------------------------------------------
global.tempBookings = global.tempBookings || {};
const tempBookings = global.tempBookings;

// ---------------------------------------------
// Routes
// ---------------------------------------------
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Webhook for Clinic is running on Vercel!");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("✅ DEBUG => Webhook verified.");
    res.status(200).send(challenge);
  } else {
    console.warn("⚠️ DEBUG => Webhook verification failed.");
    res.sendStatus(403);
  }
});

// ---------------------------------------------
// Webhook Logic
// ---------------------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    if (!message || !from) return res.sendStatus(200);

    // ✅ Handle Interactive Messages (buttons/lists)
    if (message.type === "interactive") {
      const buttonId = message?.interactive?.button_reply?.id;
      const listId = message?.interactive?.list_reply?.id;
      const id = buttonId || listId;

      console.log("🔘 DEBUG => Button/List pressed:", id);

      // Appointment selection
      let appointment;
      if (id === "slot_3pm") appointment = "3 PM";
      if (id === "slot_6pm") appointment = "6 PM";
      if (id === "slot_9pm") appointment = "9 PM";

      if (appointment) {
        tempBookings[from] = { appointment };
        console.log(`🗓️ ${from} selected appointment: ${appointment}`);
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      // Service selection
      if (id && id.startsWith("service_")) {
        const serviceName = id.replace("service_", "").replace(/_/g, " ");
        if (!tempBookings[from] || !tempBookings[from].phone) {
          await sendTextMessage(
            from,
            "⚠️ يرجى إكمال خطوات الحجز أولاً (الموعد، الاسم، رقم الجوال)"
          );
          return res.sendStatus(200);
        }

        tempBookings[from].service = serviceName;
        const booking = tempBookings[from];
        console.log(`💾 Booking completed for ${from}:`, booking);

        await saveBooking(booking);
        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
        );
        delete tempBookings[from];
        return res.sendStatus(200);
      }

      return res.sendStatus(200);
    }

    // ✅ Handle Text Messages
    const text = message?.text?.body?.trim();
    if (text) {
      console.log(`💬 DEBUG => Message from ${from}:`, text);

      // Step 1: Appointment shortcut (3 / 6 / 9)
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        const appointment = `${text} PM`;
        tempBookings[from] = { appointment };
        console.log(`🗓️ ${from} selected appointment: ${appointment}`);
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      // Step 2: Name input
      if (tempBookings[from] && !tempBookings[from].name) {
        const userName = text.trim();
        const isValid = await validateNameWithAI(userName);
        if (!isValid) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة، ريم..."
          );
          return res.sendStatus(200);
        }
        tempBookings[from].name = userName;
        console.log(`👤 ${from} entered name: ${userName}`);
        await sendTextMessage(from, "📱 ممتاز! ارسل رقم جوالك:");
        return res.sendStatus(200);
      }

      // Step 3: Phone input
      if (tempBookings[from] && !tempBookings[from].phone) {
        const normalized = text
          .replace(/[^\d٠-٩]/g, "")
          .replace(/٠/g, "0")
          .replace(/١/g, "1")
          .replace(/٢/g, "2")
          .replace(/٣/g, "3")
          .replace(/٤/g, "4")
          .replace(/٥/g, "5")
          .replace(/٦/g, "6")
          .replace(/٧/g, "7")
          .replace(/٨/g, "8")
          .replace(/٩/g, "9");

        const isValidJordanian = /^07\d{8}$/.test(normalized);
        if (!isValidJordanian) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال رقم هاتف أردني صحيح مثل: 0785050875"
          );
          return res.sendStatus(200);
        }

        tempBookings[from].phone = normalized;
        console.log(`📞 ${from} entered phone: ${normalized}`);
        await sendServiceButtons(from);
        return res.sendStatus(200);
      }

      // Step 4: Manual service entry
      if (tempBookings[from] && !tempBookings[from].service) {
        tempBookings[from].service = text;
        const booking = tempBookings[from];
        console.log(`💾 Booking completed manually for ${from}:`, booking);
        await saveBooking(booking);
        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
        );
        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // ✅ Step 5: AI messages — only if no booking in progress
      if (!tempBookings[from]) {
        if (text.includes("حجز") || text.toLowerCase().includes("book")) {
          await sendAppointmentOptions(from);
        } else {
          const reply = await askAI(text);
          await sendTextMessage(from, reply);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ DEBUG => Webhook Error:", err.message);
    res.sendStatus(500);
  }
});

// ---------------------------------------------
// Run Server
// ---------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
