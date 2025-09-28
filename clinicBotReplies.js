// clinicBotReplies.js
module.exports = function getReply(text) {
  const lower = text.toLowerCase();

  if (lower.includes("مرحبا") || lower.includes("hello")) {
    return "👋 أهلاً بك في عيادتنا! كيف يمكنني مساعدتك؟";
  } else if (
    lower.includes("مواعيد") ||
    lower.includes("اوقات") ||
    lower.includes("opening")
  ) {
    return "🕒 مواعيد العيادة: يومياً من 9 صباحاً حتى 9 مساءً ما عدا الجمعة.";
  } else if (
    lower.includes("سعر") ||
    lower.includes("كشف") ||
    lower.includes("فلوس") ||
    lower.includes("price")
  ) {
    return "💰 تكلفة الكشف: 150 ريال، تشمل الاستشارة والفحص.";
  } else if (
    lower.includes("موقع") ||
    lower.includes("وين") ||
    lower.includes("address") ||
    lower.includes("location")
  ) {
    return "📍 موقع العيادة: الرياض - شارع الملك فهد.\nGoogle Maps: https://maps.google.com";
  } else if (lower.includes("شكرا") || lower.includes("thanks")) {
    return "🙏 شكراً لك! نتمنى لك الصحة والعافية دائماً.";
  }

  return `🤖 أهلاً! استلمت رسالتك: "${text}"\n\nيمكنك أن تسألني عن: المواعيد 🕒، الأسعار 💰، الموقع 📍، أو الحجز 📅.`;
};
