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
    console.log("✅ DEBUG => Message sent successfully to WhatsApp API");
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
// 💊 Service buttons (OLD - keep for compatibility)
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
          type: "button",
          body: { text: "💊 اختر نوع الخدمة المطلوبة:" },
          action: {
            buttons: [
              {
                type: "reply",
                reply: { id: "service_تنظيف", title: "تنظيف الأسنان" },
              },
              {
                type: "reply",
                reply: { id: "service_تبييض", title: "تبييض الأسنان" },
              },
              {
                type: "reply",
                reply: { id: "service_حشو", title: "حشو الأسنان" },
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
// 💊 Service DROPDOWN LIST (NEW - with dropdown)
// ---------------------------------------------
async function sendServiceList(to) {
  console.log(`📤 DEBUG => Sending service dropdown list to ${to}`);
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: {
            type: "text",
            text: "💊 اختر الخدمة المطلوبة",
          },
          body: {
            text: "يرجى اختيار نوع الخدمة من القائمة:",
          },
          action: {
            button: "عرض الخدمات",
            sections: [
              {
                title: "الخدمات الأساسية",
                rows: [
                  {
                    id: "service_فحص_عام",
                    title: "فحص عام",
                    description: "فحص شامل للأسنان والتشخيص",
                  },
                  {
                    id: "service_تنظيف_الأسنان",
                    title: "تنظيف الأسنان",
                    description: "تنظيف وإزالة الجير والتصبغات",
                  },
                  {
                    id: "service_تبييض_الأسنان",
                    title: "تبييض الأسنان",
                    description: "تبييض الأسنان بالليزر أو المواد المبيضة",
                  },
                  {
                    id: "service_حشو_الأسنان",
                    title: "حشو الأسنان",
                    description: "علاج التسوس وحشو الأسنان",
                  },
                ],
              },
              {
                title: "الخدمات المتقدمة",
                rows: [
                  {
                    id: "service_علاج_الجذور",
                    title: "علاج الجذور",
                    description: "علاج قناة الجذر والعصب",
                  },
                  {
                    id: "service_تركيب_التركيبات",
                    title: "تركيب التركيبات",
                    description: "تركيب التيجان والجسور",
                  },
                  {
                    id: "service_تقويم_الأسنان",
                    title: "تقويم الأسنان",
                    description: "علاج اعوجاج الأسنان وتنظيمها",
                  },
                  {
                    id: "service_خلع_الأسنان",
                    title: "خلع الأسنان",
                    description: "خلع الأسنان البسيط أو الجراحي",
                  },
                ],
              },
              {
                title: "خدمات التجميل",
                rows: [
                  {
                    id: "service_الفينير",
                    title: "الفينير",
                    description: "قشور خزفية لتجميل الأسنان الأمامية",
                  },
                  {
                    id: "service_زراعة_الأسنان",
                    title: "زراعة الأسنان",
                    description: "زراعة الأسنان المفقودة",
                  },
                  {
                    id: "service_ابتسامة_هوليود",
                    title: "ابتسامة هوليود",
                    description: "تصميم ابتسامة هوليود تجميلية",
                  },
                  {
                    id: "service_خدمة_أخرى",
                    title: "خدمة أخرى",
                    description: "اختر هذه إذا كانت الخدمة غير موجودة",
                  },
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
    console.log("✅ DEBUG => Service dropdown list sent successfully");
  } catch (err) {
    console.error(
      "❌ DEBUG => Error sending service dropdown list:",
      err.response?.data || err.message
    );
    await sendServiceButtons(to);
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
// ✅ VALID SERVICES LIST
// ---------------------------------------------
const VALID_SERVICES = [
  "فحص عام",
  "تنظيف الأسنان",
  "تبييض الأسنان",
  "حشو الأسنان",
  "علاج الجذور",
  "تركيب التركيبات",
  "تقويم الأسنان",
  "خلع الأسنان",
  "الفينير",
  "زراعة الأسنان",
  "ابتسامة هوليود",
  "خدمة أخرى",
];

// ---------------------------------------------
// ✅ Validate service name
// ---------------------------------------------
function validateServiceName(service) {
  if (!service) return false;
  return VALID_SERVICES.some((s) => s === service.trim());
}

// ---------------------------------------------
// 🧾 Save booking to Google Sheets (with validation)
// ---------------------------------------------
async function saveBooking({ name, phone, service, appointment }) {
  try {
    // ✅ Check if the service is valid
    if (!validateServiceName(service)) {
      console.warn(`⚠️ Invalid service entered: "${service}"`);
      await sendTextMessage(
        phone,
        `❌ عذرًا، الخدمة "${service}" غير موجودة في قائمتنا.\n\nالرجاء اختيار الخدمة الصحيحة من القائمة أدناه 👇`
      );
      await sendServiceList(phone);
      return;
    }

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
  sendServiceList,
  sendAppointmentOptions,
  saveBooking,
  updateBooking,
  getAllBookings,
  testGoogleConnection,
};
