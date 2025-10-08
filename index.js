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

// ---------------------------------------------
// Clinic Information
// ---------------------------------------------
const CLINIC_NAME = "Smiles Clinic";
const CLINIC_LOCATION_LINK =
  "https://www.google.com/maps?q=32.0290684,35.863774&z=17&hl=en";

// Offers & Services Images (Google Drive Direct Links)
const OFFER_IMAGES = [
  "https://drive.google.com/uc?export=view&id=104QzzCy2U5ujhADK_SD0dGldowwlgVU2",
  "https://drive.google.com/uc?export=view&id=19EsrCSixVa_8trbzFF5lrZJqcue0quDW",
  "https://drive.google.com/uc?export=view&id=17jaUTvf_S2nqApqMlRc3r8q97uPulvDx",
];

// Detect sheet name on startup
detectSheetName();

// ---------------------------------------------
// Global booking memory
// ---------------------------------------------
global.tempBookings = global.tempBookings || {};
const tempBookings = global.tempBookings;

// ---------------------------------------------
// 🗺️ Location Detection Helper
// ---------------------------------------------
function isLocationRequest(text) {
  const locationKeywords = [
    "موقع",
    "مكان",
    "عنوان",
    "وين",
    "فين",
    "أين",
    "location",
    "where",
    "address",
    "place",
    "maps",
    "العيادة",
    "clinic",
    "وينكم",
    "فينكم",
  ];

  const lowerText = text.toLowerCase();
  return locationKeywords.some((keyword) => lowerText.includes(keyword));
}

// ---------------------------------------------
// 🎁 Offers & Services Detection Helper
// ---------------------------------------------
function isOffersRequest(text) {
  const offersKeywords = [
    "عروض",
    "خدمات",
    "أسعار",
    "عرض",
    "خدمة",
    "سعر",
    "offers",
    "services",
    "prices",
    "offer",
    "service",
    "price",
  ];

  const lowerText = text.toLowerCase();
  return offersKeywords.some((keyword) => lowerText.includes(keyword));
}

// ---------------------------------------------
// 🌐 Language Detection Helper
// ---------------------------------------------
function isEnglish(text) {
  const arabicPattern = /[\u0600-\u06FF]/;
  return !arabicPattern.test(text);
}

// ---------------------------------------------
// 📍 Send Location Messages
// ---------------------------------------------
async function sendLocationMessages(to, language = "ar") {
  // First message: Just the link
  await sendTextMessage(to, CLINIC_LOCATION_LINK);

  // Small delay for better UX
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Second message: Explanation
  if (language === "en") {
    await sendTextMessage(
      to,
      `📍 This is our location at ${CLINIC_NAME}. You can click on the link to open it in Google Maps 🗺️`
    );
  } else {
    await sendTextMessage(
      to,
      `📍 هذا هو موقع ${CLINIC_NAME}. يمكنك الضغط على الرابط لفتحه في خرائط جوجل 🗺️`
    );
  }
}

// ---------------------------------------------
// 🎁 Send Offers & Services Images
// ---------------------------------------------
async function sendOffersImages(to, language = "ar") {
  try {
    // Send intro message
    if (language === "en") {
      await sendTextMessage(to, "💊 Here are our offers and services:");
    } else {
      await sendTextMessage(to, "💊 هذه عروضنا وخدماتنا الحالية:");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Send all 3 images with small delays
    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    // Send closing message
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (language === "en") {
      await sendTextMessage(
        to,
        "✨ For more details or to book an appointment, just let me know!"
      );
    } else {
      await sendTextMessage(
        to,
        "✨ لمزيد من التفاصيل أو لحجز موعد، أخبرني فقط!"
      );
    }
  } catch (err) {
    console.error("❌ Failed to send offers images:", err.message);
  }
}

// ---------------------------------------------
// 📸 Send Image Helper
// ---------------------------------------------
async function sendImageMessage(to, imageUrl) {
  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "image",
        image: {
          link: imageUrl,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("❌ Failed to send image:", err.message);
  }
}

// 👨‍⚕️ Doctors Detection Helper
function isDoctorsRequest(text) {
  const doctorKeywords = [
    "doctors",
    "doctor",
    "dentist",
    "specialist",
    "physician",
    "دكتور",
    "دكاترة",
    "اطباء",
    "الأطباء",
  ];
  const lowerText = text.toLowerCase();
  return doctorKeywords.some((keyword) => lowerText.includes(keyword));
}

// ---------------------------------------------
// Doctors Images (reuse the dummy offer images)
const DOCTOR_IMAGES = OFFER_IMAGES; // same as OFFER_IMAGES

// ---------------------------------------------
// 👨‍⚕️ Send Doctors List + Images
async function sendDoctorsImages(to, language = "ar") {
  try {
    // Send intro message
    if (language === "en") {
      await sendTextMessage(to, "👨‍⚕️ Here are our doctors and their photos:");
    } else {
      await sendTextMessage(to, "👨‍⚕️ هذه صور وأسماء أطبائنا:");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Send all 3 images with small delays
    for (let i = 0; i < DOCTOR_IMAGES.length; i++) {
      await sendImageMessage(to, DOCTOR_IMAGES[i]);
      if (i < DOCTOR_IMAGES.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    // Send closing message with names
    if (language === "en") {
      await sendTextMessage(
        to,
        "👨‍⚕️ Our elite team of doctors:\n1- Dr. Mohammed Sami\n2- Dr. Abdulrahman Al-Harbi\n3- Dr. Ahmad Mubaideen"
      );
    } else {
      await sendTextMessage(
        to,
        "👨‍⚕️ نخبة أطبائنا:\n1- د.محمد سامي\n2- د.عبدالرحمن الحربي\n3- د.احمد مبيضين"
      );
    }
  } catch (err) {
    console.error("❌ Failed to send doctors images:", err.message);
  }
}

// 👨‍⚕️ Send Doctors List
//async function sendDoctorsList(to, language = "ar") {
//if (language === "en") {
//await sendTextMessage(
//to,
//`👨‍⚕️ We have an elite team of doctors:
//1- Dr. Mohammed Sami
//2- Dr. Abdulrahman Al-Harbi
//3- Dr. Ahmad Mubaideen`
//  );
//} else {
//await sendTextMessage(
//to,
//`👨‍⚕️ لدينا نخبة من الاطباء:
//1- د.محمد سامي
//2- د.عبدالرحمن الحربي
//3- د.احمد مبيضين`
//  );
//}
//}

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
    if (!mediaUrl) return null;

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

      // 👨‍⚕️ Check if user is asking about doctors (voice)
      if (isDoctorsRequest(transcript)) {
        const language = isEnglish(transcript) ? "en" : "ar";
        await sendDoctorsList(from, language);
        return res.sendStatus(200);
      }

      // 🧑‍⚕️ Check if user is asking about doctors (voice)
      if (isDoctorsRequest(transcript)) {
        const language = isEnglish(transcript) ? "en" : "ar";
        await sendDoctorsList(from, language);
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

    if (isDoctorsRequest(text)) {
      const language = isEnglish(text) ? "en" : "ar";
      await sendDoctorsList(from, language);
      return res.sendStatus(200);
    }

    // 👨‍⚕️ Doctor List Detection Helper
    function isDoctorsRequest(text) {
      const doctorKeywords = [
        "doctors",
        "doctor",
        "dentist",
        "specialist",
        "physician",
        "دكتور",
        "دكاترة",
        "اطباء",
        "الأطباء",
      ];
      const lowerText = text.toLowerCase();
      return doctorKeywords.some((keyword) => lowerText.includes(keyword));
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
