const axios = require("axios");
const Groq = require("groq-sdk");
const { google } = require("googleapis");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();

const client = new Groq({ apiKey: GROQ_API_KEY });

let creds;
try {
  creds = process.env.GOOGLE_CREDENTIALS
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
    : require("./credentials.json");
} catch (err) {
  console.error("❌ Failed to load Google credentials:", err.message);
}

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

let DEFAULT_SHEET_NAME = "Sheet1";

async function detectSheetName() {
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const names = meta.data.sheets.map((s) => s.properties.title);
    if (names.length > 0) DEFAULT_SHEET_NAME = names[0];
  } catch (err) {
    console.error("❌ detectSheetName:", err.message);
  }
}

async function askAI(userMessage) {
  try {
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `
أنت موظف خدمة عملاء ذكي في عيادة طبية... (keep full rules)
        `,
        },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_completion_tokens: 512,
    });
    return completion.choices[0]?.message?.content || "عذراً، لم أفهم سؤالك.";
  } catch (err) {
    console.error("❌ AI Error:", err.message);
    return "⚠️ حدث خطأ في نظام المساعد الذكي.";
  }
}

async function validateNameWithAI(name) {
  try {
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: `الاسم "${name}" هل يبدو كاسم شخص حقيقي؟ أجب فقط بـ نعم أو لا.`,
        },
      ],
      temperature: 0,
      max_completion_tokens: 10,
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    return reply && reply.startsWith("نعم");
  } catch {
    return false;
  }
}

async function sendTextMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, text: { body: text } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
  } catch (err) {
    console.error("❌ WhatsApp Error:", err.message);
  }
}

async function sendAppointmentButtons(to) {
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
            { type: "reply", reply: { id: "slot_3pm", title: "3 PM" } },
            { type: "reply", reply: { id: "slot_6pm", title: "6 PM" } },
            { type: "reply", reply: { id: "slot_9pm", title: "9 PM" } },
          ],
        },
      },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

async function sendServiceButtons(to) {
  return axios.post(
    `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "💊 اختر نوع الخدمة المطلوبة:" },
        action: {
          button: "اختر الخدمة",
          sections: [
            {
              title: "خدمات الأسنان",
              rows: [
                { id: "service_تنظيف", title: "تنظيف الأسنان" },
                { id: "service_تبييض", title: "تبييض الأسنان" },
                { id: "service_حشو", title: "حشو الأسنان" },
                { id: "service_زراعة", title: "زراعة الأسنان" },
              ],
            },
          ],
        },
      },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

async function sendAppointmentOptions(to) {
  await sendAppointmentButtons(to);
}

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
  } catch (err) {
    console.error("❌ Google Sheets Error:", err.message);
  }
}

module.exports = {
  askAI,
  validateNameWithAI,
  sendTextMessage,
  sendAppointmentButtons,
  sendServiceButtons,
  sendAppointmentOptions,
  saveBooking,
  detectSheetName,
};
