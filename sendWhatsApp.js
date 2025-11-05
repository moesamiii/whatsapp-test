export default async function handler(req, res) {
  // ✅ CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { name, phone, service, appointment, image } = req.body || {};

  if (!phone)
    return res.status(400).json({ success: false, message: "Missing phone" });

  const text =
    `👋 مرحبًا ${name || "عميلنا الكريم"}!\n` +
    `خدمة: ${service || "الخدمة"}\n\n` +
    `${appointment}\n\n📞 للحجز أو الاستفسار، تواصل معنا الآن عبر واتساب!`;

  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  };

  try {
    let payload;

    if (image && image.startsWith("http")) {
      payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "image",
        image: { link: image, caption: text },
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: text },
      };
    }

    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const body = await r.text();
    const json = body.startsWith("{") ? JSON.parse(body) : { raw: body };

    if (!r.ok) {
      console.error("❌ WhatsApp API failed:", json);
      return res.status(r.status).json({
        success: false,
        error: json,
        message: json?.error?.message || "WhatsApp API error",
      });
    }

    console.log("✅ WhatsApp response:", json);
    return res.status(200).json({ success: true, textData: json });
  } catch (err) {
    console.error("🚨 Server crash:", err);
    return res
      .status(500)
      .json({ success: false, message: err.message, stack: err.stack });
  }
}
