// sheetsHelper.js - UPDATED with deletion functions
const { google } = require("googleapis");

// Environment variables
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();

// Google Sheets setup
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
      "✅ DEBUG => Google Sheets API append response:",
      result.statusText || result.status
    );
  } catch (err) {
    console.error(
      "❌ DEBUG => Google Sheets append error:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 🧾 Update an existing booking
// (optional future enhancement)
// ---------------------------------------------
async function updateBooking(rowIndex, { name, phone, service, appointment }) {
  try {
    const values = [
      [name, phone, service, appointment, new Date().toISOString()],
    ];
    const range = `${DEFAULT_SHEET_NAME}!A${rowIndex}:E${rowIndex}`;
    console.log(`✏️ DEBUG => Updating booking at row ${rowIndex}:`, values);

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
// 📖 Get all bookings from Google Sheets (for dashboard)
// ---------------------------------------------
async function getAllBookings() {
  try {
    console.log(
      `📥 DEBUG => Fetching all bookings from "${DEFAULT_SHEET_NAME}"`
    );
    const range = `${DEFAULT_SHEET_NAME}!A:E`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    const rows = response.data.values || [];
    console.log(`📊 DEBUG => Retrieved ${rows.length} rows from Google Sheets`);

    if (rows.length === 0) return [];

    // Convert rows to structured JSON objects
    const bookings = rows.map(
      ([name, phone, service, appointment, timestamp]) => ({
        name: name || "",
        phone: phone || "",
        service: service || "",
        appointment: appointment || "",
        time: timestamp || "",
      })
    );

    return bookings;
  } catch (err) {
    console.error(
      "❌ DEBUG => Error fetching bookings:",
      err.response?.data || err.message
    );
    return [];
  }
}

// ---------------------------------------------
// 🧠 Validate if Google Sheet connection works
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

// =============================================
// 🗑️ NEW DELETION FUNCTIONS
// =============================================

/**
 * Get bookings by phone number
 */
async function getBookingsByPhone(phone) {
  try {
    console.log(`🔍 DEBUG => Fetching bookings for phone: ${phone}`);

    const range = `${DEFAULT_SHEET_NAME}!A:E`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    const rows = response.data.values || [];
    console.log(`📊 DEBUG => Total rows in sheet: ${rows.length}`);

    if (rows.length === 0) {
      console.log("⚠️ DEBUG => Sheet is empty");
      return [];
    }

    // Check if first row is header
    const hasHeader = rows[0][0] === "Name" || rows[0][0] === "الاسم";
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const matchingBookings = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      // Column structure: [Name, Phone, Service, Appointment, Timestamp]
      const name = row[0] || "";
      const rowPhone = row[1] || "";
      const service = row[2] || "";
      const appointment = row[3] || "";
      const timestamp = row[4] || "";

      // Normalize phone numbers for comparison
      const normalizedRowPhone = rowPhone.toString().trim();
      const normalizedSearchPhone = phone.toString().trim();

      console.log(
        `🔍 DEBUG => Row ${
          i + 1
        }: Comparing "${normalizedRowPhone}" with "${normalizedSearchPhone}"`
      );

      if (normalizedRowPhone === normalizedSearchPhone) {
        // Calculate actual row number (accounting for header and 1-indexing)
        const actualRowNumber = hasHeader ? i + 2 : i + 1;

        matchingBookings.push({
          id: `row_${actualRowNumber}`,
          name: name,
          phone: rowPhone,
          service: service,
          appointment: appointment,
          timestamp: timestamp,
          rowIndex: actualRowNumber,
        });

        console.log(`✅ DEBUG => Match found at row ${actualRowNumber}`);
      }
    }

    console.log(
      `✅ DEBUG => Found ${matchingBookings.length} bookings for ${phone}`
    );
    return matchingBookings;
  } catch (err) {
    console.error(
      "❌ DEBUG => Error fetching bookings by phone:",
      err.response?.data || err.message
    );
    return [];
  }
}

/**
 * Delete booking by row number
 */
async function deleteBookingById(bookingId) {
  try {
    console.log(`🗑️ DEBUG => Deleting booking: ${bookingId}`);

    // Extract row number from ID (format: row_5)
    const rowNumber = parseInt(bookingId.replace("row_", ""));

    if (!rowNumber || rowNumber <= 0) {
      console.log("❌ DEBUG => Invalid booking ID format");
      return false;
    }

    console.log(`🎯 DEBUG => Deleting row ${rowNumber}`);

    // Get sheet metadata to find sheet ID
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const sheetId = meta.data.sheets[0].properties.sheetId;
    console.log(`📋 DEBUG => Using sheet ID: ${sheetId}`);

    // Delete the row using batchUpdate
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: "ROWS",
                startIndex: rowNumber - 1, // 0-indexed
                endIndex: rowNumber, // exclusive
              },
            },
          },
        ],
      },
    });

    console.log(`✅ DEBUG => Successfully deleted booking at row ${rowNumber}`);
    return true;
  } catch (err) {
    console.error(
      "❌ DEBUG => Error deleting booking:",
      err.response?.data || err.message
    );
    return false;
  }
}

// ✅ Export all Google Sheets functions
module.exports = {
  detectSheetName,
  saveBooking,
  updateBooking,
  getAllBookings,
  testGoogleConnection,

  // New deletion functions
  getBookingsByPhone,
  deleteBookingById,
};
