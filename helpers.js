// ============================================================================
// 📦 helpers.js — FINAL VERSION (Supabase Primary • Google Sheets Optional Read-Only)
// ============================================================================

const axios = require("axios");
const { google } = require("googleapis");
const { askAI, validateNameWithAI } = require("./aiHelper");
const { createClient } = require("@supabase/supabase-js");

// ---------------------------------------------
// 🔧 Environment variables
// ---------------------------------------------
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();

// ---------------------------------------------
// 🟢 Supabase Configuration
// ---------------------------------------------
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://ylsbmxedhycjqaorjkvm.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2JteGVkaHljanFhb3Jqa3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTk5NTUsImV4cCI6MjA3NjM5NTk1NX0.W61xOww2neu6RA4yCJUob66p4OfYcgLSVw3m3yttz1E";

let supabase;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("🟢 Supabase initialized.");
} catch (err) {
  console.error("❌ Supabase initialization failed:", err.message);
}

// ============================================================================
// 🧠 Google Sheets (READ-ONLY MODE)
// ============================================================================
let creds;
try {
  creds = process.env.GOOGLE_CREDENTIALS
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
    : require("./credentials.json");
  console.log("🟢 Google Sheets credentials loaded.");
} catch (err) {
  console.warn("⚠️ Google Sheets credentials missing (OK for Option C).");
}

const auth = new google.auth.GoogleAuth({
  credentials: creds || {},
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });
let DEFAULT_SHEET_NAME = "Sheet1";

// Only detect sheet if spreadsheet ID is provided
async function detectSheetName() {
  if (!SPREADSHEET_ID) return;
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const names = meta.data.sheets.map((s) => s.properties.title);
    if (names.length > 0) DEFAULT_SHEET_NAME = names[0];
    console.log("📋 Sheets found:", names);
  } catch (err) {
    console.warn("⚠️ Could not load sheet names:", err.message);
  }
}

// ============================================================================
// 💬 WhatsApp Messaging
// ============================================================================
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
    console.log("✉️ WhatsApp text sent.");
  } catch (err) {
    console.error("❌ WhatsApp send error:", err.response?.data || err.message);
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
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
  } catch (err) {
    console.error("❌ Appointment error:", err.message);
  }
}

// Old version fallback
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
      }
    );
  } catch (err) {
    console.error("❌ sendServiceButtons error:", err.message);
  }
}

// New service dropdown
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
                    description: "فحص شامل",
                  },
                  { id: "service_تنظيف_الأسنان", title: "تنظيف الأسنان" },
                  { id: "service_تبييض_الأسنان", title: "تبييض الأسنان" },
                  { id: "service_حشو_الأسنان", title: "حشو الأسنان" },
                ],
              },
              {
                title: "خدمات التجميل",
                rows: [
                  { id: "service_ابتسامة_هوليود", title: "ابتسامة هوليود" },
                  { id: "service_الفينير", title: "الفينير" },
                  { id: "service_زراعة_الأسنان", title: "زراعة الأسنان" },
                ],
              },
            ],
          },
        },
      }
    );
  } catch (err) {
    console.error("❌ serviceList error:", err.message);
    await sendServiceButtons(to);
  }
}

// ============================================================================
// 🆕 SUPABASE BOOKING FUNCTIONS
// ============================================================================

// Save booking
async function saveBooking({ name, phone, service, appointment }) {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .insert([
        {
          name,
          phone,
          service,
          appointment,
          time: new Date().toISOString(),
          status: "Still",
        },
      ])
      .select();

    if (error) throw error;

    return data[0];
  } catch (err) {
    console.error("❌ saveBooking Error:", err.message);
  }
}

// Update existing booking
async function updateBooking(bookingId, booking) {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .update({
        name: booking.name,
        phone: booking.phone,
        service: booking.service,
        appointment: booking.appointment,
        time: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .select();

    if (error) throw error;

    return data[0];
  } catch (err) {
    console.error("❌ updateBooking Error:", err.message);
  }
}

// Get all bookings
async function getAllBookings() {
  try {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .order("time", { ascending: false });

    return data;
  } catch (err) {
    console.error("❌ getAllBookings Error:", err.message);
    return [];
  }
}

// Search bookings by phone
async function getBookingsByPhone(phone) {
  try {
    const normalized = phone.replace(/[^\d]/g, "");

    const variants = [
      normalized,
      normalized.replace(/^962/, "0"),
      normalized.replace(/^0/, "962"),
      `+${normalized}`,
    ];

    const { data } = await supabase
      .from("bookings")
      .select("*")
      .in("phone", variants)
      .order("time", { ascending: false });

    return data || [];
  } catch (err) {
    console.error("❌ getBookingsByPhone Error:", err.message);
    return [];
  }
}

// Delete booking (soft delete)
async function deleteBookingById(bookingId) {
  try {
    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (!booking) return false;

    // Log delete
    await supabase.from("booking_history").insert([
      {
        booking_id: bookingId,
        old_status: booking.status,
        new_status: "Canceled",
        changed_by: "User (WhatsApp)",
      },
    ]);

    // Mark as canceled
    await supabase
      .from("bookings")
      .update({ status: "Canceled" })
      .eq("id", bookingId);

    return true;
  } catch (err) {
    console.error("❌ deleteBookingById Error:", err.message);
    return false;
  }
}

// Send list of bookings for deletion
async function sendBookingsList(to, bookings) {
  try {
    if (!bookings.length) {
      await sendTextMessage(to, "❌ لم يتم العثور على حجوزات.");
      return;
    }

    const rows = bookings.slice(0, 10).map((b) => ({
      id: `delete_${b.id}`,
      title: b.name,
      description: `📅 ${b.appointment} | 💊 ${b.service}`.slice(0, 70),
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
          action: {
            button: "عرض الحجوزات",
            sections: [{ title: "قائمة الحجوزات", rows }],
          },
        },
      }
    );
  } catch (err) {
    console.error("❌ sendBookingsList Error:", err.message);
  }
}

// ============================================================================
// EXPORTS
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
  getBookingsByPhone,
  deleteBookingById,
  sendBookingsList,

  supabase,
};
