const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
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
const {
  transcribeAudio,
  sendImageMessage,
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  isLocationRequest,
  isOffersRequest,
  isDoctorsRequest,
  isEnglish,
} = require("./messageHandlers");

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

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
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

    const fridayWords = ["الجمعة", "Friday", "friday"];

    // 🎙️ Voice messages
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

      // 🗺️ Check if user is asking about location
      if (isLocationRequest(transcript)) {
        const language = isEnglish(transcript) ? "en" : "ar";
        await sendLocationMessages(from, language);
        return res.sendStatus(200);
      }

      // 🎁 Check if user is asking about offers/services
      if (isOffersRequest(transcript)) {
        const language = isEnglish(transcript) ? "en" : "ar";
        await sendOffersImages(from, language);
        return res.sendStatus(200);
      }

      // 👨‍⚕️ Check if user is asking about doctors
      if (isDoctorsRequest(transcript)) {
        const language = isEnglish(transcript) ? "en" : "ar";
        await sendDoctorsImages(from, language);
        return res.sendStatus(200);
      }

      // 🛑 check if user mentioned Friday
      if (
        fridayWords.some((word) =>
          transcript.toLowerCase().includes(word.toLowerCase())
        )
      ) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
        );

        // ✅ Start booking flow after Friday message
        setTimeout(async () => {
          await sendTextMessage(
            from,
            "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇"
          );
          await sendAppointmentOptions(from);
        }, 2000);

        return res.sendStatus(200);
      }

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
        } else if (tempBookings[from] && !tempBookings[from].phone) {
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

          // Send service dropdown list
          await sendServiceList(from);
          await sendTextMessage(
            from,
            "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
          );
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
      const interactiveType = message.interactive.type;
      const id =
        interactiveType === "list_reply"
          ? message.interactive.list_reply.id
          : message.interactive.button_reply?.id;

      console.log("🔘 DEBUG => Interactive type:", interactiveType);
      console.log("🔘 DEBUG => Button/List pressed:", id);

      if (id?.startsWith("slot_")) {
        const appointment = id.replace("slot_", "").toUpperCase();

        if (
          fridayWords.some((word) =>
            appointment.toLowerCase().includes(word.toLowerCase())
          )
        ) {
          await sendTextMessage(
            from,
            "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
          );

          // ✅ Continue booking after Friday message
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

    // 🗺️ Check if user is asking about location (text message)
    if (isLocationRequest(text)) {
      const language = isEnglish(text) ? "en" : "ar";
      await sendLocationMessages(from, language);
      return res.sendStatus(200);
    }

    // 🎁 Check if user is asking about offers/services (text message)
    if (isOffersRequest(text)) {
      const language = isEnglish(text) ? "en" : "ar";
      await sendOffersImages(from, language);
      return res.sendStatus(200);
    }

    // 👨‍⚕️ Check if user is asking about doctors (text message)
    if (isDoctorsRequest(text)) {
      const language = isEnglish(text) ? "en" : "ar";
      await sendDoctorsImages(from, language);
      return res.sendStatus(200);
    }

    // 🛑 Check if user typed Friday manually
    if (
      fridayWords.some((word) =>
        text.toLowerCase().includes(word.toLowerCase())
      )
    ) {
      await sendTextMessage(
        from,
        "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
      );

      // ✅ Start booking flow after informing
      setTimeout(async () => {
        await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇");
        await sendAppointmentOptions(from);
      }, 2000);

      return res.sendStatus(200);
    }

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

      // Send service dropdown list
      await sendServiceList(from);
      await sendTextMessage(
        from,
        "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
      );
      return res.sendStatus(200);
    }

    // Step 4: Service input (manual text input as fallback)
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
