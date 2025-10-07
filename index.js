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

// 🆕 استيراد أدوات التحقق من ملف aiHelper
const {
  isValidDoctor,
  isValidService,
  getDoctorsList,
  getServicesList,
} = require("./aiHelper");

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
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
      }
    );

    const mediaUrl = mediaUrlResponse.data.url;
    if (!mediaUrl) {
      console.error("❌ No media URL in response");
      return null;
    }

    const audioResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
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
      const mediaId = message.audio.id;
      const transcript = await transcribeAudio(mediaId);
      if (!transcript) {
        await sendTextMessage(
          from,
          "⚠️ لم أتمكن من فهم الرسالة الصوتية، حاول مرة أخرى 🎙️"
        );
        return res.sendStatus(200);
      }

      console.log(`🗣️ Transcribed text: "${transcript}"`);

      // 🆕 Doctor/Service Validation before booking
      const lang = /[\u0600-\u06FF]/.test(transcript) ? "ar" : "en";
      const doctors = getDoctorsList(lang);
      const services = getServicesList(lang);

      if (
        transcript.includes("حجز") ||
        transcript.toLowerCase().includes("book") ||
        transcript.includes("موعد") ||
        transcript.includes("appointment")
      ) {
        // تحقق من الطبيب أو الخدمة قبل البدء بالحجز
        const mentionedDoctor = doctors.find((doc) =>
          transcript.includes(doc.split(" ")[1])
        );
        const mentionedService = services.find((srv) =>
          transcript.includes(srv.split(" ")[0])
        );

        if (mentionedDoctor && !isValidDoctor(mentionedDoctor, lang)) {
          await sendTextMessage(
            from,
            `عذرًا، هذا الطبيب ليس ضمن فريقنا الطبي. أطباؤنا هم: ${doctors.join(
              "، "
            )}.`
          );
          return res.sendStatus(200);
        }

        if (mentionedService && !isValidService(mentionedService, lang)) {
          await sendTextMessage(
            from,
            `نحن عيادة أسنان متخصصة. الخدمة "${mentionedService}" غير متوفرة. خدماتنا تشمل: ${services.join(
              "، "
            )}.`
          );
          return res.sendStatus(200);
        }

        await sendAppointmentOptions(from);
        return res.sendStatus(200);
      }

      const reply = await askAI(transcript);
      await sendTextMessage(from, reply);
      return res.sendStatus(200);
    }

    // ✅ Handle interactive messages (buttons / lists)
    if (message.type === "interactive") {
      const id =
        message?.interactive?.button_reply?.id ||
        message?.interactive?.list_reply?.id;

      if (id?.startsWith("slot_")) {
        const appointment = id.replace("slot_", "").toUpperCase();
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

    // 🆕 Doctor/Service Validation before booking
    const lang = /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
    const doctors = getDoctorsList(lang);
    const services = getServicesList(lang);

    if (text.includes("حجز") || text.toLowerCase().includes("book")) {
      const mentionedDoctor = doctors.find((doc) =>
        text.includes(doc.split(" ")[1])
      );
      const mentionedService = services.find((srv) =>
        text.includes(srv.split(" ")[0])
      );

      if (mentionedDoctor && !isValidDoctor(mentionedDoctor, lang)) {
        await sendTextMessage(
          from,
          `عذرًا، هذا الطبيب ليس ضمن فريقنا الطبي. أطباؤنا هم: ${doctors.join(
            "، "
          )}.`
        );
        return res.sendStatus(200);
      }

      if (mentionedService && !isValidService(mentionedService, lang)) {
        await sendTextMessage(
          from,
          `نحن عيادة أسنان متخصصة. الخدمة "${mentionedService}" غير متوفرة. خدماتنا تشمل: ${services.join(
            "، "
          )}.`
        );
        return res.sendStatus(200);
      }

      await sendAppointmentOptions(from);
      return res.sendStatus(200);
    }

    // باقي الكود كما هو دون تعديل 🔽
    console.log(`💬 DEBUG => Message from ${from}:`, text);

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

    if (!tempBookings[from]) {
      const reply = await askAI(text);
      await sendTextMessage(from, reply);
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
