/**
 * mediaAssets.js
 *
 * Purpose:
 * - Centralized storage for static media assets and clinic metadata used across the bot.
 * - Keeps large lists (image URLs) and small config values (clinic name, location link) separate
 *   from the message-processing logic so they are easy to update or replace (e.g., move to a CDN).
 *
 * Exports:
 * - CLINIC_NAME
 * - CLINIC_LOCATION_LINK
 * - OFFER_IMAGES (array of direct image links)
 * - DOCTOR_IMAGES (array of direct image links)
 *
 * Usage:
 * - require('./mediaAssets') from messageHandlers.js or any other module that wants to send media.
 *
 * Note:
 * - This file contains only static data — no functions or network calls.
 */

const CLINIC_NAME = "Smiles Clinic";
const CLINIC_LOCATION_LINK =
  "https://www.google.com/maps?q=32.0290684,35.863774&z=17&hl=en";

const OFFER_IMAGES = [
  // Offer / services images (Google Drive direct links)
  "https://drive.google.com/uc?export=view&id=104QzzCy2U5ujhADK_SD0dGldowwlgVU2",
  "https://drive.google.com/uc?export=view&id=19EsrCSixVa_8trbzFF5lrZJqcue0quDW",
  "https://drive.google.com/uc?export=view&id=17jaUTvf_S2nqApqMlRc3r8q97uPulvDx",
];

const DOCTOR_IMAGES = [
  // Doctors images (Google Drive direct links)
  "https://drive.google.com/uc?export=view&id=1aHoA2ks39qeuMk9WMZOdotOod-agEonm",
  "https://drive.google.com/uc?export=view&id=1Oe2UG2Gas6UY0ORxXtUYvTJeJZ8Br2_R",
  "https://drive.google.com/uc?export=view&id=1_4eDWRuVme3YaLLoeFP_10LYHZyHyjUT",
];

module.exports = {
  CLINIC_NAME,
  CLINIC_LOCATION_LINK,
  OFFER_IMAGES,
  DOCTOR_IMAGES,
};
