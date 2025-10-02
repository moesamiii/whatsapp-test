const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const Groq = require("groq-sdk");
const { google } = require("googleapis");

// ---------------------------------------------
// إعداد Express
// ---------------------------------------------
const app = express();
app.use(bodyParser.json());

// 📌 متغيرات البيئة
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ✅ متغير Google Sheets
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();
console.log("🟢 DEBUG => SPREADSHEET_ID being used:", `"${SPREADSHEET_ID}"`);

// ✅ إعداد عميل Groq
const client = new Groq({ apiKey: GROQ_API_KEY });

// ✅ إعداد Google Sheets API
let creds;
try {
  creds = process.env.GOOGLE_CREDENTIALS
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
    : require("./credentials.json");
  console.log("🟢 DEBUG => Google credentials loaded successfully.");
} catch (err) {
  console.error("❌ DEBUG => Failed to load credentials:", err);
}

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// ---------------------------------------------
// Debug: جلب أسماء الشيتات
// ---------------------------------------------
let DEFAULT_SHEET_NAME = "Sheet1"; // fallback

async function detectSheetName() {
  try {
    console.log(
      "🔍 DEBUG => Detecting sheet names for spreadsheet:",
      SPREADSHEET_ID
    );
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const sheetNames = meta.data.sheets.map((s) => s.properties.title);
    console.log("📋 DEBUG => Sheets found:", sheetNames);

    if (sheetNames.length > 0) {
      DEFAULT_SHEET_NAME = sheetNames[0];
      console.log("✅ DEBUG => Using sheet:", DEFAULT_SHEET_NAME);
    } else {
      console.warn("⚠️ DEBUG => No sheets found in spreadsheet.");
    }
  } catch (err) {
    console.error(
      "❌ DEBUG => Error detecting sheets:",
      err.response?.data || err.message
    );
  }
}
detectSheetName();

// ---------------------------------------------
// دوال مساعدة
// ---------------------------------------------

// 🔹 استدعاء AI
async function askAI(userMessage) {
  try {
    console.log("🤖 DEBUG => Sending message to AI:", userMessage);
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `
أنت موظف خدمة عملاء (call center) لعيادة طبية.
مهمتك الرد فقط على الأسئلة المتعلقة بـ:
- المواعيد 🕒
- الأسعار 💰
- الموقع 📍
- الحجز 📅

❌ لا ترد على أي أسئلة خارج هذا النطاق.
إذا سألك العميل عن شيء خارج عملك قل بأدب:
"أستطيع مساعدتك فقط في المواعيد، الأسعار، الموقع، أو الحجز."

💡 تحدث باحترافية وبالعربية فقط.
        `,
        },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_completion_tokens: 512,
    });

    const reply =
      completion.choices[0]?.message?.content || "عذراً، لم أفهم سؤالك.";
    console.log("🤖 DEBUG => AI Reply:", reply);
    return reply;
  } catch (err) {
    console.error("❌ DEBUG => AI Error:", err.response?.data || err.message);
    return "⚠️ حدث خطأ في نظام المساعد الذكي.";
  }
}

// 🔹 إرسال رسالة نصية
async function sendTextMessage(to, text) {
  try {
    console.log(`📤 DEBUG => Sending WhatsApp message to ${to}:`, text);
    return await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error(
      "❌ DEBUG => WhatsApp send error:",
      err.response?.data || err.message
    );
  }
}

// 🔹 إرسال خيارات المواعيد
async function sendAppointmentOptions(to) {
  console.log(`📤 DEBUG => Sending appointment options to ${to}`);
  return sendTextMessage(
    to,
    "📅 اختر الموعد المناسب لك: \n1️⃣ 3 PM \n2️⃣ 6 PM \n3️⃣ 9 PM"
  );
}

// 🔹 حفظ البيانات في Google Sheets
async function saveBooking({ name, phone, service, appointment }) {
  try {
    const values = [
      [name, phone, service, appointment, new Date().toISOString()],
    ];
    console.log("📤 DEBUG => Data to send to Google Sheets:", values);

    console.log(
      `🔍 DEBUG => Trying to append to Sheet: "${DEFAULT_SHEET_NAME}" in spreadsheet: "${SPREADSHEET_ID}"`
    );

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    console.log(
      "✅ DEBUG => Google Sheets API response:",
      result.statusText || result.status
    );
  } catch (err) {
    console.error(
      "❌ DEBUG => Google Sheets Error:",
      err.response?.data || err.message
    );
  }
}

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

let tempBookings = {};

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log(
      "📩 DEBUG => Incoming webhook body:",
      JSON.stringify(body, null, 2)
    );

    if (!body.object) return res.sendStatus(404);

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    if (!message || !from) return res.sendStatus(200);

    // ✅ التعامل مع الأزرار
    if (message.type === "interactive") {
      const id = message?.interactive?.button_reply?.id;
      console.log("🔘 DEBUG => Button pressed:", id);
      let appointment;
      if (id === "slot_3pm") appointment = "3 PM";
      if (id === "slot_6pm") appointment = "6 PM";
      if (id === "slot_9pm") appointment = "9 PM";

      if (appointment) {
        tempBookings[from] = { appointment };
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
      }
      return res.sendStatus(200);
    }

    // ✅ التعامل مع النصوص
    const text = message?.text?.body?.trim();
    if (text) {
      console.log(`💬 DEBUG => Message from ${from}:`, text);

      // لو المستخدم كتب رقم الموعد بدلاً من الضغط على الزر
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        let appointment;
        if (text === "3") appointment = "3 PM";
        if (text === "6") appointment = "6 PM";
        if (text === "9") appointment = "9 PM";

        tempBookings[from] = { appointment };
        console.log("📝 DEBUG => Appointment set manually:", appointment);
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      if (tempBookings[from] && !tempBookings[from].name) {
        tempBookings[from].name = text;
        await sendTextMessage(from, "📱 ممتاز! ارسل رقم جوالك:");
        return res.sendStatus(200);
      } else if (tempBookings[from] && !tempBookings[from].phone) {
        tempBookings[from].phone = text;
        await sendTextMessage(from, "💊 تمام! اكتب نوع الخدمة المطلوبة:");
        return res.sendStatus(200);
      } else if (tempBookings[from] && !tempBookings[from].service) {
        tempBookings[from].service = text;

        const booking = tempBookings[from];
        console.log("📦 DEBUG => Final booking data:", booking);
        await saveBooking({
          name: booking.name,
          phone: booking.phone,
          service: booking.service,
          appointment: booking.appointment,
        });

        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك: 
👤 الاسم: ${booking.name}
📱 الجوال: ${booking.phone}
💊 الخدمة: ${booking.service}
📅 الموعد: ${booking.appointment}`
        );

        delete tempBookings[from];
        return res.sendStatus(200);
      }

      if (text.includes("حجز") || text.toLowerCase().includes("book")) {
        await sendAppointmentOptions(from);
      } else {
        const reply = await askAI(text);
        await sendTextMessage(from, reply);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(
      "❌ DEBUG => Webhook Error:",
      err.response?.data || err.message
    );
    res.sendStatus(500);
  }
});

// 🚀 للتشغيل محلياً
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
