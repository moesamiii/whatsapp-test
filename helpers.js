/**
 * FIXED helpers.js - Unified Google Sheets Integration
 * Uses Google Sheets API for ALL operations (save, fetch, delete)
 * No more Google Apps Script conflicts!
 */

const axios = require("axios");
const { google } = require("googleapis");
const { askAI, validateNameWithAI } = require("./aiHelper");

// ---------------------------------------------
// 🚀 SUPABASE CLIENT (we add this now only)
// ---------------------------------------------
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---------------------------------------------
// 🚀 SUPABASE BOOKING FUNCTIONS (NEW)
// ---------------------------------------------

// Save booking in Supabase
async function saveBookingSupabase({ name, phone, service, appointment }) {
  try {
    const timestamp = new Date().toISOString();
    const booking = { name, phone, service, appointment, timestamp };

    const { data, error } = await supabase
      .from("bookings")
      .insert([booking])
      .select();

    if (error) throw error;

    console.log("🟢 Supabase => Booking saved:", data[0]);
    return data[0];
  } catch (err) {
    console.error("❌ Supabase saveBooking error:", err.message);
    return null;
  }
}

// Get bookings by phone from Supabase
async function getBookingsByPhoneSupabase(phone) {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", phone);

    if (error) throw error;

    console.log(`🟢 Supabase => Found ${data.length} bookings`);
    return data;
  } catch (err) {
    console.error("❌ Supabase fetch error:", err.message);
    return [];
  }
}

// Delete booking by ID (UUID or number)
async function deleteBookingByIdSupabase(id) {
  try {
    const { error } = await supabase.from("bookings").delete().eq("id", id);

    if (error) throw error;

    console.log("🟢 Supabase => Booking deleted:", id);
    return true;
  } catch (err) {
    console.error("❌ Supabase delete error:", err.message);
    return false;
  }
}

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
// 🗓️ Appointment Buttons
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
// 💊 Service buttons (OLD)
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
                    description: "تبييض الأسنان بالليزر",
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
                    description: "علاج اعوجاج الأسنان",
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
                    description: "قشور خزفية للتجميل",
                  },
                  {
                    id: "service_زراعة_الأسنان",
                    title: "زراعة الأسنان",
                    description: "زراعة الأسنان المفقودة",
                  },
                  {
                    id: "service_ابتسامة_هوليود",
                    title: "ابتسامة هوليود",
                    description: "تصميم ابتسامة تجميلية",
                  },
                  {
                    id: "service_خدمة_أخرى",
                    title: "خدمة أخرى",
                    description: "اختر إذا كانت الخدمة غير موجودة",
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
// 🗓️ Wrapper
// ---------------------------------------------
async function sendAppointmentOptions(to) {
  console.log(`📤 DEBUG => Sending appointment options to ${to}`);
  await sendAppointmentButtons(to);
}

// ---------------------------------------------
// 🆔 Generate unique booking ID
// ---------------------------------------------
function generateBookingId() {
  return `BK${Date.now()}${Math.random().toString(36).substr(2, 4)}`;
}

// ---------------------------------------------
// 🧾 Save booking to Google Sheets (WITH ID)
// ---------------------------------------------
async function saveBooking({ name, phone, service, appointment }) {
  try {
    const bookingId = generateBookingId();
    const timestamp = new Date().toISOString();

    const values = [[bookingId, name, phone, service, appointment, timestamp]];

    console.log("📤 DEBUG => Data to send to Google Sheets:", values);

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DEFAULT_SHEET_NAME}!A:F`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    console.log(
      "✅ DEBUG => Booking saved with ID:",
      bookingId,
      "Status:",
      result.statusText || result.status
    );

    return bookingId;
  } catch (err) {
    console.error(
      "❌ DEBUG => Google Sheets append error:",
      err.response?.data || err.message
    );
    throw err;
  }
}

// ---------------------------------------------
// 📝 Update booking
// ---------------------------------------------
async function updateBooking(rowIndex, { name, phone, service, appointment }) {
  try {
    const timestamp = new Date().toISOString();
    const values = [[name, phone, service, appointment, timestamp]];
    const range = `${DEFAULT_SHEET_NAME}!B${rowIndex}:F${rowIndex}`;
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
// 📥 Get all bookings (Dashboard)
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

    // Skip header row if it exists
    const dataRows = rows[0][0] === "ID" ? rows.slice(1) : rows;

    return dataRows.map(
      ([id, name, phone, service, appointment, timestamp]) => ({
        id: id || "",
        name: name || "",
        phone: phone || "",
        service: service || "",
        appointment: appointment || "",
        time: timestamp || "",
      })
    );
  } catch (err) {
    console.error(
      "❌ DEBUG => Error fetching bookings:",
      err.response?.data || err.message
    );
    return [];
  }
}

// ---------------------------------------------
// 🔍 Get bookings by phone number
// ---------------------------------------------
async function getBookingsByPhone(phone) {
  try {
    console.log(`🔍 DEBUG => Fetching bookings for phone: ${phone}`);

    const range = `${DEFAULT_SHEET_NAME}!A:F`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    const rows = response.data.values || [];
    console.log(`📊 DEBUG => Total rows in sheet: ${rows.length}`);

    if (rows.length === 0) {
      console.log("⚠️ DEBUG => No data in sheet");
      return [];
    }

    // Skip header row if exists
    const dataRows = rows[0][0] === "ID" ? rows.slice(1) : rows;

    // Filter bookings by phone number
    const matchingBookings = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const [id, name, rowPhone, service, appointment, timestamp] = row;

      // Normalize both phone numbers for comparison
      const normalizedRowPhone = (rowPhone || "").toString().trim();
      const normalizedSearchPhone = phone.toString().trim();

      console.log(
        `🔍 DEBUG => Comparing: "${normalizedRowPhone}" with "${normalizedSearchPhone}"`
      );

      if (normalizedRowPhone === normalizedSearchPhone) {
        matchingBookings.push({
          id: id || `row_${i + 2}`, // +2 because of header and 1-indexing
          name: name || "غير معروف",
          phone: rowPhone || "",
          service: service || "N/A",
          appointment: appointment || "N/A",
          timestamp: timestamp || "",
          rowIndex: i + 2, // Actual row number in sheet
        });
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
    throw err;
  }
}

// ---------------------------------------------
// 🗑️ Delete booking by ID
// ---------------------------------------------
async function deleteBookingById(bookingId) {
  try {
    console.log(`🗑️ DEBUG => Deleting booking with ID: ${bookingId}`);

    const range = `${DEFAULT_SHEET_NAME}!A:F`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    const rows = response.data.values || [];
    console.log(`📊 DEBUG => Total rows: ${rows.length}`);

    if (rows.length === 0) {
      console.log("⚠️ DEBUG => No data in sheet");
      return false;
    }

    // Find the row with matching booking ID
    let rowToDelete = -1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowId = (row[0] || "").toString().trim();
      const searchId = bookingId.toString().trim();

      console.log(
        `🔍 DEBUG => Row ${i + 1}: Comparing "${rowId}" with "${searchId}"`
      );

      if (rowId === searchId) {
        rowToDelete = i;
        break;
      }
    }

    if (rowToDelete === -1) {
      console.log(`⚠️ DEBUG => Booking ID ${bookingId} not found`);
      return false;
    }

    console.log(
      `🎯 DEBUG => Found booking at row ${rowToDelete + 1}, deleting...`
    );

    // Delete the row using batchUpdate
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0, // Usually the first sheet is ID 0
                dimension: "ROWS",
                startIndex: rowToDelete,
                endIndex: rowToDelete + 1,
              },
            },
          },
        ],
      },
    });

    console.log(`✅ DEBUG => Successfully deleted booking ${bookingId}`);
    return true;
  } catch (err) {
    console.error(
      "❌ DEBUG => Error deleting booking:",
      err.response?.data || err.message
    );
    throw err;
  }
}

// ---------------------------------------------
// 📋 Send bookings list to WhatsApp
// ---------------------------------------------
async function sendBookingsList(to, bookings) {
  try {
    if (!bookings || bookings.length === 0) {
      await sendTextMessage(
        to,
        "❌ لم يتم العثور على حجوزات مسجلة بهذا الرقم."
      );
      return;
    }

    console.log(`📋 DEBUG => Sending ${bookings.length} bookings to ${to}`);

    await sendTextMessage(
      to,
      `📋 وجدنا *${bookings.length}* حجز/حجوزات مسجلة:\n\nاختر الحجز الذي ترغب بحذفه 👇`
    );

    await new Promise((r) => setTimeout(r, 500));

    // Prepare list rows (max 10 items for WhatsApp)
    const rows = bookings.slice(0, 10).map((booking) => {
      const title = (booking.name || "غير معروف").substring(0, 24); // WhatsApp limit
      const description = `📅 ${booking.appointment || "N/A"} | 💊 ${
        booking.service || "N/A"
      }`.substring(0, 72); // WhatsApp limit

      return {
        id: `delete_${booking.id}`,
        title: title,
        description: description,
      };
    });

    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "حجوزاتك 📋" },
        body: { text: "اختر الحجز الذي تريد حذفه من القائمة:" },
        footer: { text: "عيادة ابتسامة الطبية" },
        action: {
          button: "عرض الحجوزات",
          sections: [
            {
              title: "حجوزاتك",
              rows: rows,
            },
          ],
        },
      },
    };

    await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ DEBUG => Bookings list sent successfully");

    // Send "Keep booking" option
    await new Promise((r) => setTimeout(r, 1000));

    const keepPayload = {
      messaging_product: "whatsapp",
      to: to,
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
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      keepPayload,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ DEBUG => Keep booking button sent");
  } catch (err) {
    console.error(
      "❌ DEBUG => Error sending bookings list:",
      err.response?.data || err.message
    );
    throw err;
  }
}

// ---------------------------------------------
// 🧪 Test Google Sheets Connection
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

/**
 * Get bookings by phone - uses existing Google Sheets API
 */
async function getBookingsByPhone(phone) {
  try {
    console.log(`🔍 Fetching bookings for phone: ${phone}`);

    // Use existing sheets API connection
    const range = `${DEFAULT_SHEET_NAME}!A:F`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    const rows = response.data.values || [];
    console.log(`📊 Total rows in sheet: ${rows.length}`);

    if (rows.length === 0) {
      return [];
    }

    // Skip header row if exists
    const dataRows =
      rows.length > 0 && rows[0][0] === "Name" ? rows.slice(1) : rows;

    // Find bookings with matching phone
    const matchingBookings = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];

      // Adjust these indices based on YOUR column order
      // Current assumption: [Name, Phone, Service, Appointment, Timestamp]
      const name = row[0] || "";
      const rowPhone = row[1] || "";
      const service = row[2] || "";
      const appointment = row[3] || "";
      const timestamp = row[4] || "";

      // Normalize phone numbers for comparison
      const normalizedRowPhone = rowPhone.toString().trim();
      const normalizedSearchPhone = phone.toString().trim();

      if (normalizedRowPhone === normalizedSearchPhone) {
        const actualRowNumber =
          rows.length > 0 && rows[0][0] === "Name" ? i + 2 : i + 1;

        matchingBookings.push({
          id: `row_${actualRowNumber}`,
          name: name,
          phone: rowPhone,
          service: service,
          appointment: appointment,
          timestamp: timestamp,
          rowIndex: actualRowNumber,
        });
      }
    }

    console.log(`✅ Found ${matchingBookings.length} bookings for ${phone}`);
    return matchingBookings;
  } catch (err) {
    console.error(
      "❌ Error fetching bookings:",
      err.response?.data || err.message
    );
    return [];
  }
}

/**
 * Delete booking by row number - uses existing Google Sheets API
 */
async function deleteBookingById(bookingId) {
  try {
    console.log(`🗑️ Deleting booking: ${bookingId}`);

    // Extract row number from ID (format: row_5)
    const rowNumber = parseInt(bookingId.replace("row_", ""));

    if (!rowNumber || rowNumber <= 0) {
      console.log("❌ Invalid booking ID");
      return false;
    }

    console.log(`🎯 Deleting row ${rowNumber}`);

    // Get sheet ID (usually 0 for first sheet)
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const sheetId = meta.data.sheets[0].properties.sheetId;

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

    console.log(`✅ Successfully deleted booking at row ${rowNumber}`);
    return true;
  } catch (err) {
    console.error(
      "❌ Error deleting booking:",
      err.response?.data || err.message
    );
    return false;
  }
}

/**
 * Send bookings list to WhatsApp
 */
async function sendBookingsList(to, bookings) {
  try {
    if (!bookings || bookings.length === 0) {
      await sendTextMessage(
        to,
        "❌ لم يتم العثور على حجوزات مسجلة بهذا الرقم."
      );
      return;
    }

    console.log(`📋 Sending ${bookings.length} bookings to ${to}`);

    await sendTextMessage(
      to,
      `📋 وجدنا *${bookings.length}* حجز/حجوزات:\n\nاختر الحجز الذي تريد حذفه 👇`
    );

    await new Promise((r) => setTimeout(r, 500));

    // Prepare list (max 10 items for WhatsApp)
    const rows = bookings.slice(0, 10).map((booking) => {
      const title = (booking.name || "غير معروف").substring(0, 24);
      const description = `📅 ${booking.appointment || "N/A"} | 💊 ${
        booking.service || "N/A"
      }`.substring(0, 72);

      return {
        id: `delete_${booking.id}`,
        title: title,
        description: description,
      };
    });

    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "حجوزاتك 📋" },
        body: { text: "اختر الحجز الذي تريد حذفه من القائمة:" },
        footer: { text: "عيادة ابتسامة الطبية" },
        action: {
          button: "عرض الحجوزات",
          sections: [{ title: "حجوزاتك", rows: rows }],
        },
      },
    };

    await axios.post(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Bookings list sent");

    // Send "Keep booking" option
    await new Promise((r) => setTimeout(r, 1000));

    const keepPayload = {
      messaging_product: "whatsapp",
      to: to,
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
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
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
  }
}

function isDeleteBookingRequest(text = "") {
  const keywords = [
    "delete",
    "remove",
    "cancel",
    "حذف",
    "احذف",
    "مسح",
    "امسح",
    "الغاء",
    "إلغاء",
    "الغي",
    "حذف الحجز",
    "إلغاء الحجز",
    "ابي احذف",
    "ودي احذف",
  ];
  return keywords.some((k) => text.toLowerCase().includes(k));
}

function isCancelRequest(text = "") {
  const keywords = ["cancel", "الغاء", "إلغاء", "الغي", "كانسل"];
  return keywords.some((k) => text.toLowerCase().includes(k));
}

/* ===========================================================
   ==================== EXPORT EVERYTHING =====================
   ===========================================================
*/

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

  // Booking management
  getBookingsByPhone,
  deleteBookingById,
  sendBookingsList,

  isDeleteBookingRequest,
  isCancelRequest,
};
