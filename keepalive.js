// keepalive.js — Silent WhatsApp Keep Alive

export default async function handler(req, res) {
  try {
    const phone = "962785050875";

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.PHONE_NUMBER_ID;

    if (!token || !phoneId) {
      return res.status(500).json({
        success: false,
        error:
          "Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID in environment variables",
      });
    }

    // Silent reaction that does NOT appear to anyone
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "reaction",
      reaction: {
        message_id: "000000000000000", // intentionally invalid ID → triggers session only
        emoji: " ", // invisible reaction
      },
    };

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    return res.status(200).json({
      success: true,
      message: "Silent keepalive ping sent",
      details: data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
