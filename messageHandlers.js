/**
 * messageHandlers.js
 *
 * Purpose:
 * - Main orchestration file for message handling
 * - Coordinates detection, responses, and media sending
 *
 * Dependencies:
 * - detectionHelpers.js: Intent and language detection
 * - contentFilter.js: Ban words and inappropriate content filtering
 * - mediaService.js: Sending images, location, and offers
 * - transcriptionService.js: Audio transcription via Groq
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
