// helpers.js
const axios = require("axios");
const { google } = require("googleapis");
const { askAI, validateNameWithAI } = require("./aiHelper");

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
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const names = meta.data.sheets.map((s) => s.properties.title);
    if (names.length > 0) DEFAULT_SHEET_NAME = names[0];
  } catch (err) {
    console.error("❌ Error detecting sheets:", err.message);
  }
}

// ---------------------------------------------
// 💬 Basic WhatsApp Messaging
// ---------------------------------------------
async function sendTextMessage(to, text) {
  try {
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
    console.error("❌ WhatsApp send error:", err.response?.data || err.message);
  }
}

// ---------------------------------------------
// 📅 Appointment buttons
// ---------------------------------------------
async function sendAppointmentButtons(to) {
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
  } catch (err) {
    console.error("❌ Error sending appointment buttons:", err.message);
  }
}

// ---------------------------------------------
// 💊 Service List (Dropdown)
// ---------------------------------------------
async function sendServiceList(to) {
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "💊 اختر الخدمة المطلوبة" },
          body: { text: "يرجى اختيار نوع الخدمة من القائمة:" },
          action: {
            button: "عرض الخدمات",
            sections: [
              {
                title: "الخدمات الأساسية",
                rows: [
                  { id: "service_فحص_عام", title: "فحص عام" },
                  { id: "service_تنظيف_الأسنان", title: "تنظيف الأسنان" },
                  { id: "service_تبييض_الأسنان", title: "تبييض الأسنان" },
                  { id: "service_حشو_الأسنان", title: "حشو الأسنان" },
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
  } catch (err) {
    console.error("❌ Error sending service list:", err.message);
  }
}

// Shortcut:
async function sendAppointmentOptions(to) {
  return sendAppointmentButtons(to);
}

// ---------------------------------------------
// 🧾 Save booking to Google Sheets
// ---------------------------------------------
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
    console.error("❌ Append error:", err.message);
  }
}

// ---------------------------------------------
// 📖 Load all bookings
// ---------------------------------------------
async function getAllBookings() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    return rows.slice(1).map((row) => ({
      name: row[0],
      phone: row[1],
      service: row[2],
      appointment: row[3],
      time: row[4],
    }));
  } catch (err) {
    console.error("❌ Fetch error:", err.message);
    return [];
  }
}

// ============================================================================
// ⭐ NEW FUNCTIONS YOU NEED
// ============================================================================

// ---------------------------------------------
// 🔍 Get bookings by phone (Column B)
// ---------------------------------------------
async function getBookingsByPhone(phone) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
    });

    const rows = res.data.values || [];

    const normalized = phone.toString().trim();

    const matches = [];

    rows.forEach((row, index) => {
      if (index === 0) return; // skip header
      const sheetPhone = (row[1] || "").trim();
      if (sheetPhone === normalized) {
        matches.push({
          rowNumber: index + 1,
          name: row[0],
          phone: row[1],
          service: row[2],
          appointment: row[3],
        });
      }
    });

    return matches;
  } catch (err) {
    console.error("❌ Error getBookingsByPhone:", err.message);
    return [];
  }
}

// ---------------------------------------------
// 🗑️ Delete booking row completely
// ---------------------------------------------
async function deleteBookingById(rowNumber) {
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0, // FIRST sheet
                dimension: "ROWS",
                startIndex: rowNumber - 1,
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    });

    return true;
  } catch (err) {
    console.error("❌ Error deleting:", err.message);
    return false;
  }
}

// ---------------------------------------------
// 📋 WhatsApp list of bookings for user to choose
// ---------------------------------------------
async function sendBookingsList(to, bookings) {
  if (!bookings.length) {
    return sendTextMessage(to, "❌ لا يوجد حجوزات مسجلة على هذا الرقم.");
  }

  const rows = bookings.slice(0, 10).map((b) => ({
    id: `delete_${b.rowNumber}`,
    title: `${b.name}`,
    description: `📅 ${b.appointment} | 💊 ${b.service}`,
  }));

  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "📋 حجوزاتك" },
          body: { text: "اختر الحجز الذي تريد حذفه:" },
          action: {
            button: "عرض الحجوزات",
            sections: [{ title: "قائمة الحجوزات", rows }],
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
  } catch (err) {
    console.error("❌ Error sending list:", err.message);
  }
}

// ============================================================================
// EXPORT
// ============================================================================
module.exports = {
  askAI,
  validateNameWithAI,
  detectSheetName,
  sendTextMessage,
  sendAppointmentButtons,
  sendServiceButtons,
  sendServiceList,
  sendAppointmentOptions,
  saveBooking,
  updateBooking,
  getAllBookings,

  // ⭐ NEW added:
  getBookingsByPhone,
  sendBookingsList,
  deleteBookingById,
};
