// clinicBotReplies.js
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[!?.،]/g, "")
    .trim();
}

const keywords = {
  greeting: ["مرحبا", "اهلا", "hello", "hi", "hey", "السلام"],
  schedule: [
    "مواعيد",
    "اوقات",
    "دوام",
    "opening",
    "hours",
    "schedule",
    "work time",
  ],
  price: ["سعر", "الفلوس", "كشف", "تكلفة", "price", "cost", "fees"],
  location: ["موقع", "وين", "address", "location", "map", "place"],
  thanks: ["شكرا", "thx", "thanks", "thank you", "مشكور"],
};

function getReply(text) {
  const lower = normalize(text);

  // Helper to check if text includes any word from list
  const includesAny = (arr) => arr.some((w) => lower.includes(w));

  if (includesAny(keywords.greeting)) {
    return "👋 أهلاً وسهلاً في *عيادة ابتسامة الطبيّة*! كيف يمكنني مساعدتك اليوم؟";
  }

  if (includesAny(keywords.schedule)) {
    return "🕒 مواعيد العمل: يومياً من *9 صباحاً إلى 9 مساءً* ما عدا *الجمعة مغلق*.";
  }

  if (includesAny(keywords.price)) {
    return "💰 تكلفة الكشف: *150 ريال* وتشمل الاستشارة والفحص الكامل.";
  }

  if (includesAny(keywords.location)) {
    return "📍 موقع العيادة: *عمّان – عبدون، خلف بنك الإسكان، الطابق الأول*.\nGoogle Maps: https://maps.google.com";
  }

  if (includesAny(keywords.thanks)) {
    return "🙏 العفو! نتمنى لك يوماً جميلاً وصحة دائمة 💚";
  }

  // Default fallback
  return `🤖 استلمت رسالتك: “${text}”\n\nيمكنك سؤالي عن: *المواعيد 🕒، الأسعار 💰، الموقع 📍، أو الحجز 📅*.`;
}

module.exports = getReply;
