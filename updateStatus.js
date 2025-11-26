const supabase = require("./supabaseClient");

async function setBookingCancelled(phone) {
  const { error } = await supabase
    .from("bookings")
    .update({ status: "Cancelled by User" })
    .eq("phone", phone);

  if (error) {
    console.error("❌ Supabase update error:", error.message);
    return false;
  }

  return true;
}

module.exports = { setBookingCancelled };
