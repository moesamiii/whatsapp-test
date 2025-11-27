// sheetsHelper.js
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
      [name, phone, service, appointment, new Date().toISOString(), "new"],
    ];
    console.log("📤 DEBUG => Data to send to Google Sheets:", values);
    console.log(
      `🔍 DEBUG => Appending to sheet "${DEFAULT_SHEET_NAME}" in spreadsheet "${SPREADSHEET_ID}"`
    );

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:F`,
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
// 🔍 Find booking by phone number (NEW)
// ---------------------------------------------
async function findBookingByPhone(phone) {
  try {
    console.log(`🔍 DEBUG => Searching for booking with phone: ${phone}`);
    const range = `${DEFAULT_SHEET_NAME}!A:F`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      console.log("📊 DEBUG => No bookings found in sheet");
      return null;
    }

    // Search for the phone number (column B, index 1)
    // Find the most recent booking with this phone number that is not already cancelled
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const rowPhone = row[1]; // Column B (phone)
      const rowStatus = row[5] || "new"; // Column F (status)

      if (
        rowPhone === phone &&
        rowStatus !== "cancelled" &&
        rowStatus !== "Cancelled"
      ) {
        console.log(`✅ DEBUG => Found booking at row ${i + 1}:`, row);
        return {
          rowIndex: i + 1, // Google Sheets rows start at 1
          name: row[0] || "",
          phone: rowPhone || "",
          service: row[2] || "",
          appointment: row[3] || "",
          time: row[4] || "",
          status: rowStatus,
        };
      }
    }

    console.log("❌ DEBUG => No active booking found for phone:", phone);
    return null;
  } catch (err) {
    console.error(
      "❌ DEBUG => Error finding booking:",
      err.response?.data || err.message
    );
    return null;
  }
}

// ---------------------------------------------
// ❌ Cancel booking by phone number (NEW)
// ---------------------------------------------
async function cancelBookingByPhone(phone) {
  try {
    console.log(`🔍 DEBUG => Attempting to cancel booking for phone: ${phone}`);

    const booking = await findBookingByPhone(phone);

    if (!booking) {
      console.log("❌ DEBUG => No active booking found to cancel");
      return { success: false, message: "no_booking_found" };
    }

    // Update the status column (F) to "cancelled"
    const range = `${DEFAULT_SHEET_NAME}!F${booking.rowIndex}`;
    console.log(`✏️ DEBUG => Updating status at ${range} to "cancelled"`);

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["cancelled"]],
      },
    });

    console.log("✅ DEBUG => Booking cancelled successfully");
    return {
      success: true,
      booking: {
        name: booking.name,
        phone: booking.phone,
        service: booking.service,
        appointment: booking.appointment,
      },
    };
  } catch (err) {
    console.error(
      "❌ DEBUG => Error cancelling booking:",
      err.response?.data || err.message
    );
    return { success: false, message: "error" };
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
    const range = `${DEFAULT_SHEET_NAME}!A:F`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    const rows = response.data.values || [];
    console.log(`📊 DEBUG => Retrieved ${rows.length} rows from Google Sheets`);

    if (rows.length === 0) return [];

    // Convert rows to structured JSON objects
    const bookings = rows.map(
      ([name, phone, service, appointment, timestamp, status]) => ({
        name: name || "",
        phone: phone || "",
        service: service || "",
        appointment: appointment || "",
        time: timestamp || "",
        status: status || "new",
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

// ✅ Export all Google Sheets functions
module.exports = {
  detectSheetName,
  saveBooking,
  updateBooking,
  getAllBookings,
  testGoogleConnection,
  findBookingByPhone, // NEW
  cancelBookingByPhone, // NEW
};
