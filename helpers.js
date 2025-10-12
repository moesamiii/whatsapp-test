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
  } catch (err) {
    console.error(
      "❌ DEBUG => Error sending appointment buttons:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 💊 Services allowed (VALID LIST)
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
// 💊 Validate typed service
// ---------------------------------------------
function validateServiceInput(input) {
  if (!input) return false;
  const clean = input.trim().toLowerCase();
  return VALID_SERVICES.some((s) => s.toLowerCase().includes(clean));
}

// ---------------------------------------------
// 💊 Service DROPDOWN LIST (NEW)
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
          header: { type: "text", text: "💊 اختر الخدمة المطلوبة" },
          body: { text: "يرجى اختيار نوع الخدمة من القائمة:" },
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
  } catch (err) {
    console.error(
      "❌ DEBUG => Error sending service dropdown list:",
      err.response?.data || err.message
    );
  }
}

// ---------------------------------------------
// 🧾 Save booking (with validation)
// ---------------------------------------------
async function saveBooking({ name, phone, service, appointment }) {
  try {
    // Validate service
    if (!validateServiceInput(service)) {
      console.warn("❌ Invalid service input detected:", service);
      await sendTextMessage(
        phone,
        "❌ هذه الخدمة غير موجودة، يرجى اختيار من القائمة أدناه:"
      );
      await sendServiceList(phone);
      return; // ❌ Stop booking
    }

    // Append booking
    const values = [
      [name, phone, service, appointment, new Date().toISOString()],
    ];
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    console.log(
      "✅ Booking saved successfully:",
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
// 📖 Get all bookings (for dashboard)
// ---------------------------------------------
async function getAllBookings() {
  try {
    const range = `${DEFAULT_SHEET_NAME}!A:E`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
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
    console.error(
      "❌ DEBUG => Error fetching bookings:",
      err.response?.data || err.message
    );
    return [];
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
  sendServiceList,
  saveBooking,
  getAllBookings,
};
