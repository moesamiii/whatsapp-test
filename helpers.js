// helpers.js
const axios = require("axios");
const { google } = require("googleapis");
const { askAI, validateNameWithAI } = require("./aiHelper"); // ✅ Import AI utilities
const { createClient } = require("@supabase/supabase-js"); // 📥 Import Supabase

// ---------------------------------------------
// 🔧 Environment variables
// ---------------------------------------------
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const SPREADSHEET_ID = (process.env.GOOGLE_SHEET_ID || "").trim();
// NOTE: GOOGLE_SHEET_URL is now OBSOLETE since we're using Supabase for the cancellation logic
// const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

// ✅ NEW: Supabase Environment Variables (Must be defined in your actual environment)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Use service key for server-side operations

// ---------------------------------------------
// 🟢 Supabase Client Setup (for Bookings/Cancellations)
// ---------------------------------------------
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

if (!supabase) {
  console.error("❌ DEBUG => Supabase client not initialized. Check ENV vars.");
}

// ---------------------------------------------
// 🧠 Google Sheets setup (for Booking Intake/Archival)
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
    if (!SPREADSHEET_ID) {
      console.warn(
        "⚠️ DEBUG => SPREADSHEET_ID not defined. Skipping sheet name detection."
      );
      return;
    }
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
  // ... (sendTextMessage remains the same)
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
  // ... (sendAppointmentButtons remains the same)
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
  // ... (sendServiceButtons remains the same)
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
  // ... (sendServiceList remains the same)
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
// 🧾 Save booking (STILL USES GOOGLE SHEETS)
// ---------------------------------------------
async function saveBooking({ name, phone, service, appointment }) {
  // ... (Google Sheets save logic remains the same)
  // NOTE: In a real system, you should save to Supabase here too!
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
// ✏️ Update booking
// ---------------------------------------------
async function updateBooking(rowIndex, { name, phone, service, appointment }) {
  // ... (Google Sheets update logic remains the same)
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
// 📖 Get all bookings (dashboard)
// ---------------------------------------------
async function getAllBookings() {
  // ... (Google Sheets getAllBookings logic remains the same)
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
// 🧠 Validate Google Sheet connection
// ---------------------------------------------
async function testGoogleConnection() {
  // ... (testGoogleConnection remains the same)
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

// ============================================================================
// 📌 NEW SECTION — SUPABASE CANCELLATION FUNCTIONS (FIXED)
// ============================================================================

/**
 * Fetch all ACTIVE bookings for a specific phone number from SUPABASE
 * @param {string} phone - The user's phone number
 */
async function getBookingsByPhone(phone) {
  if (!supabase) throw new Error("Supabase client not initialized.");

  // Normalize phone to include the minimum required digits/format for the query
  const normalizedPhone = phone.replace(/[^\d]/g, "");

  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, name, service, appointment")
      .eq("phone", normalizedPhone) // Match the normalized phone number
      .neq("status", "Canceled") // Exclude already canceled bookings
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Supabase returns an array of objects
    return data;
  } catch (err) {
    console.error("❌ Supabase Error fetching bookings:", err.message);
    throw err; // Propagate error back to webhookHandler
  }
}

/**
 * Perform a SOFT DELETE (set status to 'Canceled') for a booking by its ID in SUPABASE
 * @param {string} bookingId - The unique ID of the booking to cancel
 */
async function deleteBookingById(bookingId) {
  if (!supabase) throw new Error("Supabase client not initialized.");

  try {
    // ⚠️ IMPORTANT: We perform an UPDATE (soft delete) to change the status, not a hard DELETE
    const { error } = await supabase
      .from("bookings")
      .update({ status: "Canceled" })
      .eq("id", bookingId);

    if (error) throw error;

    // Log history to booking_history table (optional but highly recommended)
    try {
      await supabase.from("booking_history").insert({
        booking_id: bookingId,
        old_status: "Active/Unknown", // We don't fetch old status here for speed
        new_status: "Canceled",
        changed_by: "System_User_Cancellation",
      });
    } catch (logError) {
      console.warn("⚠️ Failed to log cancellation history:", logError.message);
    }

    return true; // Success
  } catch (err) {
    console.error("❌ Supabase Error canceling booking:", err.message);
    throw err; // Propagate error back to webhookHandler
  }
}

/**
 * Send bookings list to WhatsApp with delete buttons
 * @param {string} to - The user's phone number
 * @param {Array<Object>} bookings - Array of booking objects from getBookingsByPhone
 */
async function sendBookingsList(to, bookings) {
  try {
    if (!bookings || bookings.length === 0) {
      await sendTextMessage(
        to,
        "❌ لم يتم العثور على حجوزات نشطة مرتبطة برقمك."
      );
      return;
    }

    await sendTextMessage(
      to,
      `📋 وجدنا ${bookings.length} حجز/حجوزات نشطة:\n\nاختر الحجز الذي ترغب بإلغائه 👇`
    );

    await new Promise((r) => setTimeout(r, 500));

    // Build rows (Limit to 10 as per WhatsApp API spec)
    const rows = bookings.slice(0, 10).map((b) => ({
      // ✅ b.id is now the Supabase UUID
      id: `delete_${b.id}`,
      title: `${b.name || "غير معروف"}`,
      description: `📅 ${b.appointment || "N/A"} | 💊 ${
        b.service || "N/A"
      }`.substring(0, 72),
    }));

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "إلغاء الحجز 📋" },
        body: { text: "اختر الحجز الذي تريد إلغاءه نهائياً:" },
        footer: { text: "عيادة ابتسامة الطبية" },
        action: {
          button: "عرض الحجوزات",
          sections: [{ title: "حجوزاتك النشطة", rows }],
        },
      },
    };

    // Use current API version (v17.0 is safer unless v21.0 is required)
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Add Keep button
    await new Promise((r) => setTimeout(r, 800));

    const keepPayload = {
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
    };

    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      keepPayload,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error(
      "❌ Error sending bookings list:",
      err.response?.data || err.message
    );
    throw err;
  }
}

// ============================================================================
// 📤 EXPORT EVERYTHING (INCLUDING THE NEW FUNCTIONS)
// ============================================================================
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

  // NEW EXPORTS (NOW USING SUPABASE)
  getBookingsByPhone,
  deleteBookingById,
  sendBookingsList,
};
