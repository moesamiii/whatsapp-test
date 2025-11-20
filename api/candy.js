import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    const payload = req.body.record;

    const name = payload.name;
    const phone = payload.phone;
    const service = payload.service;

    const whatsappMessage = `
📥 New Booking
Name: ${name}
Phone: ${phone}
Service: ${service}
    `;

    const send = require("../sendWhatsApp");
    await send(phone, whatsappMessage);

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
