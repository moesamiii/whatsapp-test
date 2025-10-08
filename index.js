const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

const {
  askAI,
  validateNameWithAI,
  sendTextMessage,
  sendAppointmentButtons,
  sendServiceButtons,
  sendServiceList,
  sendAppointmentOptions,
  saveBooking,
  detectSheetName,
  getAllBookings,
} = require("./helpers");

const app = express();
app.use(bodyParser.json());

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// Detect sheet name on startup
detectSheetName();

// ---------------------------------------------
// Global booking memory
// ---------------------------------------------
global.tempBookings = global.tempBookings || {};
const tempBookings = global.tempBookings;

// ---------------------------------------------
// 🧭 Location Helper
// ---------------------------------------------
async function sendLocationMessage(to) {
  try {
    // Replace with your actual clinic coordinates and address
    const latitude = 31.963158;
    const longitude = 35.930359;
    const address = "عيادة ابتسامتك - عبدون، عمّان، الأردن";
    const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    // 1️⃣ Send WhatsApp Location Message
    await axios.post(
      "https://graph.facebook.com/v21.0/me/messages",
      {
        messaging_product: "whatsapp",
        to,
        type: "location",
        location: {
          latitude,
          longitude,
          name: "عيادة ابتسامتك",
          address,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 2️⃣ Follow-up Text Message with link
    await sendTextMessage(
      to,
      `📍 موقعنا على الخريطة:\n${address}\n\nافتح في الخرائط: ${mapsUrl}`
    );
  } catch (err) {
    console.error("❌ Failed to send location:", err.message);
    await sendTextMessage(to, "⚠️ حدث خطأ أثناء إرسال الموقع، حاول لاحقاً.");
  }
}

// ---------------------------------------------
// 🧠 Voice Transcription Helper (using Groq Whisper)
// ---------------------------------------------
async function transcribeAudio(mediaId) {
  try {
    console.log("🎙️ Starting transcription for media ID:", mediaId);

    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      }
    );

    const mediaUrl = mediaUrlResponse.data.url;
    if (!mediaUrl) return null;

    const audioResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    const form = new FormData();
    form.append("file", Buffer.from(audioResponse.data), {
      filename: "voice.ogg",
      contentType: "audio/ogg; codecs=opus",
    });
    form.append("model", "whisper-large-v3");
    form.append("language", "ar");
    form.append("response_format", "json");

    const result = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      form,
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          ...form.getHeaders(),
        },
      }
    );

    return result.data.text;
  } catch (err) {
    console.error("❌ Voice transcription failed:", err.message);
    return null;
  }
}

// ---------------------------------------------
// Routes
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
// Webhook Verification
// ---------------------------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) res.status(200).send(challenge);
  else res.sendStatus(403);
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

    const fridayWords = ["الجمعة", "Friday", "friday"];
    const locationWords = [
      "الموقع",
      "العنوان",
      "وين العيادة",
      "وين مكانكم",
      "location",
      "where are you",
      "map",
    ];

    // 🎙️ Handle voice messages
    if (message.type === "audio") {
      const mediaId = message.audio.id;
      if (!mediaId) return res.sendStatus(200);

      const transcript = await transcribeAudio(mediaId);
      if (!transcript) {
        await sendTextMessage(
          from,
          "⚠️ لم أتمكن من فهم الرسالة الصوتية، حاول مرة أخرى 🎙️"
        );
        return res.sendStatus(200);
      }

      console.log(`🗣️ Transcribed text: "${transcript}"`);

      // 🧭 Detect location request
      if (
        locationWords.some((w) =>
          transcript.toLowerCase().includes(w.toLowerCase())
        )
      ) {
        await sendLocationMessage(from);
        return res.sendStatus(200);
      }

      // 🛑 Check Friday
      if (
        fridayWords.some((w) =>
          transcript.toLowerCase().includes(w.toLowerCase())
        )
      ) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
        );
        setTimeout(async () => {
          await sendTextMessage(
            from,
            "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇"
          );
          await sendAppointmentOptions(from);
        }, 2000);
        return res.sendStatus(200);
      }

      // Booking flow continues here...
      if (!tempBookings[from]) {
        if (
          transcript.includes("حجز") ||
          transcript.toLowerCase().includes("book") ||
          transcript.includes("موعد") ||
          transcript.includes("appointment")
        ) {
          await sendAppointmentOptions(from);
        } else {
          const reply = await askAI(transcript);
          await sendTextMessage(from, reply);
        }
      } else {
        if (!tempBookings[from].name) {
          const isValid = await validateNameWithAI(transcript);
          if (!isValid) {
            await sendTextMessage(
              from,
              "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة..."
            );
            return res.sendStatus(200);
          }
          tempBookings[from].name = transcript;
          await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
        } else if (!tempBookings[from].phone) {
          const normalized = transcript
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

          const isValid = /^07\d{8}$/.test(normalized);
          if (!isValid) {
            await sendTextMessage(
              from,
              "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875"
            );
            return res.sendStatus(200);
          }

          tempBookings[from].phone = normalized;
          await sendServiceList(from);
          await sendTextMessage(
            from,
            "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
          );
        } else if (!tempBookings[from].service) {
          tempBookings[from].service = transcript;
          const booking = tempBookings[from];
          await saveBooking(booking);
          await sendTextMessage(
            from,
            `✅ تم حفظ حجزك بنجاح:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
          );
          delete tempBookings[from];
        }
      }
      return res.sendStatus(200);
    }

    // ✅ Handle interactive messages (buttons/lists)
    if (message.type === "interactive") {
      const type = message.interactive.type;
      const id =
        type === "list_reply"
          ? message.interactive.list_reply.id
          : message.interactive.button_reply?.id;

      if (id === "location_btn") {
        await sendLocationMessage(from);
        return res.sendStatus(200);
      }

      if (id?.startsWith("slot_")) {
        const appointment = id.replace("slot_", "").toUpperCase();
        if (
          fridayWords.some((w) =>
            appointment.toLowerCase().includes(w.toLowerCase())
          )
        ) {
          await sendTextMessage(
            from,
            "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
          );
          setTimeout(async () => {
            await sendTextMessage(
              from,
              "📅 لنبدأ الحجز، اختر الوقت المناسب 👇"
            );
            await sendAppointmentOptions(from);
          }, 2000);
          return res.sendStatus(200);
        }

        tempBookings[from] = { appointment };
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      if (id?.startsWith("service_")) {
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

    // ✅ Handle text messages
    const text = message?.text?.body?.trim();
    if (!text) return res.sendStatus(200);
    console.log(`💬 DEBUG => Message from ${from}:`, text);

    // 🧭 Detect location request
    if (
      locationWords.some((w) => text.toLowerCase().includes(w.toLowerCase()))
    ) {
      await sendLocationMessage(from);
      return res.sendStatus(200);
    }

    // 🛑 Friday logic
    if (fridayWords.some((w) => text.toLowerCase().includes(w.toLowerCase()))) {
      await sendTextMessage(
        from,
        "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
      );
      setTimeout(async () => {
        await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇");
        await sendAppointmentOptions(from);
      }, 2000);
      return res.sendStatus(200);
    }

    // Normal booking flow
    if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
      const appointment = `${text} PM`;
      tempBookings[from] = { appointment };
      await sendTextMessage(
        from,
        "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
      );
      return res.sendStatus(200);
    }

    if (tempBookings[from] && !tempBookings[from].name) {
      const userName = text.trim();
      const isValid = await validateNameWithAI(userName);
      if (!isValid) {
        await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة..."
        );
        return res.sendStatus(200);
      }
      tempBookings[from].name = userName;
      await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
      return res.sendStatus(200);
    }

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

      const isValid = /^07\d{8}$/.test(normalized);
      if (!isValid) {
        await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875"
        );
        return res.sendStatus(200);
      }

      tempBookings[from].phone = normalized;
      await sendServiceList(from);
      await sendTextMessage(
        from,
        "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
      );
      return res.sendStatus(200);
    }

    if (tempBookings[from] && !tempBookings[from].service) {
      const booking = tempBookings[from];
      booking.service = text;
      await saveBooking(booking);
      await sendTextMessage(
        from,
        `✅ تم حفظ حجزك بنجاح:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
      );
      delete tempBookings[from];
      return res.sendStatus(200);
    }

    // AI Fallback
    if (!tempBookings[from]) {
      if (text.includes("حجز") || text.toLowerCase().includes("book")) {
        await sendAppointmentOptions(from);
      } else {
        const reply = await askAI(text);
        await sendTextMessage(from, reply);
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
