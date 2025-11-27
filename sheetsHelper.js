// sheetsHelper.js
const { google } = require("googleapis");

// ---------------------------------------------
// 🔧 Environment variables
// ---------------------------------------------
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
  console.error("❌ DEBUG => Failed to load Google credentials:", err.message);
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
    console.log("🔍 DEBUG => Detecting sheet names...");
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const names = meta.data.sheets.map((s) => s.properties.title);
    console.log("📋 DEBUG => Sheets found:", names);

    if (names.length > 0) {
      DEFAULT_SHEET_NAME = names[0];
      console.log("✅ DEBUG => Using sheet:", DEFAULT_SHEET_NAME);
    }
  } catch (err) {
    console.error("❌ DEBUG => Error detecting sheets:", err.message);
  }
}

// ---------------------------------------------
// 🧾 Save booking to Google Sheets
// ---------------------------------------------
async function saveBooking({ name, phone, service, appointment }) {
  try {
    const values = [
      [name, phone, service, appointment, new Date().toISOString()],
    ];

    console.log(
      `📤 DEBUG => Appending to sheet "${DEFAULT_SHEET_NAME}" in spreadsheet "${SPREADSHEET_ID}"`
    );

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    console.log("✅ DEBUG => Booking saved successfully.");
  } catch (err) {
    console.error("❌ DEBUG => Google Sheets append error:", err.message);
  }
}

// ---------------------------------------------
// 🧾 Update an existing booking
// ---------------------------------------------
async function updateBooking(rowIndex, { name, phone, service, appointment }) {
  try {
    const values = [
      [name, phone, service, appointment, new Date().toISOString()],
    ];

    const range = `${DEFAULT_SHEET_NAME}!A${rowIndex}:E${rowIndex}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    console.log("✅ DEBUG => Booking updated successfully.");
  } catch (err) {
    console.error("❌ DEBUG => Failed to update booking:", err.message);
  }
}

// ---------------------------------------------
// 📖 Get all bookings from Google Sheets
// ---------------------------------------------
async function getAllBookings() {
  try {
    console.log(`📥 DEBUG => Fetching bookings from: ${DEFAULT_SHEET_NAME}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
    });

    const rows = response.data.values || [];

    return rows.map(([name, phone, service, appointment, timestamp]) => ({
      name: name || "",
      phone: phone || "",
      service: service || "",
      appointment: appointment || "",
      time: timestamp || "",
    }));
  } catch (err) {
    console.error("❌ DEBUG => Error fetching bookings:", err.message);
    return [];
  }
}

// ---------------------------------------------
// 🧠 Test connection
// ---------------------------------------------
async function testGoogleConnection() {
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    console.log(
      "✅ Google Sheets connected. Found sheets:",
      meta.data.sheets.map((s) => s.properties.title)
    );
  } catch (err) {
    console.error("❌ Failed to connect to Google Sheets:", err.message);
  }
}

module.exports = {
  detectSheetName,
  saveBooking,
  updateBooking,
  getAllBookings,
  testGoogleConnection,
};
