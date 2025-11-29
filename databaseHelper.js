/**
 * databaseHelper.js (FINAL — NO POLYFILL NEEDED)
 *
 * Handles:
 * - Supabase connection
 * - Normalize phone number
 * - Find booking by phone
 * - Update booking status
 */

const { createClient } = require("@supabase/supabase-js");

// ==============================================
// 🔥 Supabase Connection
// ==============================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ==============================================
// 📌 Normalize phone number
// ==============================================
function normalizePhone(phone) {
  if (!phone) return "";

  let cleaned = phone.toString().replace(/\D/g, ""); // remove non-digits
  cleaned = cleaned.replace(/^0+/, ""); // remove leading zeros

  return cleaned;
}

// ==============================================
// 🔍 1) Find last booking by phone (smart search)
// ==============================================
async function findLastBookingByPhone(rawPhone) {
  try {
    const normalized = normalizePhone(rawPhone);

    console.log("📌 Searching for phone:", normalized);

    // Try EXACT match first
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", normalized)
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      console.error("❌ Supabase error (find booking):", error.message);
      return null;
    }

    if (data && data.length > 0) {
      console.log("✅ Found booking by normalized phone");
      return data[0];
    }

    // Try match original phone
    const raw = rawPhone.toString().replace(/\D/g, "");

    const { data: rawData, error: rawErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", raw)
      .order("id", { ascending: false })
      .limit(1);

    if (rawErr) {
      console.error("❌ Supabase error (fallback):", rawErr.message);
      return null;
    }

    if (rawData && rawData.length > 0) {
      console.log("✅ Found booking by RAW phone");
      return rawData[0];
    }

    console.log("⚠️ No booking found");
    return null;
  } catch (err) {
    console.error(
      "❌ Unexpected error in findLastBookingByPhone:",
      err.message
    );
    return null;
  }
}

// ==============================================
// ✏️ 2) Update booking status
// ==============================================
async function updateBookingStatus(id, newStatus) {
  try {
    const { error } = await supabase
      .from("bookings")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      console.error("❌ Supabase error (update status):", error.message);
      return false;
    }

    console.log(`✅ Booking status updated → ${newStatus}`);
    return true;
  } catch (err) {
    console.error("❌ Unexpected error in updateBookingStatus:", err.message);
    return false;
  }
}

// ==============================================
// EXPORTS
// ==============================================
module.exports = {
  findLastBookingByPhone,
  updateBookingStatus,
};
