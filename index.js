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

    // 1️⃣ Get media URL from WhatsApp API
    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
      }
    );

    console.log(
      "📥 Media URL response:",
      JSON.stringify(mediaUrlResponse.data, null, 2)
    );
    const mediaUrl = mediaUrlResponse.data.url;

    if (!mediaUrl) {
      console.error("❌ No media URL in response");
      return null;
    }

    console.log("📥 Got media URL, downloading audio...");

    // 2️⃣ Download the actual audio file
    const audioResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
    });

    console.log(
      "✅ Audio downloaded, size:",
      audioResponse.data.byteLength,
      "bytes"
    );
    console.log("✅ Sending to Groq Whisper...");

    // 3️⃣ Send to Groq Whisper API
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

    console.log("✅ Transcription successful:", result.data.text);
    return result.data.text;
  } catch (err) {
    console.error("❌ Voice transcription failed:");
    console.error("Error message:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error(
        "Response data:",
        JSON.stringify(err.response.data, null, 2)
      );
    }
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
    console.error("❌ Error fetching bookings:", err.message);
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

    // 🎙️ Handle voice message
    if (message.type === "audio") {
      console.log("🎧 Voice message received from:", from);
      console.log(
        "📦 Full audio object:",
        JSON.stringify(message.audio, null, 2)
      );

      const mediaId = message.audio.id;

      if (!mediaId) {
        console.error("❌ No media ID found in message");
        await sendTextMessage(from, "⚠️ خطأ في استقبال الرسالة الصوتية");
        return res.sendStatus(200);
      }

      const transcript = await transcribeAudio(mediaId);
      if (!transcript) {
        await sendTextMessage(
          from,
          "⚠️ لم أتمكن من فهم الرسالة الصوتية، حاول مرة أخرى 🎙️"
        );
        return res.sendStatus(200);
      }

      console.log(`🗣️ Transcribed text: "${transcript}"`);

      // Check if user is in booking flow
      if (!tempBookings[from]) {
        const reply = await askAI(transcript);
        await sendTextMessage(from, reply);
      } else {
        // If in booking flow, treat voice as text input
        if (tempBookings[from] && !tempBookings[from].name) {
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
        } else if (tempBookings[from] && !tempBookings[from].service) {
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

    // ✅ Handle interactive messages (buttons / lists)
    if (message.type === "interactive") {
      const id =
        message?.interactive?.button_reply?.id ||
        message?.interactive?.list_reply?.id;
      console.log("🔘 DEBUG => Button/List pressed:", id);

      // Appointment slots
      if (id?.startsWith("slot_")) {
        const appointment = id.replace("slot_", "").toUpperCase();
        tempBookings[from] = { appointment };
        console.log(`🗓️ ${from} selected appointment: ${appointment}`);
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      // Services
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

    // Step 1: Appointment shortcut
    if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
      const appointment = `${text} PM`;
      tempBookings[from] = { appointment };
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
          "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة..."
        );
        return res.sendStatus(200);
      }
      tempBookings[from].name = userName;
      await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
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

      const isValid = /^07\d{8}$/.test(normalized);
      if (!isValid) {
        await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875"
        );
        return res.sendStatus(200);
      }

      tempBookings[from].phone = normalized;

      // ⏳ Delay then show buttons
      setTimeout(async () => {
        try {
          await sendServiceButtons(from);
        } catch {
          await sendTextMessage(
            from,
            "💊 الآن اكتب نوع الخدمة المطلوبة (مثل تنظيف الأسنان أو تبييض الأسنان)"
          );
        }
      }, 1000);

      await sendTextMessage(
        from,
        "💊 يرجى اختيار الخدمة من القائمة أو كتابتها يدويًا:"
      );
      return res.sendStatus(200);
    }

    // Step 4: Service input
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

    // ✅ Step 5: AI chat fallback
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
