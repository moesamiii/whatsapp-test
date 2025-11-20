// Required to allow Supabase to send JSON correctly
export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  try {
    console.log("🔥 Webhook HIT!");
    console.log("Body:", req.body);

    const payload = req.body.record; // Supabase always sends { record: {...} }

    if (!payload) {
      return res.status(400).json({ error: "No record received" });
    }

    const { name, phone, service } = payload;

    const messageText = `
NEW BOOKING
Name: ${name}
Phone: ${phone}
Service: ${service}
`;

    console.log("📨 Sending WhatsApp:", messageText);

    await fetch("https://whatsapp-test-rosy.vercel.app/api/sendWhatsApp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Smile Clinic",
        phone: "962785050875",
        service: "Booking",
        appointment: messageText,
      }),
    });

    console.log("✅ WhatsApp SENT by webhook");

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
