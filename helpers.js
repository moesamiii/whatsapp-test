const axios = require("axios");
const { google } = require("googleapis");
const { askAI, validateNameWithAI } = require("./aiHelper");
const stringSimilarity = require("string-similarity");

// ---------------------------------------------
// 🔧 Environment variables
// ---------------------------------------------
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();

// ---------------------------------------------
// 🧠 Google Sheets setup
// ---------------------------------------------
let creds;
try {
  creds = process.env.GOOGLE_CREDENTIALS
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
    : require("./credentials.json");
  console.log("🟢 Google credentials loaded successfully.");
} catch (err) {
  console.error("❌ Failed to load credentials:", err.message);
}

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

let DEFAULT_SHEET_NAME = "Sheet1";

// ---------------------------------------------
// 🔍 Detect sheet name dynamically
// ---------------------------------------------
async function detectSheetName() {
  try {
    console.log("🔍 Detecting sheet names for spreadsheet:", SPREADSHEET_ID);
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const names = meta.data.sheets.map((s) => s.properties.title);
    console.log("📋 Sheets found:", names);

    if (names.length > 0) {
      DEFAULT_SHEET_NAME = names[0];
      console.log("✅ Using sheet:", DEFAULT_SHEET_NAME);
    } else {
      console.warn("⚠️ No sheets found in spreadsheet.");
    }
  } catch (err) {
    console.error(
      "❌ Error detecting sheets:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 💬 WhatsApp text sender
// ---------------------------------------------
async function sendTextMessage(to, text) {
  try {
    console.log(`📤 Sending WhatsApp text to ${to}:`, text);
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Text message sent successfully");
  } catch (err) {
    console.error(
      "❌ WhatsApp sendTextMessage error:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 📅 Appointment buttons
// ---------------------------------------------
async function sendAppointmentButtons(to) {
  try {
    console.log(`📤 Sending appointment buttons to ${to}`);
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
      "❌ sendAppointmentButtons error:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 💊 Service list dropdown (fixed WhatsApp list)
// ---------------------------------------------
async function sendServiceButtons(to) {
  try {
    console.log(`📤 Sending service dropdown list to ${to}`);

    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "💊 قائمة الخدمات" },
          body: { text: "اختر نوع الخدمة المطلوبة من القائمة أدناه 👇" },
          footer: { text: "عيادة الأسنان - لخدمتك دائمًا 🌷" },
          action: {
            button: "اختر الخدمة",
            sections: [
              {
                title: "خدمات الأسنان العامة",
                rows: [
                  { id: "service_تنظيف_الأسنان", title: "تنظيف الأسنان" },
                  { id: "service_تبييض_الأسنان", title: "تبييض الأسنان" },
                  { id: "service_حشو_الأسنان", title: "حشو الأسنان" },
                  { id: "service_خلع_الأسنان", title: "خلع الأسنان" },
                  { id: "service_زراعة_الأسنان", title: "زراعة الأسنان" },
                  { id: "service_تقويم_الأسنان", title: "تقويم الأسنان" },
                ],
              },
              {
                title: "تجميل وخدمات متقدمة",
                rows: [
                  { id: "service_ابتسامة_هوليود", title: "ابتسامة هوليود" },
                  { id: "service_علاج_عصب", title: "علاج عصب" },
                  { id: "service_كشفية_فحص", title: "كشفية فحص" },
                  { id: "service_تجميل_الأسنان", title: "تجميل الأسنان" },
                ],
              },
              {
                title: "خدمات إضافية",
                rows: [
                  { id: "service_استشارة_عامة", title: "استشارة عامة" },
                  { id: "service_أشعة_تشخيصية", title: "أشعة تشخيصية" },
                ],
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

    console.log("✅ Service dropdown list sent successfully ✅");
  } catch (err) {
    console.error(
      "❌ sendServiceButtons error:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 🗓️ Shortcut to appointment
// ---------------------------------------------
async function sendAppointmentOptions(to) {
  await sendAppointmentButtons(to);
}

// ---------------------------------------------
// 🧾 Save booking to Google Sheets
// ---------------------------------------------
async function saveBooking({ name, phone, service, appointment }) {
  try {
    const values = [
      [name, phone, service, appointment, new Date().toISOString()],
    ];
    console.log("📤 Sending booking to Google Sheets:", values);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    console.log("✅ Booking saved successfully to Google Sheets.");
  } catch (err) {
    console.error("❌ saveBooking error:", err.response?.data || err.message);
  }
}

// ---------------------------------------------
// 📖 Fetch all bookings for dashboard
// ---------------------------------------------
async function getAllBookings() {
  try {
    const range = `${DEFAULT_SHEET_NAME}!A:E`;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });
    const rows = res.data.values || [];
    if (rows.length === 0) return [];
    return rows.map(([name, phone, service, appointment, time]) => ({
      name: name || "",
      phone: phone || "",
      service: service || "",
      appointment: appointment || "",
      time: time || "",
    }));
  } catch (err) {
    console.error(
      "❌ getAllBookings error:",
      err.response?.data || err.message
    );
    return [];
  }
}

// ---------------------------------------------
// 🧠 Fuzzy Service Matching
// ---------------------------------------------
const servicesList = [
  "تنظيف الأسنان",
  "تبييض الأسنان",
  "حشو الأسنان",
  "خلع الأسنان",
  "زراعة الأسنان",
  "تقويم الأسنان",
  "ابتسامة هوليود",
  "علاج عصب",
  "كشفية فحص",
  "تجميل الأسنان",
  "استشارة عامة",
  "أشعة تشخيصية",
];

function findClosestService(userInput) {
  const matches = stringSimilarity.findBestMatch(userInput, servicesList);
  const best = matches.bestMatch;
  if (best.rating > 0.5) {
    console.log(`🎯 Closest service match: ${best.target} (${best.rating})`);
    return best.target;
  }
  console.log(`⚠️ No close service match for "${userInput}"`);
  return null;
}

function suggestClosestService(userInput) {
  const matches = stringSimilarity.findBestMatch(userInput, servicesList);
  const best = matches.bestMatch;
  if (best.rating > 0.4 && best.rating < 0.7) {
    return `هل تقصد "${best.target}"؟ 💡`;
  }
  return null;
}

// ---------------------------------------------
// ✅ Exports
// ---------------------------------------------
module.exports = {
  askAI,
  validateNameWithAI,
  detectSheetName,
  sendTextMessage,
  sendAppointmentButtons,
  sendServiceButtons,
  sendAppointmentOptions,
  saveBooking,
  getAllBookings,
  findClosestService,
  suggestClosestService,
  servicesList,
};
