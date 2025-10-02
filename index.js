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

// ✅ استعملنا المتغير الجديد GOOGLE_SHEET_ID
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();

// ✅ طباعة للتأكد من القيمة الحقيقية
console.log("🟢 SPREADSHEET_ID being used:", `"${SPREADSHEET_ID}"`);

// ✅ إعداد عميل Groq
const client = new Groq({ apiKey: GROQ_API_KEY });

// ✅ إعداد Google Sheets API
const creds = process.env.GOOGLE_CREDENTIALS
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
  : require("./credentials.json");

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// ---------------------------------------------
// Debug: طباعة أسماء الشيتات الموجودة
// ---------------------------------------------
async function listSheets() {
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    console.log(
      "📋 Sheets in file:",
      meta.data.sheets.map((s) => s.properties.title)
    );
  } catch (err) {
    console.error("❌ Error listing sheets:", err.message);
  }
}
listSheets(); // يتنفذ عند تشغيل السيرفر

// ---------------------------------------------
// دوال مساعدة
// ---------------------------------------------

// 🔹 استدعاء AI
async function askAI(userMessage) {
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

  return completion.choices[0]?.message?.content || "عذراً، لم أفهم سؤالك.";
}

// 🔹 إرسال رسالة نصية
async function sendTextMessage(to, text) {
  return axios.post(
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
}

// 🔹 إرسال خيارات المواعيد
async function sendAppointmentOptions(to) {
  return axios.post(
    `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "📅 اختر الموعد المناسب لك:" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "slot_3pm", title: "🕒 3 PM" } },
            { type: "reply", reply: { id: "slot_6pm", title: "🌆 6 PM" } },
            { type: "reply", reply: { id: "slot_9pm", title: "🌙 9 PM" } },
          ],
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// 🔹 حفظ البيانات في Google Sheets
async function saveBooking({ name, phone, service, appointment }) {
  try {
    const values = [
      [name, phone, service, appointment, new Date().toISOString()],
    ];
    console.log("📤 Sending to Google Sheets:", values);

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    console.log(
      "✅ Google Sheets API response:",
      result.statusText || result.status
    );
  } catch (err) {
    console.error("❌ Google Sheets Error:", err.message);
  }
}

// ---------------------------------------------
// Routes
// ---------------------------------------------

app.get("/", (req, res) => {
  res.send("✅ WhatsApp Webhook for Clinic is running on Vercel!");
});

// ✅ للتحقق من التوكن عند الإعداد في Meta
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

// 📩 استقبال رسائل من WhatsApp
let tempBookings = {};

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (!body.object) return res.sendStatus(404);

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    if (!message || !from) return res.sendStatus(200);

    // ✅ التعامل مع الأزرار
    if (message.type === "interactive") {
      const id = message?.interactive?.button_reply?.id;
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
    const text = message?.text?.body;
    if (text) {
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
    console.error("❌ Webhook Error:", err.message);
    res.sendStatus(500);
  }
});

// 🚀 للتشغيل محلياً
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
