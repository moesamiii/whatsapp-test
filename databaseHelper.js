const { createClient } = require("@supabase/supabase-js");

// ==============================================
// 🔥 Create Supabase client (WORKS ON VERCEL)
// ==============================================
const supabase = new createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    global: {
      fetch: (...args) => fetch(...args), // ensures fetch works on Vercel
    },
  }
);

// ==============================================
// 📌 Normalize phone number
// ==============================================
function normalizePhone(phone) {
  if (!phone) return "";
  let cleaned = phone.toString().replace(/\D/g, "");
  cleaned = cleaned.replace(/^0+/, "");
  return cleaned;
}

// ==============================================
// 🔍 Find booking by phone
// ==============================================
async function findLastBookingByPhone(phoneInput) {
  try {
    const normalized = normalizePhone(phoneInput);

    console.log("📌 Searching for phone:", normalized);

    // Try normalized phone
    let { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", normalized)
      .order("id", { ascending: false })
      .limit(1);

    if (error) {
      console.error("❌ Supabase error:", error);
      return null;
    }

    if (data && data.length > 0) return data[0];

    // Try raw phone as backup
    const raw = phoneInput.toString().replace(/\D/g, "");

    ({ data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", raw)
      .order("id", { ascending: false })
      .limit(1));

    if (error) {
      console.error("❌ Supabase fallback error:", error);
      return null;
    }

    if (data && data.length > 0) return data[0];

    return null;
  } catch (e) {
    console.error("❌ findLastBookingByPhone error:", e);
    return null;
  }
}

// ==============================================
// ✏️ Update booking status
// ==============================================
async function updateBookingStatus(id, newStatus) {
  try {
    const { error } = await supabase
      .from("bookings")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      console.error("❌ updateBookingStatus error:", error);
      return false;
    }

    return true;
  } catch (e) {
    console.error("❌ Unexpected error:", e);
    return false;
  }
}

module.exports = {
  findLastBookingByPhone,
  updateBookingStatus,
};
