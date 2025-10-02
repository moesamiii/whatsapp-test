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
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ✅ إعداد عميل Groq
const client = new Groq({ apiKey: GROQ_API_KEY });

// ✅ إعداد Google Sheets API (يدعم env وملف محلي)
const creds = process.env.GOOGLE_CREDENTIALS
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
  : require("./credentials.json");

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

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
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
    console.log("✅ Booking saved to Google Sheets");
  } catch (err) {
    console.error("❌ Google Sheets Error:", err.message);
  }
}

// ---------------------------------------------
// Routes
// ---------------------------------------------

// ✅ Route أساسي للفحص
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Webhook for Clinic is running on Vercel!");
});

// ✅ للتحقق من التوكن عند الإعداد في Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("🌍 Verification Request:", { mode, token, challenge });

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 📩 استقبال رسائل من WhatsApp + الرد الذكي (AI-first)
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("📦 Incoming webhook body:", JSON.stringify(body, null, 2));

    if (!body.object) return res.sendStatus(404);

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;

    if (!message || !from) return res.sendStatus(200);

    // ✅ التعامل مع الأزرار (Button Replies)
    if (message.type === "interactive") {
      const id = message?.interactive?.button_reply?.id;
      if (id) {
        let appointment;
        if (id === "slot_3pm") appointment = "3 PM";
        if (id === "slot_6pm") appointment = "6 PM";
        if (id === "slot_9pm") appointment = "9 PM";

        if (appointment) {
          const reply = `✅ تم حجز موعدك الساعة ${appointment}.`;

          // 📝 حفظ في Google Sheets
          await saveBooking({
            name: "عميل واتساب",
            phone: from,
            service: "كشف طبي",
            appointment,
          });

          await sendTextMessage(from, reply);
        }
      }
      return res.sendStatus(200);
    }

    // ✅ التعامل مع الرسائل النصية (AI مباشرة)
    const text = message?.text?.body;
    if (text) {
      try {
        const reply = await askAI(text);

        // إذا قال "أريد أحجز" → أرسل له خيارات المواعيد
        if (text.includes("حجز") || text.toLowerCase().includes("book")) {
          await sendAppointmentOptions(from);
        } else {
          await sendTextMessage(
            from,
            reply || "عذراً، لم أفهم سؤالك. ممكن توضّح أكثر؟"
          );
        }
      } catch (e) {
        console.error("AI Error:", e.message);
        await sendTextMessage(from, "❌ حدث خطأ تقني، حاول مرة أخرى لاحقاً.");
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
