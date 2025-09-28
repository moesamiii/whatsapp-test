const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const Groq = require("groq-sdk"); // 👈 استدعاء Groq

const app = express();
app.use(bodyParser.json());

// 📌 متغيرات البيئة
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ✅ إعداد عميل Groq
const client = new Groq({ apiKey: GROQ_API_KEY });

// ✅ دالة AI
async function askAI(userMessage) {
  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile", // 👈 يدعم العربي
    messages: [
      {
        role: "system",
        content:
          "أنت موظف خدمة عملاء (call center) لعيادة. رد فقط على الأسئلة المتعلقة بالمواعيد 🕒، الأسعار 💰، الموقع 📍، أو الحجز 📅. ولا تجاوب خارج هذا النطاق. تحدث بالعربية فقط.",
      },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_completion_tokens: 512,
  });

  return completion.choices[0]?.message?.content || "عذراً، لم أفهم سؤالك.";
}

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

// 🔹 دوال إرسال الرسائل
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

// 📩 استقبال رسائل من WhatsApp + الرد الذكي (عيادة مع AI)
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
        let reply;
        if (id === "slot_3pm") reply = "✅ تم حجز موعدك الساعة 3 PM.";
        if (id === "slot_6pm") reply = "✅ تم حجز موعدك الساعة 6 PM.";
        if (id === "slot_9pm") reply = "✅ تم حجز موعدك الساعة 9 PM.";
        if (reply) await sendTextMessage(from, reply);
      }
      return res.sendStatus(200);
    }

    // ✅ التعامل مع الرسائل النصية
    const text = message?.text?.body;
    if (text) {
      const lower = text.toLowerCase();
      let reply;

      if (lower.includes("مرحبا") || lower.includes("hello")) {
        reply = "👋 أهلاً بك في عيادتنا! كيف يمكنني مساعدتك؟";
      } else if (
        lower.includes("مواعيد") ||
        lower.includes("اوقات") ||
        lower.includes("opening")
      ) {
        reply =
          "🕒 مواعيد العيادة: يومياً من 9 صباحاً حتى 9 مساءً ما عدا الجمعة.";
      } else if (
        lower.includes("سعر") ||
        lower.includes("كشف") ||
        lower.includes("فلوس") ||
        lower.includes("price")
      ) {
        reply = "💰 تكلفة الكشف: 150 ريال، تشمل الاستشارة والفحص.";
      } else if (
        lower.includes("موقع") ||
        lower.includes("وين") ||
        lower.includes("address") ||
        lower.includes("location")
      ) {
        reply =
          "📍 موقع العيادة: الرياض - شارع الملك فهد.\nGoogle Maps: https://maps.google.com";
      } else if (
        lower.includes("حجز") ||
        lower.includes("appointment") ||
        lower.includes("book")
      ) {
        await sendAppointmentOptions(from);
        return res.sendStatus(200);
      } else if (lower.includes("شكرا") || lower.includes("thanks")) {
        reply = "🙏 شكراً لك! نتمنى لك الصحة والعافية دائماً.";
      } else {
        // 🔥 إذا ما فيه رد جاهز → نرسل للـ AI
        reply = await askAI(text);
      }

      if (reply) await sendTextMessage(from, reply);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    res.sendStatus(500);
  }
});

// 🚀 للتشغيل محلياً
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
