/**
 * webhookProcessor.js (CLEAN ROUTER VERSION)
 *
 * Purpose:
 * - Only route messages (text/audio/interactive)
 * - No business logic here at all
 * - Prevent conflicts between handlers
 */

const {
  handleTextMessage,
  handleInteractiveMessage,
} = require("./bookingFlowHandler");
const { transcribeAudio } = require("./transcriptionService");

// ------------------------------------------------------------
//              🟣 TEXT MESSAGE ROUTER
// ------------------------------------------------------------
async function handleTextMessageRouter(text, from) {
  try {
    global.tempBookings = global.tempBookings || {};
    await handleTextMessage(text, from, global.tempBookings);
  } catch (err) {
    console.error("❌ Error in handleTextMessageRouter:", err.message);
  }
}

// ------------------------------------------------------------
//              🟡 INTERACTIVE MESSAGE ROUTER
// ------------------------------------------------------------
async function handleInteractiveRouter(message, from) {
  try {
    global.tempBookings = global.tempBookings || {};
    await handleInteractiveMessage(message, from, global.tempBookings);
  } catch (err) {
    console.error("❌ Error in handleInteractiveRouter:", err.message);
  }
}

// ------------------------------------------------------------
//              🔵 AUDIO MESSAGE ROUTER
// ------------------------------------------------------------
async function handleAudioMessage(message, from) {
  try {
    global.tempBookings = global.tempBookings || {};

    const mediaId = message?.audio?.id;
    if (!mediaId) return;

    const transcript = await transcribeAudio(mediaId);
    if (!transcript) {
      await sendTextMessage(from, "⚠️ لم أتمكن من فهم الصوت، حاول مرة أخرى.");
      return;
    }

    await handleTextMessage(transcript, from, global.tempBookings);
  } catch (err) {
    console.error("❌ Error in handleAudioMessage:", err.message);
  }
}

module.exports = {
  handleTextMessageRouter,
  handleInteractiveRouter,
  handleAudioMessage,
};
