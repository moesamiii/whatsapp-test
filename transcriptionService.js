/**
 * transcriptionService.js (COMPLETE FIXED VERSION)
 *
 * - Fetch audio from WhatsApp API
 * - Convert OGG → WAV (Groq Whisper prefers WAV)
 * - Transcribe using Groq Whisper
 * - Detect “cancel booking” intent
 */

const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const { exec } = require("child_process");

const { isCancelRequest } = require("./messageHandlers");
const { askForCancellationPhone } = require("./helpers");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

/* -----------------------------------------
   🔧 Convert OGG (WhatsApp) → WAV (Groq)
------------------------------------------*/
async function convertOggToWav(buffer) {
  return new Promise((resolve, reject) => {
    const inputPath = `/tmp/${Date.now()}_in.ogg`;
    const outputPath = `/tmp/${Date.now()}_out.wav`;

    fs.writeFileSync(inputPath, buffer);

    exec(`ffmpeg -y -i ${inputPath} -ar 16000 -ac 1 ${outputPath}`, (err) => {
      if (err) return reject(err);
      const wavBuffer = fs.readFileSync(outputPath);
      resolve(wavBuffer);
    });
  });
}

/* -----------------------------------------
   🎙️ MAIN — TRANSCRIBE AUDIO
------------------------------------------*/
async function transcribeAudio(mediaId, from) {
  try {
    console.log("🎧 Starting transcription for mediaId:", mediaId);

    // STEP 1 — GET MEDIA URL
    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${mediaId}?fields=url`,
      {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      }
    );

    const mediaUrl = mediaUrlResponse.data.url;
    if (!mediaUrl) {
      console.log("❌ No media URL returned from WhatsApp.");
      return null;
    }

    // STEP 2 — DOWNLOAD OGG FILE
    const audioResponse = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    // STEP 3 — CONVERT OGG → WAV
    const wavBuffer = await convertOggToWav(audioResponse.data);

    // STEP 4 — SEND WAV TO GROQ WHISPER
    const form = new FormData();
    form.append("file", wavBuffer, {
      filename: "voice.wav",
      contentType: "audio/wav",
    });
    form.append("model", "whisper-large-v3");
    form.append("language", "ar");
    form.append("response_format", "json");

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

    const text = result.data.text?.trim() || null;
    if (!text) {
      console.log("❌ Groq returned empty transcription.");
      return null;
    }

    console.log("📝 TRANSCRIPTION:", text);

    // STEP 5 — Detect "Cancel Booking"
    if (isCancelRequest(text)) {
      console.log("🔍 CANCEL detected from voice for user:", from);
      await askForCancellationPhone(from);
      return null; // Stop normal flow
    }

    return text;
  } catch (err) {
    console.error(
      "❌ Voice transcription failed:",
      err.response?.data || err.message
    );
    return null;
  }
}

module.exports = {
  transcribeAudio,
};
