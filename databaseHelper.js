/**
 * databaseHelper.js
 *
 * Purpose:
 * - Handle all Supabase database operations
 * - Find booking by phone
 * - Update booking status (including cancellation)
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
// 🔍 1) Find last booking by phone
// ==============================================
async function findLastBookingByPhone(phone) {
  try {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", phone)
      .order("id", { ascending: false }) // newest first
      .limit(1);

    if (error) {
      console.error("❌ Supabase error (find booking):", error.message);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
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
