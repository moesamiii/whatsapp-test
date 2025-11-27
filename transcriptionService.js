/**
 * transcriptionService.js
 *
 * Purpose:
 * - Handle audio transcription using Groq Whisper API
 * - Fetch audio files from WhatsApp Media API
 * - Convert audio to text for voice message processing
 *
 * This isolates all transcription logic for better maintainability
 */

const axios = require("axios");
const FormData = require("form-data");

// ---------------------------------------------
// Environment Variables
// ---------------------------------------------
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// ---------------------------------------------
// 🧠 Voice Transcription (Groq Whisper)
// ---------------------------------------------
async function transcribeAudio(mediaId) {
  try {
    // Step 1: Get media URL from WhatsApp
    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
    const mediaUrl = mediaUrlResponse.data.url;
    if (!mediaUrl) return null;

    // Step 2: Download the audio file
    const audioResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    // Step 3: Prepare form data for Groq Whisper API
    const form = new FormData();
    form.append("file", Buffer.from(audioResponse.data), {
      filename: "voice.ogg",
      contentType: "audio/ogg; codecs=opus",
    });
    form.append("model", "whisper-large-v3");
    form.append("language", "ar");
    form.append("response_format", "json");

    // Step 4: Send to Groq for transcription
    const result = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      form,
      {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          ...form.getHeaders(),
        },
      }
    );

    return result.data.text;
  } catch (err) {
    console.error(
      "❌ Voice transcription failed:",
      err.response?.data || err.message
    );
    return null;
  }
}

// --------------------------------------------
// Exports
// --------------------------------------------
module.exports = {
  transcribeAudio,
};
