console.log("🔑 SUPABASE_URL:", process.env.SUPABASE_URL);
console.log(
  "🔑 SUPABASE_SERVICE_KEY:",
  process.env.SUPABASE_SERVICE_KEY ? "Loaded" : "❌ NOT LOADED"
);

const { createClient } = require("@supabase/supabase-js");

// ==============================================
//  Create Supabase inside a function (fix Vercel)
// ==============================================
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// ==============================================
// Normalize phone
// ==============================================
function normalizePhone(phone) {
  if (!phone) return "";
  let cleaned = phone.toString().replace(/\D/g, "");
  cleaned = cleaned.replace(/^0+/, "");
  return cleaned;
}

// ==============================================
// Find last booking by phone
// ==============================================
async function findLastBookingByPhone(rawPhone) {
  try {
    const supabase = getSupabase(); // <── FIX 🔥🔥🔥

    const normalized = normalizePhone(rawPhone);
    console.log("📌 Searching for phone:", normalized);

    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", normalized)
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      console.error("❌ Supabase error:", error.message);
      return null;
    }

    if (data && data.length > 0) return data[0];

    // fallback
    const raw = rawPhone.toString().replace(/\D/g, "");

    const { data: rawData, error: rawErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", raw)
      .order("id", { ascending: false })
      .limit(1);

    if (rawErr) {
      console.error("❌ Supabase fallback error:", rawErr.message);
      return null;
    }

    if (rawData && rawData.length > 0) return rawData[0];

    return null;
  } catch (err) {
    console.error("❌ Unexpected Supabase find error:", err.message);
    return null;
  }
}

// ==============================================
// Update booking
// ==============================================
async function updateBookingStatus(id, newStatus) {
  try {
    const supabase = getSupabase(); // <── FIX 🔥🔥🔥

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
    console.error("❌ Unexpected update error:", err.message);
    return false;
  }
}

module.exports = {
  findLastBookingByPhone,
  updateBookingStatus,
};
