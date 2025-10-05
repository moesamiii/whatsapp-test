const { google } = require("googleapis");
const creds = process.env.GOOGLE_CREDENTIALS
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
  : require("../credentials.json");

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const DEFAULT_SHEET_NAME = "Sheet1";

module.exports = { sheets, SPREADSHEET_ID, DEFAULT_SHEET_NAME };
