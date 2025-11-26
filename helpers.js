// ============================================================================
// 📦 helpers.js — FULL VERSION WITH SUPABASE INTEGRATION
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

// 🆕 Supabase Configuration
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://ylsbmxedhycjqaorjkvm.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2JteGVkaHljanFhb3Jqa3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTk5NTUsImV4cCI6MjA3NjM5NTk1NX0.W61xOww2neu6RA4yCJUob66p4OfYcgLSVw3m3yttz1E";

// Initialize Supabase client with error handling
let supabase;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("🟢 Supabase client initialized successfully");
} catch (err) {
  console.error("❌ Failed to initialize Supabase:", err.message);
  console.error(
    "⚠️ Make sure @supabase/supabase-js is installed: npm install @supabase/supabase-js"
  );
}

// ---------------------------------------------
// 🧠 Google Sheets setup (kept for backward compatibility)
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

// ============================================================================
// 🆕 SUPABASE BOOKING FUNCTIONS (Replaces Google Sheets for booking operations)
// ============================================================================

/**
 * 🧾 Save booking to Supabase
 */
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
          status: "Still", // Default status
        },
      ])
      .select();

    if (error) {
      console.error("❌ ERROR saving booking to Supabase:", error.message);
      throw error;
    }

    console.log("✅ Booking saved to Supabase:", data);
    return data[0];
  } catch (err) {
    console.error("❌ ERROR in saveBooking:", err.message);
    throw err;
  }
}

/**
 * ✏️ Update Booking in Supabase
 */
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

    if (error) {
      console.error("❌ ERROR updating booking:", error.message);
      throw error;
    }

    console.log("✅ Booking updated in Supabase");
    return data[0];
  } catch (err) {
    console.error("❌ ERROR in updateBooking:", err.message);
    throw err;
  }
}

/**
 * 📖 Get all bookings from Supabase
 */
async function getAllBookings() {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .order("time", { ascending: false });

    if (error) {
      console.error("❌ ERROR loading bookings:", error.message);
      throw error;
    }

    console.log(`✅ Loaded ${data.length} bookings from Supabase`);
    return data;
  } catch (err) {
    console.error("❌ ERROR in getAllBookings:", err.message);
    return [];
  }
}

/**
 * 🔍 Fetch all bookings for a specific phone number from Supabase
 * Handles multiple phone formats (07X, 9627X, +9627X)
 */
async function getBookingsByPhone(phone) {
  try {
    console.log(`🔍 Searching bookings for phone: ${phone}`);

    // Normalize phone number - remove spaces, +, and leading zeros
    let normalized = phone.replace(/[\s\+\-]/g, "");

    // Generate all possible formats
    const phoneVariants = [
      normalized, // Original
      normalized.replace(/^962/, "0"), // 9627XXXXXXXX -> 07XXXXXXXX
      normalized.replace(/^0/, "962"), // 07XXXXXXXX -> 9627XXXXXXXX
      `+${normalized}`, // +9627XXXXXXXX
      normalized.replace(/^00/, ""), // 009627X -> 9627X
    ];

    console.log(`🔍 Trying phone variants:`, phoneVariants);

    // Search for any of these formats
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .in("phone", phoneVariants)
      .order("time", { ascending: false });

    if (error) {
      console.error(
        "❌ Error fetching phone bookings from Supabase:",
        error.message
      );
      throw error;
    }

    console.log(`✅ Found ${data?.length || 0} booking(s) for phone ${phone}`);
    return data || [];
  } catch (err) {
    console.error("❌ Error in getBookingsByPhone:", err.message);
    throw err;
  }
}

/**
 * 🗑️ Delete a booking from Supabase
 */
async function deleteBookingById(bookingId) {
  try {
    console.log(`🗑️ Attempting to delete booking ID: ${bookingId}`);

    // First, get the booking details for logging
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      console.warn(`⚠️ Booking ${bookingId} not found or already deleted`);
      return false;
    }

    // Log to booking_history before deletion
    const { error: historyError } = await supabase
      .from("booking_history")
      .insert([
        {
          booking_id: bookingId,
          old_status: booking.status || "Still",
          new_status: "Canceled",
          changed_by: "User (WhatsApp)",
        },
      ]);

    if (historyError) {
      console.warn(
        "⚠️ Failed to log deletion to history:",
        historyError.message
      );
    }

    // Update status to "Canceled" instead of hard delete (optional - you can choose hard delete)
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status: "Canceled" })
      .eq("id", bookingId);

    if (updateError) {
      console.error(
        "❌ Error marking booking as canceled:",
        updateError.message
      );
      throw updateError;
    }

    console.log(`✅ Booking ${bookingId} marked as Canceled`);
    return true;

    // Alternative: Hard delete (uncomment if you prefer)
    /*
    const { error: deleteError } = await supabase
      .from("bookings")
      .delete()
      .eq("id", bookingId);

    if (deleteError) {
      console.error("❌ Error deleting booking:", deleteError.message);
      throw deleteError;
    }

    console.log(`✅ Booking ${bookingId} deleted successfully`);
    return true;
    */
  } catch (err) {
    console.error("❌ Error in deleteBookingById:", err.message);
    throw err;
  }
}

/**
 * 📋 Send interactive list of bookings for deletion
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
      id: `delete_${b.id}`,
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

  // Supabase booking functions
  saveBooking,
  updateBooking,
  getAllBookings,
  getBookingsByPhone,
  deleteBookingById,
  sendBookingsList,

  // Export supabase client for advanced usage
  supabase,
};
