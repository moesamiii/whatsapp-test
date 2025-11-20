// api/webhookCandy.js or pages/api/webhookCandy.js

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  // Add CORS headers for Supabase
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔥 Webhook HIT!");
    console.log("Full body:", JSON.stringify(req.body, null, 2));

    // Supabase sends data in different formats depending on webhook type
    // For Database Webhooks, the new row is in "record"
    const payload = req.body.record || req.body;

    if (!payload) {
      console.error("❌ No payload received");
      return res.status(400).json({ error: "No record received" });
    }

    const { name, phone, service } = payload;

    if (!name || !phone || !service) {
      console.error("❌ Missing required fields:", { name, phone, service });
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log("📝 Processing booking:", { name, phone, service });

    const messageText = `📢 عميل جديد من الموقع:
👤 الاسم: ${name}
📞 الهاتف: ${phone}
💊 الخدمة: ${service}`;

    console.log("📤 Sending WhatsApp message...");

    const whatsappResponse = await fetch(
      "https://whatsapp-test-rosy.vercel.app/api/sendWhatsApp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Smile Clinic",
          phone: "962785050875",
          service: "Booking",
          appointment: messageText,
        }),
      }
    );

    const whatsappData = await whatsappResponse.json();
    console.log("✅ WhatsApp response:", whatsappData);

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      whatsappResult: whatsappData,
    });
  } catch (err) {
    console.error("❌ ERROR:", err);
    return res.status(500).json({
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
}
