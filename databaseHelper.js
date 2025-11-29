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
// Save NEW booking into Supabase (NEW FUNCTION)
// ==============================================
async function insertBookingToSupabase(booking) {
  try {
    const supabase = getSupabase();

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("bookings")
      .insert([
        {
          name: booking.name,
          phone: booking.phone,
          service: booking.service,
          appointment: booking.appointment,
          time: now,
          status: "new",
        },
      ])
      .select();

    if (error) {
      console.error("❌ Supabase insert error:", error.message);
      return null;
    }

    console.log("✅ Saved to Supabase:", data);
    return data;
  } catch (err) {
    console.error("❌ Unexpected Supabase insert error:", err.message);
    return null;
  }
}

// ==============================================
// Find last booking by phone
// ==============================================
async function findLastBookingByPhone(rawPhone) {
  try {
    const supabase = getSupabase();

    const normalized = normalizePhone(rawPhone);
    console.log("📌 Searching for phone:", normalized);

    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", normalized)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("❌ Supabase error:", error.message);
      return null;
    }

    if (data && data.length > 0) return data[0];

    return null;
  } catch (err) {
    console.error("❌ Unexpected Supabase find error:", err.message);
    return null;
  }
}

// ==============================================
// Update booking - cancel
// ==============================================
async function updateBookingStatus(id, newStatus) {
  try {
    const supabase = getSupabase();

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
  insertBookingToSupabase, // <── NEW EXPORT
};
