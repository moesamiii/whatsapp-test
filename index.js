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

// 🔹 تحقق من الحجز (اليوم + الوقت)
function validateBookingRequest(userText) {
  const daysMap = {
    السبت: "Saturday",
    الأحد: "Sunday",
    الاثنين: "Monday",
    الثلاثاء: "Tuesday",
    الأربعاء: "Wednesday",
    الخميس: "Thursday",
    الجمعة: "Friday",
  };

  // 1. اكتشاف أكثر من يوم
  const mentionedDays = Object.keys(daysMap).filter((day) =>
    userText.includes(day)
  );
  if (mentionedDays.length > 1) {
    return {
      valid: false,
      reason: "⚠️ لا يمكن الحجز في أكثر من يوم بنفس الوقت.",
    };
  }

  // 2. التأكد من اليوم
  if (mentionedDays.length === 1) {
    const chosenDay = mentionedDays[0];
    if (chosenDay === "الجمعة") {
      return { valid: false, reason: "⚠️ العيادة مغلقة يوم الجمعة." };
    }
  }

  // 3. استخراج الأوقات بصيغة 9 أو 9 AM أو 21:00
  const timeRegex = /(\d{1,2})(?::(\d{2}))?\s?(AM|PM)?/i;
  const match = userText.match(timeRegex);
  if (!match) {
    return {
      valid: false,
      reason: "⚠️ الرجاء تحديد وقت واضح (مثال: 10 AM أو 6 PM).",
    };
  }

  let hour = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3] ? match[3].toUpperCase() : null;

  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  // 4. التأكد من الوقت (بين 9 AM و 9 PM)
  if (hour < 9 || hour > 21) {
    return { valid: false, reason: "⚠️ المواعيد المتاحة فقط بين 9 AM و 9 PM." };
  }

  // ✅ وقت صحيح
  const formattedTime = `${String(hour).padStart(2, "0")}:${String(
    minutes
  ).padStart(2, "0")}`;
  return {
    valid: true,
    time: formattedTime,
    day: mentionedDays[0] || "بدون تحديد يوم",
  };
}

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
أنت موظف خدمة عملاء لعيادة طبية.
مهمتك الرد فقط على:
- المواعيد 🕒 (بين 9 AM و 9 PM)
- الأسعار 💰
- الموقع 📍
- الحجز 📅

❌ لا توافق على أي حجز خارج هذه الأوقات.
❌ لا توافق على الحجز يوم الجمعة.
❌ لا توافق على الحجز إذا ذكر أكثر من يوم بنفس الجملة.

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

// 🔹 حفظ البيانات في Google Sheets
async function saveBooking({ name, phone, service, appointment }) {
  try {
    const values = [
      [name, phone, service, appointment, new Date().toISOString()],
    ];
    console.log("📤 DEBUG => Data to send to Google Sheets:", values);

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

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    if (!message || !from) return res.sendStatus(200);

    const text = message?.text?.body?.trim();
    if (text) {
      console.log(`💬 DEBUG => Message from ${from}:`, text);

      // تحقق من الحجز
      const check = validateBookingRequest(text);
      if (!check.valid) {
        await sendTextMessage(from, check.reason);
        return res.sendStatus(200);
      }

      // طلب اسم ورقم وخدمة بعد تحديد الموعد
      if (!tempBookings[from]) {
        tempBookings[from] = { appointment: `${check.day} - ${check.time}` };
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      // استكمال البيانات
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
        await saveBooking(booking);
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

      // fallback: لو مش حجز
      const reply = await askAI(text);
      await sendTextMessage(from, reply);
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

let tempBookings = {};
