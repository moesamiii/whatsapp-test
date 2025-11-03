import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    // ✅ Supabase credentials
    const SUPABASE_URL = "https://ylsbmxedhycjqaorjkvm.supabase.co";
    const SUPABASE_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlsc2JteGVkaHljanFhb3Jqa3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTk5NTUsImV4cCI6MjA3NjM5NTk1NX0.W61xOww2neu6RA4yCJUob66p4OfYcgLSVw3m3yttz1E";

    // ✅ Handle WhatsApp sending
    if (req.url === "/sendWhatsApp" && req.method === "POST") {
      const body = await parseJSON(req);
      const { name, phone, service, appointment, image } = body || {};

      if (!name || !phone)
        return res.status(400).json({ error: "Missing name or phone" });

      const messageText = `👋 مرحبًا ${name}!\nتم حجز موعدك لخدمة ${service} في Smile Clinic 🦷\n${appointment}`;
      const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

      // ✅ Send image message if exists
      if (image) {
        const imagePayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "image",
          image: {
            link: image,
            caption: messageText,
          },
        };

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          },
          body: JSON.stringify(imagePayload),
        });

        const imageData = await response.json();

        if (!response.ok) {
          return res
            .status(500)
            .json({
              success: false,
              error: imageData,
              message: "Image failed",
            });
        }

        // ✅ Follow-up text
        const followupPayload = {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: "📅 للحجز أو الاستفسار، تواصل معنا الآن!" },
        };

        const followupRes = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          },
          body: JSON.stringify(followupPayload),
        });

        const followupData = await followupRes.json();

        return res.status(200).json({
          success: true,
          imageData,
          followupData,
          message: "Image and follow-up text sent successfully",
        });
      }

      // 📝 If no image, send plain text
      const textPayload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: messageText },
      };

      const textResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify(textPayload),
      });

      const textData = await textResponse.json();

      return res.status(200).json({ success: true, textData });
    }

    // ✅ Handle bookings fetch
    if (req.url.startsWith("/api/bookings") && req.method === "GET") {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?select=*`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        }
      );

      const data = await response.json();
      return res.status(200).json(data);
    }

    // 🧭 Fallback
    res.status(404).json({ message: "Route not found" });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Helper to parse JSON body safely
async function parseJSON(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });
  });
}
