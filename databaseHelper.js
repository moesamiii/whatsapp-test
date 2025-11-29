// Fix fetch issue in Vercel
const fetch = require("cross-fetch");
global.fetch = fetch;

/**
 * databaseHelper.js
 */
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function normalizePhone(phone) {
  if (!phone) return "";
  let cleaned = phone.toString().replace(/\D/g, "");
  cleaned = cleaned.replace(/^0+/, "");
  return cleaned;
}

async function findLastBookingByPhone(rawPhone) {
  try {
    const normalized = normalizePhone(rawPhone);
    console.log("📌 Searching for phone:", normalized);

    let { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", normalized)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("❌ Supabase error:", error.message);
      return null;
    }

    if (data?.length) return data[0];

    const raw = rawPhone.toString().replace(/\D/g, "");

    ({ data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", raw)
      .order("created_at", { ascending: false })
      .limit(1));

    if (error) return null;

    return data?.length ? data[0] : null;
  } catch (err) {
    console.error("❌ Unexpected error:", err.message);
    return null;
  }
}

async function updateBookingStatus(id, newStatus) {
  try {
    const { error } = await supabase
      .from("bookings")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      console.error("❌ Supabase update error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("❌ Unexpected error:", err.message);
    return false;
  }
}

module.exports = {
  findLastBookingByPhone,
  updateBookingStatus,
};
