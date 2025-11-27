// cancelHandler.js
const { sendTextMessage } = require("./helpers");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ------------------------------
// Detect cancellation intent
// ------------------------------
function isCancelRequest(text = "") {
  const lower = text.toLowerCase();
  const words = [
    "cancel",
    "cancel booking",
    "delete booking",
    "الغاء",
    "إلغاء",
    "ألغي",
    "أبغى ألغي",
    "ابغى الغي",
    "ابي الغي",
    "الغاء موعد",
    "حذف موعد",
  ];
  return words.some((w) => lower.includes(w));
}

// ------------------------------
// MAIN cancellation processor
// ------------------------------
async function processCancellation(from, messageText, sessions) {
  const session = sessions[from] || (sessions[from] = {});

  // STEP 1 → User asked to cancel
  if (isCancelRequest(messageText)) {
    session.waitingForCancellation = true;
    await sendTextMessage(from, "🔢 أرسل رقم الجوال المرتبط بالحجز لإلغائه:");
    return true; // means "handled"
  }

  // STEP 2 → User must send the phone number
  if (session.waitingForCancellation) {
    const normalized = messageText.replace(/[^\d]/g, "");

    if (!/^07\d{8}$/.test(normalized)) {
      await sendTextMessage(
        from,
        "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 07XXXXXXXX"
      );
      return true;
    }

    // Search database
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("phone", normalized)
      .limit(1);

    if (!data || data.length === 0) {
      await sendTextMessage(from, "❌ لم يتم العثور على حجز مرتبط بهذا الرقم.");
      session.waitingForCancellation = false;
      return true;
    }

    // Cancel booking
    const id = data[0].id;
    await supabase.from("bookings").delete().eq("id", id);

    await sendTextMessage(
      from,
      "✅ تم إلغاء الحجز بنجاح. إذا احتجت أي مساعدة أخرى أنا معك 💚"
    );

    session.waitingForCancellation = false;
    return true;
  }

  return false; // means "not handled", continue normal flow
}

module.exports = {
  processCancellation,
};
