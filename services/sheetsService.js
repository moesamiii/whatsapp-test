const {
  sheets,
  DEFAULT_SHEET_NAME,
  SPREADSHEET_ID,
} = require("../config/googleConfig");

async function saveBooking({ name, phone, service, appointment }) {
  const values = [
    [name, phone, service, appointment, new Date().toISOString()],
  ];
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${DEFAULT_SHEET_NAME}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

module.exports = { saveBooking };
