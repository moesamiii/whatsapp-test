// ============================================================================
// 📦 helpers.js — GOOGLE SHEETS ONLY (Search, Save, Delete)
// ============================================================================

const axios = require("axios");
const { google } = require("googleapis");
const { askAI, validateNameWithAI } = require("./aiHelper");

// ---------------------------------------------
// 🔧 Environment variables
// ---------------------------------------------
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

// ---------------------------------------------
// 🧠 Google Sheets setup
// ---------------------------------------------
let creds;

try {
  creds = process.env.GOOGLE_CREDENTIALS
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
    : require("./credentials.json");
  console.log("🟢 Google credentials loaded.");
} catch (err) {
  console.error("❌ Failed to load Google credentials:", err.message);
}

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
let DEFAULT_SHEET_NAME = "Sheet1";

// ---------------------------------------------
// 💬 WhatsApp Messaging
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
        },
      }
    );
  } catch (err) {
    console.error(
      "❌ WhatsApp message error:",
      err.response?.data || err.message
    );
  }
}

// Appointment buttons
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
      }
    );
  } catch (err) {
    console.error("❌ Appointment error:", err.message);
  }
}

// Service dropdown
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
          body: { text: "اختر خدمة:" },
          action: {
            button: "عرض الخدمات",
            sections: [
              {
                title: "الخدمات",
                rows: [
                  { id: "service_فحص_عام", title: "فحص عام" },
                  { id: "service_تنظيف_الأسنان", title: "تنظيف الأسنان" },
                  { id: "service_حشو_الأسنان", title: "حشو الأسنان" },
                  { id: "service_تبييض_الأسنان", title: "تبييض الأسنان" },
                ],
              },
            ],
          },
        },
      }
    );
  } catch (err) {
    console.error("❌ Service list error:", err.message);
  }
}

// ---------------------------------------------
// 📌 Save booking to Google Sheets
// ---------------------------------------------
async function saveBooking({ name, phone, service, appointment }) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[name, phone, service, appointment, new Date().toISOString()]],
      },
    });
  } catch (err) {
    console.error("❌ Save booking error:", err.message);
  }
}

// ---------------------------------------------
// 📌 Search bookings by phone
// ---------------------------------------------
async function getBookingsByPhone(phone) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
    });

    const rows = response.data.values || [];

    // Skip header row (row index 1)
    const matches = [];

    rows.forEach((row, index) => {
      const sheetPhone = (row[1] || "").replace(/\s+/g, "");
      const userPhone = phone.replace(/\s+/g, "");

      if (sheetPhone === userPhone) {
        matches.push({
          rowIndex: index + 1, // Google Sheets rows start at 1
          name: row[0],
          phone: row[1],
          service: row[2],
          appointment: row[3],
        });
      }
    });

    return matches;
  } catch (err) {
    console.error("❌ getBookingsByPhone error:", err.message);
    return [];
  }
}

// ---------------------------------------------
// 📌 Delete booking from Google Sheets
// ---------------------------------------------
async function deleteBookingById(rowIndex) {
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0, // sheet index 0 = Sheet1
                dimension: "ROWS",
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      },
    });

    return true;
  } catch (err) {
    console.error("❌ Delete row error:", err.message);
    return false;
  }
}

// ---------------------------------------------
// 📌 Send list of bookings to delete
// ---------------------------------------------
async function sendBookingsList(to, bookings) {
  if (!bookings.length) {
    await sendTextMessage(to, "❌ لم يتم العثور على حجوزات.");
    return;
  }

  const rows = bookings.slice(0, 10).map((b) => ({
    id: `delete_${b.rowIndex}`,
    title: b.name,
    description: `📅 ${b.appointment} | ${b.service}`.slice(0, 72),
  }));

  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "حجوزاتك" },
          body: { text: "اختر الحجز الذي تريد حذفه:" },
          action: {
            button: "عرض",
            sections: [{ title: "حجوزات", rows }],
          },
        },
      }
    );
  } catch (err) {
    console.error("❌ sendBookingsList error:", err.message);
  }
}

// ---------------------------------------------
// EXPORTS
// ---------------------------------------------
module.exports = {
  askAI,
  validateNameWithAI,

  sendTextMessage,
  sendAppointmentButtons,
  sendServiceButtons: sendServiceButtons,
  sendServiceList,
  sendAppointmentOptions: sendAppointmentButtons,

  saveBooking,
  getBookingsByPhone,
  deleteBookingById,
  sendBookingsList,
};
