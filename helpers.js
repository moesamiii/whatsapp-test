// ============================================================================
// 📦 helpers.js — FULL MERGED + CLEANED VERSION
// ============================================================================

const axios = require("axios");
const { google } = require("googleapis");
const { askAI, validateNameWithAI } = require("./aiHelper");

// ---------------------------------------------
// 🔧 Environment variables
// ---------------------------------------------
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

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

    console.log("📋 DEBUG => Sheets found:", names);
    console.log("✅ DEBUG => Using sheet:", DEFAULT_SHEET_NAME);
  } catch (err) {
    console.error("❌ DEBUG => Error detecting sheets:", err.message);
  }
}

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
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ DEBUG => WhatsApp message sent");
  } catch (err) {
    console.error("❌ ERROR sending WhatsApp message:", err.message);
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

    console.log("✅ Appointment buttons sent");
  } catch (err) {
    console.error("❌ ERROR:", err.message);
  }
}

// ---------------------------------------------
// 💊 Service buttons (OLD VERSION)
// ---------------------------------------------
async function sendServiceButtons(to) {
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
  } catch (err) {
    console.error("❌ ERROR sending service buttons:", err.message);
  }
}

// ---------------------------------------------
// 💊 New service list dropdown
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
                  {
                    id: "service_فحص_عام",
                    title: "فحص عام",
                    description: "فحص شامل للأسنان",
                  },
                  {
                    id: "service_تنظيف_الأسنان",
                    title: "تنظيف الأسنان",
                    description: "إزالة الجير والتصبغات",
                  },
                  {
                    id: "service_تبييض_الأسنان",
                    title: "تبييض الأسنان",
                    description: "تبييض بالليزر",
                  },
                  {
                    id: "service_حشو_الأسنان",
                    title: "حشو الأسنان",
                    description: "علاج التسوس",
                  },
                ],
              },
              {
                title: "الخدمات المتقدمة",
                rows: [
                  {
                    id: "service_علاج_الجذور",
                    title: "علاج الجذور",
                    description: "علاج العصب",
                  },
                  {
                    id: "service_تركيب_التركيبات",
                    title: "تركيب التركيبات",
                    description: "تيجان وجسور",
                  },
                  {
                    id: "service_تقويم_الأسنان",
                    title: "تقويم الأسنان",
                    description: "تنظيم الأسنان",
                  },
                  {
                    id: "service_خلع_الأسنان",
                    title: "خلع الأسنان",
                    description: "خلع بسيط أو جراحي",
                  },
                ],
              },
              {
                title: "خدمات التجميل",
                rows: [
                  {
                    id: "service_الفينير",
                    title: "الفينير",
                    description: "قشور تجميلية",
                  },
                  {
                    id: "service_زراعة_الأسنان",
                    title: "زراعة الأسنان",
                    description: "زراعة الأسنان",
                  },
                  {
                    id: "service_ابتسامة_هوليود",
                    title: "ابتسامة هوليود",
                    description: "تصميم الابتسامة",
                  },
                  {
                    id: "service_خدمة_أخرى",
                    title: "خدمة أخرى",
                    description: "إن لم تجد خدمتك",
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
    console.error("❌ ERROR sending service list:", err.message);
    await sendServiceButtons(to);
  }
}

// ---------------------------------------------
// 🧾 Save booking
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

    console.log("✅ Booking saved");
  } catch (err) {
    console.error("❌ ERROR saving booking:", err.message);
  }
}

// ---------------------------------------------
// ✏️ Update Booking
// ---------------------------------------------
async function updateBooking(rowIndex, booking) {
  try {
    const values = [
      [
        booking.name,
        booking.phone,
        booking.service,
        booking.appointment,
        new Date().toISOString(),
      ],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A${rowIndex}:E${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    console.log("✅ Booking updated");
  } catch (err) {
    console.error("❌ ERROR updating booking:", err.message);
  }
}

// ---------------------------------------------
// 📖 Get all bookings
// ---------------------------------------------
async function getAllBookings() {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:E`,
    });

    return (response.data.values || []).map(
      ([name, phone, service, appointment, timestamp]) => ({
        name,
        phone,
        service,
        appointment,
        time: timestamp,
      })
    );
  } catch (err) {
    console.error("❌ ERROR loading all bookings:", err.message);
    return [];
  }
}

// ============================================================================
// 📌 NEW MERGED BOOKING MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Fetch all bookings for a phone number
 */
async function getBookingsByPhone(phone) {
  try {
    const response = await axios.get(GOOGLE_SHEET_URL, {
      params: { action: "getByPhone", phone },
    });

    return response.data?.bookings || [];
  } catch (err) {
    console.error("❌ Error fetching phone bookings:", err.message);
    throw err;
  }
}

/**
 * Delete a booking
 */
async function deleteBookingById(bookingId) {
  try {
    const response = await axios.post(GOOGLE_SHEET_URL, {
      action: "delete",
      bookingId,
    });

    return response.data?.success === true;
  } catch (err) {
    console.error("❌ Error deleting booking:", err.message);
    throw err;
  }
}

/**
 * Send interactive list of bookings for deletion
 */
async function sendBookingsList(to, bookings) {
  try {
    if (!bookings.length) {
      await sendTextMessage(to, "❌ لم يتم العثور على حجوزات.");
      return;
    }

    await sendTextMessage(
      to,
      `📋 وجدنا ${bookings.length} حجز/حجوزات:\n\nاختر الحجز الذي ترغب بحذفه 👇`
    );

    await new Promise((r) => setTimeout(r, 500));

    const rows = bookings.slice(0, 10).map((b, i) => ({
      id: `delete_${b.id || i}`,
      title: `${b.name}`,
      description: `📅 ${b.appointment} | 💊 ${b.service}`.substring(0, 72),
    }));

    await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          header: { type: "text", text: "حجوزاتك 📋" },
          body: { text: "اختر الحجز الذي تريد حذفه:" },
          footer: { text: "عيادة ابتسامة الطبية" },
          action: {
            button: "عرض الحجوزات",
            sections: [{ title: "حجوزاتك", rows }],
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

    // Send "keep bookings" button
    setTimeout(async () => {
      await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: "أو إذا غيّرت رأيك:" },
            action: {
              buttons: [
                {
                  type: "reply",
                  reply: { id: "keep_booking", title: "إبقاء حجوزاتي ✅" },
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
    }, 800);
  } catch (err) {
    console.error("❌ Error sending booking list:", err.message);
    throw err;
  }
}

// ============================================================================
// 📤 EXPORT EVERYTHING
// ============================================================================
module.exports = {
  askAI,
  validateNameWithAI,
  detectSheetName,

  sendTextMessage,
  sendAppointmentButtons,
  sendServiceButtons,
  sendServiceList,
  sendAppointmentOptions: sendAppointmentButtons,

  saveBooking,
  updateBooking,
  getAllBookings,

  // NEW
  getBookingsByPhone,
  deleteBookingById,
  sendBookingsList,
};
