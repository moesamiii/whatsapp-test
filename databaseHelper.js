/**
 * databaseHelper.js (FINAL FIXED FOR VERCEL)
 *
 * Supports:
 * - Supabase connection
 * - Fetch polyfill for Vercel
 * - Phone normalization
 * - Find latest booking by phone
 * - Update booking status
 */

// ===========================
// 🔥 REQUIRED FIX FOR VERCEL
// ===========================
require("cross-fetch/polyfill");
// ⬆ هذا السطر يحل خطأ (fetch failed)
// ويجب أن يكون أول سطر في الملف

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

    console.log("📌 Normalized phone:", normalized);
    console.log("🔍 Searching for phone:", normalized);

    // Try EXACT match first
    let { data, error } = await supabase
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

    // Try match original phone (backup)
    const raw = rawPhone.toString().replace(/\D/g, "");

    console.log("📌 Trying RAW phone:", raw);

    ({ data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", raw)
      .order("id", { ascending: false })
      .limit(1));

    if (error) {
      console.error("❌ Supabase error (fallback):", error.message);
      return null;
    }

    if (data && data.length > 0) {
      console.log("✅ Found booking by RAW phone");
      return data[0];
    }

    console.log("⚠️ No booking found in database");
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
