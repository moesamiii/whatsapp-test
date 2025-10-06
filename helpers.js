// helpers.js
const axios = require("axios");
const { google } = require("googleapis");
const { askAI, validateNameWithAI } = require("./aiHelper"); // ✅ Import AI utilities

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
  console.log("🟢 DEBUG => Google credentials loaded successfully.");
} catch (err) {
  console.error("❌ DEBUG => Failed to load credentials:", err.message);
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
    console.log(
      "🔍 DEBUG => Detecting sheet names for spreadsheet:",
      SPREADSHEET_ID
    );
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const names = meta.data.sheets.map((s) => s.properties.title);
    console.log("📋 DEBUG => Sheets found:", names);

    if (names.length > 0) {
      DEFAULT_SHEET_NAME = names[0];
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

// ---------------------------------------------
// 💬 WhatsApp messaging utilities
// ---------------------------------------------
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
    console.error(
      "❌ DEBUG => WhatsApp send error:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 📅 Appointment buttons
// ---------------------------------------------
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
    console.log("✅ DEBUG => Appointment buttons sent successfully");
  } catch (err) {
    console.error(
      "❌ DEBUG => Error sending appointment buttons:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 💊 Service buttons
// ---------------------------------------------
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
                  { id: "service_خلع", title: "خلع الأسنان" },
                  { id: "service_زراعة", title: "زراعة الأسنان" },
                  { id: "service_تقويم", title: "تقويم الأسنان" },
                  { id: "service_ابتسامة", title: "ابتسامة هوليود" },
                  { id: "service_علاج_عصب", title: "علاج عصب" },
                  { id: "service_كشفية", title: "كشفية فحص" },
                  { id: "service_تجميل", title: "تجميل الأسنان" },
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
    console.log("✅ DEBUG => Service buttons sent successfully");
  } catch (err) {
    console.error(
      "❌ DEBUG => Error sending service buttons:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 🗓️ Send appointment options (shortcut)
// ---------------------------------------------
async function sendAppointmentOptions(to) {
  console.log(`📤 DEBUG => Sending appointment options to ${to}`);
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
    console.log("📤 DEBUG => Data to send to Google Sheets:", values);
    console.log(
      `🔍 DEBUG => Appending to sheet "${DEFAULT_SHEET_NAME}" in spreadsheet "${SPREADSHEET_ID}"`
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
// ✅ Export everything
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
};
