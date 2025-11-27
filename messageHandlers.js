/**
 * messageHandlers.js
 *
 * Purpose:
 * - Main orchestration file for message handling
 * - Coordinates detection, responses, and media sending
 */

const {
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isEnglish,
  isGreeting,
  getGreeting,
} = require("./detectionHelpers");

const { containsBanWords, sendBanWordsResponse } = require("./contentFilter");

const {
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendImageMessage,
  sendOffersValidity,
} = require("./mediaService");

const { transcribeAudio } = require("./transcriptionService");

/* ---------------------------------------------
 * NEW: Cancel Booking Detector
 * ---------------------------------------------*/
function isCancelRequest(text = "") {
  const keywords = [
    "الغاء الحجز",
    "إلغاء الحجز",
    "الغاء",
    "إلغاء",
    "cancel",
    "cancel booking",
    "cancel appointment",
  ];
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// --------------------------------------------
// Exports - Main API
// --------------------------------------------
module.exports = {
  // Detection helpers
  isLocationRequest,
  isOffersRequest,
  isOffersConfirmation,
  isDoctorsRequest,
  isBookingRequest,
  isEnglish,
  isGreeting,
  getGreeting,
  isCancelRequest, // <--- ADDED

  // Content filtering
  containsBanWords,
  sendBanWordsResponse,

  // Media & messaging
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  sendImageMessage,
  sendOffersValidity,

  // Transcription
  transcribeAudio,
};
