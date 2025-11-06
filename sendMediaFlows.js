// ---------------------------------------------
// 🎁 Send Offers & Booking Flow (UPDATED)
// ---------------------------------------------
async function sendOffersImages(to, language = "ar") {
  try {
    console.log(`📤 DEBUG => Sending offers & booking flow to ${to}...`);

    // Step 1: Send intro message
    await sendTextMessage(
      to,
      language === "en"
        ? "💊 Here are our offers and services:"
        : "💊 هذه عروضنا وخدماتنا الحالية:"
    );

    await delay(500);

    // Step 2: Send offers images
    for (let i = 0; i < OFFER_IMAGES.length; i++) {
      await sendImageMessage(to, OFFER_IMAGES[i]);
      if (i < OFFER_IMAGES.length - 1) await delay(800);
    }

    await delay(800);

    // Step 3: Send booking button directly
    console.log(`📤 DEBUG => Sending 'احجز' button to ${to}`);

    await axios.post(
      `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text:
              language === "en"
                ? "✨ Would you like to book an appointment for one of these offers?\n\nClick below to start your booking 👇"
                : "✨ هل ترغب بحجز موعد لأحد هذه العروض؟\n\nاضغط أدناه لبدء الحجز 👇",
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "start_booking_offers",
                  title: language === "en" ? "Book Now" : "احجز",
                },
              },
            ],
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Offers flow with 'احجز' button sent successfully.");
  } catch (err) {
    console.error("❌ DEBUG => Error in offers flow:", err.message);
  }
}
