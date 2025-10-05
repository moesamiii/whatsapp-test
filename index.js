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
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const sheetNames = meta.data.sheets.map((s) => s.properties.title);
    if (sheetNames.length > 0) DEFAULT_SHEET_NAME = sheetNames[0];
    console.log("✅ DEBUG => Using sheet:", DEFAULT_SHEET_NAME);
  } catch (err) {
    console.error("❌ DEBUG => Error detecting sheets:", err.message);
  }
}
detectSheetName();

// ---------------------------------------------
// دوال مساعدة
// ---------------------------------------------

// 🔹 استدعاء AI العام
async function askAI(userMessage) {
  try {
    const systemPrompt = `
أنت موظف خدمة عملاء ذكي في عيادة طبية.
ترد فقط على الأسئلة المتعلقة بـ:
- المواعيد 🕒
- الأسعار 💰
- الموقع 📍
- الحجز 📅

إذا كان السؤال خارج هذه المواضيع، قل بأدب:
"أستطيع مساعدتك فقط في المواعيد، الأسعار، الموقع أو الحجز."
`;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_completion_tokens: 512,
    });

    return completion.choices[0]?.message?.content || "عذراً، لم أفهم سؤالك.";
  } catch (err) {
    console.error("❌ DEBUG => AI Error:", err.message);
    return "⚠️ حدث خطأ في نظام المساعد الذكي.";
  }
}

// 🔹 التحقق من الاسم عبر الذكاء الاصطناعي
async function validateNameWithAI(name) {
  try {
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: `الاسم المدخل هو: "${name}". هل هذا يبدو كاسم شخص حقيقي بالعربية؟ أجب فقط بـ "نعم" أو "لا".`,
        },
      ],
      temperature: 0,
      max_completion_tokens: 10,
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    return reply && reply.startsWith("نعم");
  } catch (err) {
    console.error("❌ DEBUG => Name validation error:", err.message);
    return false;
  }
}

// 🔹 إرسال رسالة نصية
async function sendTextMessage(to, text) {
  try {
    console.log(`📤 DEBUG => Sending WhatsApp message to ${to}:`, text);
    await axios.post(
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
    console.error("❌ DEBUG => WhatsApp send error:", err.message);
  }
}

// 🔹 إرسال أزرار المواعيد
async function sendAppointmentButtons(to) {
  console.log(`📤 DEBUG => Sending appointment buttons to ${to}`);
  try {
    await axios.post(
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
              { type: "reply", reply: { id: "slot_3pm", title: "3 PM" } },
              { type: "reply", reply: { id: "slot_6pm", title: "6 PM" } },
              { type: "reply", reply: { id: "slot_9pm", title: "9 PM" } },
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
    console.log("✅ Appointment buttons sent successfully");
  } catch (err) {
    console.error(
      "❌ DEBUG => Error sending appointment buttons:",
      err.message
    );
  }
}

// 🔹 إرسال أزرار الخدمات
async function sendServiceButtons(to) {
  console.log(`📤 DEBUG => Sending service buttons to ${to}`);
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "💊 اختر نوع الخدمة المطلوبة:" },
          action: {
            buttons: [
              {
                type: "reply",
                reply: { id: "srv_cleaning", title: "تنظيف الأسنان" },
              },
              {
                type: "reply",
                reply: { id: "srv_whitening", title: "تبييض الأسنان" },
              },
              {
                type: "reply",
                reply: { id: "srv_filling", title: "حشو الأسنان" },
              },
              {
                type: "reply",
                reply: { id: "srv_braces", title: "تقويم الأسنان" },
              },
              {
                type: "reply",
                reply: { id: "srv_implant", title: "زراعة الأسنان" },
              },
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
    console.log("✅ Service buttons sent successfully");
  } catch (err) {
    console.error("❌ DEBUG => Error sending service buttons:", err.message);
  }
}

// 🔹 حفظ البيانات في Google Sheets
async function saveBooking({ name, phone, service, appointment }) {
  try {
    const values = [
      [name, phone, service, appointment, new Date().toISOString()],
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
    console.log("✅ Booking saved to Google Sheets");
  } catch (err) {
    console.error("❌ DEBUG => Google Sheets Error:", err.message);
  }
}

// ---------------------------------------------
// Routes
// ---------------------------------------------
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Webhook for Clinic is running!");
});

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

let tempBookings = {};

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = message?.from;
    if (!message || !from) return res.sendStatus(200);

    // ✅ التعامل مع الأزرار
    if (message.type === "interactive") {
      const id = message?.interactive?.button_reply?.id;

      // المواعيد
      if (id?.startsWith("slot_")) {
        const appointment =
          id === "slot_3pm" ? "3 PM" : id === "slot_6pm" ? "6 PM" : "9 PM";
        tempBookings[from] = { appointment };
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      // الخدمات
      if (id?.startsWith("srv_")) {
        const serviceMap = {
          srv_cleaning: "تنظيف الأسنان",
          srv_whitening: "تبييض الأسنان",
          srv_filling: "حشو الأسنان",
          srv_braces: "تقويم الأسنان",
          srv_implant: "زراعة الأسنان",
        };
        const service = serviceMap[id];
        if (tempBookings[from]) {
          tempBookings[from].service = service;
          const booking = tempBookings[from];
          await saveBooking(booking);
          await sendTextMessage(
            from,
            `✅ تم حفظ حجزك:\n👤 الاسم: ${booking.name}\n📱 الجوال: ${booking.phone}\n💊 الخدمة: ${booking.service}\n📅 الموعد: ${booking.appointment}`
          );
          delete tempBookings[from];
        }
        return res.sendStatus(200);
      }
    }

    // ✅ التعامل مع النصوص
    const text = message?.text?.body?.trim();
    if (!text) return res.sendStatus(200);

    // بدء الحجز
    if (text.includes("حجز") || text.toLowerCase().includes("book")) {
      await sendAppointmentButtons(from);
      return res.sendStatus(200);
    }

    // إدخال الاسم
    if (tempBookings[from] && !tempBookings[from].name) {
      const isValid = await validateNameWithAI(text);
      if (!isValid) {
        await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد أو سارة."
        );
        return res.sendStatus(200);
      }
      tempBookings[from].name = text;
      await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
      return res.sendStatus(200);
    }

    // إدخال رقم الهاتف
    if (tempBookings[from] && !tempBookings[from].phone) {
      const normalized = text.replace(/[^\d٠-٩]/g, "");
      const arabicToEnglish = normalized
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

      const isValidJordanian =
        /^07\d{8}$/.test(arabicToEnglish) && arabicToEnglish.length === 10;
      if (!isValidJordanian) {
        await sendTextMessage(
          from,
          "⚠️ الرجاء إدخال رقم هاتف أردني صحيح مثل: 079xxxxxxx"
        );
        return res.sendStatus(200);
      }

      tempBookings[from].phone = arabicToEnglish;
      await sendServiceButtons(from);
      return res.sendStatus(200);
    }

    const reply = await askAI(text);
    await sendTextMessage(from, reply);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ DEBUG => Webhook Error:", err.message);
    res.sendStatus(500);
  }
});

// 🚀 تشغيل الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
