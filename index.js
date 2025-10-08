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
// 📋 Helper: Send Service Dropdown (List Message)
// ---------------------------------------------
async function sendServiceDropdown(to) {
  const services = [
    { id: "service_cleaning", title: "تنظيف الأسنان", description: "" },
    { id: "service_whitening", title: "تبييض الأسنان", description: "" },
    { id: "service_extraction", title: "خلع الأسنان", description: "" },
    { id: "service_checkup", title: "فحص شامل", description: "" },
    { id: "service_braces", title: "تقويم الأسنان", description: "" },
  ];

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "💊 اختر الخدمة المطلوبة" },
      body: { text: "يرجى اختيار الخدمة من القائمة أدناه 👇" },
      footer: { text: "عيادة الابتسامة الجميلة 😁" },
      action: {
        button: "اختيار الخدمة",
        sections: [
          {
            title: "خدمات العيادة",
            rows: services.map((s) => ({
              id: s.id,
              title: s.title,
              description: s.description,
            })),
          },
        ],
      },
    },
  };

  await axios.post("https://graph.facebook.com/v21.0/me/messages", payload, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
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
  } catch {
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

    // 🎙️ Voice messages
    if (message.type === "audio") {
      const mediaId = message.audio.id;
      const transcript = await transcribeAudio(mediaId);
      if (!transcript)
        return await sendTextMessage(
          from,
          "⚠️ لم أتمكن من فهم الرسالة الصوتية، حاول مرة أخرى 🎙️"
        );

      console.log(`🗣️ Transcribed text: "${transcript}"`);

      if (
        fridayWords.some((word) =>
          transcript.toLowerCase().includes(word.toLowerCase())
        )
      ) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر 🌷"
        );
        setTimeout(async () => {
          await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت 👇");
          await sendAppointmentOptions(from);
        }, 2000);
        return res.sendStatus(200);
      }

      if (!tempBookings[from]) {
        if (
          transcript.includes("حجز") ||
          transcript.toLowerCase().includes("book")
        ) {
          await sendAppointmentOptions(from);
        } else {
          const reply = await askAI(transcript);
          await sendTextMessage(from, reply);
        }
      } else {
        if (!tempBookings[from].name) {
          const isValid = await validateNameWithAI(transcript);
          if (!isValid)
            return await sendTextMessage(
              from,
              "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، سارة..."
            );
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

          if (!/^07\d{8}$/.test(normalized))
            return await sendTextMessage(
              from,
              "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875"
            );

          tempBookings[from].phone = normalized;
          await sendTextMessage(
            from,
            "💊 يرجى اختيار الخدمة من القائمة أو كتابتها يدويًا:"
          );

          // ✅ Send dropdown here
          await sendServiceDropdown(from);
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

    // ✅ Interactive Messages (buttons/lists)
    if (message.type === "interactive") {
      const id =
        message?.interactive?.button_reply?.id ||
        message?.interactive?.list_reply?.id;

      if (id?.startsWith("slot_")) {
        const appointment = id.replace("slot_", "");
        if (
          fridayWords.some((word) =>
            appointment.toLowerCase().includes(word.toLowerCase())
          )
        ) {
          await sendTextMessage(
            from,
            "📅 يوم الجمعة عطلة رسمية، اختر يومًا آخر 🌷"
          );
          setTimeout(async () => {
            await sendTextMessage(from, "📅 اختر موعدًا جديدًا 👇");
            await sendAppointmentOptions(from);
          }, 2000);
          return res.sendStatus(200);
        }

        tempBookings[from] = { appointment };
        await sendTextMessage(from, "👍 تم اختيار الموعد! أرسل اسمك:");
        return res.sendStatus(200);
      }

      if (id?.startsWith("service_")) {
        const serviceName = id.replace("service_", "").replace(/_/g, " ");
        if (!tempBookings[from]?.phone)
          return await sendTextMessage(
            from,
            "⚠️ يرجى إكمال خطوات الحجز أولاً."
          );

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

    // ✅ Text messages
    const text = message?.text?.body?.trim();
    if (!text) return res.sendStatus(200);
    console.log(`💬 Message from ${from}:`, text);

    if (fridayWords.some((word) => text.includes(word))) {
      await sendTextMessage(
        from,
        "📅 يوم الجمعة عطلة رسمية، اختر يومًا آخر 🌷"
      );
      setTimeout(async () => {
        await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت 👇");
        await sendAppointmentOptions(from);
      }, 2000);
      return res.sendStatus(200);
    }

    if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
      const appointment = `${text} PM`;
      tempBookings[from] = { appointment };
      await sendTextMessage(from, "👍 تم اختيار الموعد! أرسل اسمك:");
      return res.sendStatus(200);
    }

    if (tempBookings[from] && !tempBookings[from].name) {
      const isValid = await validateNameWithAI(text);
      if (!isValid)
        return await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد أو سارة"
        );
      tempBookings[from].name = text;
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

      if (!/^07\d{8}$/.test(normalized))
        return await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875"
        );

      tempBookings[from].phone = normalized;
      await sendTextMessage(
        from,
        "💊 يرجى اختيار الخدمة من القائمة أو كتابتها يدويًا:"
      );
      await sendServiceDropdown(from);
      return res.sendStatus(200);
    }

    if (tempBookings[from] && !tempBookings[from].service) {
      tempBookings[from].service = text;
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
    console.error("❌ Webhook Error:", err.message);
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
