const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/* ---------------------------------------------
 * Search booking by phone
 * ---------------------------------------------*/
async function findBookingByPhone(phone) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error searching booking:", error.message);
    return null;
  }

  return data?.[0] || null;
}

/* ---------------------------------------------
 * Cancel booking
 * ---------------------------------------------*/
async function cancelBooking(id) {
  const { error } = await supabase
    .from("bookings")
    .update({ status: "Cancelled" })
    .eq("id", id);

  if (error) {
    console.error("❌ Error cancelling booking:", error.message);
  }
}

module.exports = {
  findBookingByPhone,
  cancelBooking,
};
