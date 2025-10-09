// webhookHandler.js
// Put this file next to index.js. It registers the /webhook GET (verification)
// and POST (message handling) routes. Exports registerWebhookRoutes(app, VERIFY_TOKEN).

const {
  askAI,
  validateNameWithAI,
  sendTextMessage,
  sendServiceList,
  sendAppointmentOptions,
  saveBooking,
} = require("./helpers");

const {
  transcribeAudio,
  sendLocationMessages,
  sendOffersImages,
  sendDoctorsImages,
  isLocationRequest,
  isOffersRequest,
  isDoctorsRequest,
  isEnglish,
} = require("./messageHandlers");

function registerWebhookRoutes(app, VERIFY_TOKEN) {
  // Webhook verification (GET)
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  // Webhook message handling (POST)
  app.post("/webhook", async (req, res) => {
    try {
      const body = req.body;
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = message?.from;

      if (!message || !from) return res.sendStatus(200);

      // Ensure tempBookings exists on global
      const tempBookings = global.tempBookings || (global.tempBookings = {});

      const fridayWords = ["الجمعة", "Friday", "friday"];

      // --------- Voice messages ----------
      if (message.type === "audio") {
        const mediaId = message.audio.id;
        if (!mediaId) return res.sendStatus(200);

        const transcript = await transcribeAudio(mediaId);

        if (!transcript) {
          await sendTextMessage(
            from,
            "⚠️ لم أتمكن من فهم الرسالة الصوتية، حاول مرة أخرى 🎙️"
          );
          return res.sendStatus(200);
        }

        console.log(`🗣️ Transcribed text: "${transcript}"`);

        if (isLocationRequest(transcript)) {
          const language = isEnglish(transcript) ? "en" : "ar";
          await sendLocationMessages(from, language);
          return res.sendStatus(200);
        }

        if (isOffersRequest(transcript)) {
          const language = isEnglish(transcript) ? "en" : "ar";
          await sendOffersImages(from, language);
          return res.sendStatus(200);
        }

        if (isDoctorsRequest(transcript)) {
          const language = isEnglish(transcript) ? "en" : "ar";
          await sendDoctorsImages(from, language);
          return res.sendStatus(200);
        }

        if (
          fridayWords.some((word) =>
            transcript.toLowerCase().includes(word.toLowerCase())
          )
        ) {
          await sendTextMessage(
            from,
            "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
          );

          // Start booking flow after Friday message
          setTimeout(async () => {
            await sendTextMessage(
              from,
              "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇"
            );
            await sendAppointmentOptions(from);
          }, 2000);

          return res.sendStatus(200);
        }

        // Booking flow vs AI response
        if (!tempBookings[from]) {
          if (
            transcript.includes("حجز") ||
            transcript.toLowerCase().includes("book") ||
            transcript.includes("موعد") ||
            transcript.includes("appointment")
          ) {
            await sendAppointmentOptions(from);
          } else {
            const reply = await askAI(transcript);
            await sendTextMessage(from, reply);
          }
        } else {
          if (tempBookings[from] && !tempBookings[from].name) {
            const isValid = await validateNameWithAI(transcript);
            if (!isValid) {
              await sendTextMessage(
                from,
                "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة..."
              );
              return res.sendStatus(200);
            }

            tempBookings[from].name = transcript;
            await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
          } else if (tempBookings[from] && !tempBookings[from].phone) {
            const normalized = transcript
              .replace(/[^\d٠-٩]/g, "")
              .replace(/٠/g, "0")
              .replace(/١/g, "1")
              .replace(/٢/g, "2")
              .replace(/٣/g, "3")
              .replace(/٤/g, "4")
              .replace(/٥/g, "5")
              .replace(/٦/g, "6")
              .replace(/٧/g, "7")
              .replace(/٨/g, "8")
              .replace(/٩/g, "9");

            const isValid = /^07\d{8}$/.test(normalized);

            if (!isValid) {
              await sendTextMessage(
                from,
                "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875"
              );
              return res.sendStatus(200);
            }

            tempBookings[from].phone = normalized;

            // Send service dropdown list
            await sendServiceList(from);
            await sendTextMessage(
              from,
              "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
            );
          } else if (tempBookings[from] && !tempBookings[from].service) {
            tempBookings[from].service = transcript;
            const booking = tempBookings[from];
            await saveBooking(booking);

            await sendTextMessage(
              from,
              `✅ تم حفظ حجزك بنجاح:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
            );

            delete tempBookings[from];
          }
        }

        return res.sendStatus(200);
      }

      // --------- Interactive (buttons / lists) ----------
      if (message.type === "interactive") {
        const interactiveType = message.interactive.type;
        const id =
          interactiveType === "list_reply"
            ? message.interactive.list_reply.id
            : message.interactive.button_reply?.id;

        console.log("🔘 DEBUG => Interactive type:", interactiveType);
        console.log("🔘 DEBUG => Button/List pressed:", id);

        if (id?.startsWith("slot_")) {
          const appointment = id.replace("slot_", "").toUpperCase();

          if (
            fridayWords.some((word) =>
              appointment.toLowerCase().includes(word.toLowerCase())
            )
          ) {
            await sendTextMessage(
              from,
              "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
            );

            // Continue booking after Friday message
            setTimeout(async () => {
              await sendTextMessage(
                from,
                "📅 لنبدأ الحجز، اختر الوقت المناسب 👇"
              );
              await sendAppointmentOptions(from);
            }, 2000);

            return res.sendStatus(200);
          }

          tempBookings[from] = { appointment };
          await sendTextMessage(
            from,
            "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
          );
          return res.sendStatus(200);
        }

        if (id?.startsWith("service_")) {
          const serviceName = id.replace("service_", "").replace(/_/g, " ");

          if (!tempBookings[from] || !tempBookings[from].phone) {
            await sendTextMessage(
              from,
              "⚠️ يرجى إكمال خطوات الحجز أولاً (الموعد، الاسم، رقم الجوال)"
            );
            return res.sendStatus(200);
          }

          tempBookings[from].service = serviceName;
          const booking = tempBookings[from];
          await saveBooking(booking);

          await sendTextMessage(
            from,
            `✅ تم حفظ حجزك:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
          );

          delete tempBookings[from];
          return res.sendStatus(200);
        }

        return res.sendStatus(200);
      }

      // --------- Text messages ----------
      const text = message?.text?.body?.trim();
      if (!text) return res.sendStatus(200);

      console.log(`💬 DEBUG => Message from ${from}:`, text);

      if (isLocationRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendLocationMessages(from, language);
        return res.sendStatus(200);
      }

      if (isOffersRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendOffersImages(from, language);
        return res.sendStatus(200);
      }

      if (isDoctorsRequest(text)) {
        const language = isEnglish(text) ? "en" : "ar";
        await sendDoctorsImages(from, language);
        return res.sendStatus(200);
      }

      if (
        fridayWords.some((word) =>
          text.toLowerCase().includes(word.toLowerCase())
        )
      ) {
        await sendTextMessage(
          from,
          "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
        );

        // Start booking flow after informing
        setTimeout(async () => {
          await sendTextMessage(
            from,
            "📅 لنبدأ الحجز، اختر الوقت المناسب لك 👇"
          );
          await sendAppointmentOptions(from);
        }, 2000);

        return res.sendStatus(200);
      }

      // Step 1: Appointment shortcut
      if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
        const appointment = `${text} PM`;
        tempBookings[from] = { appointment };
        await sendTextMessage(
          from,
          "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:"
        );
        return res.sendStatus(200);
      }

      // Step 2: Name input
      if (tempBookings[from] && !tempBookings[from].name) {
        const userName = text.trim();
        const isValid = await validateNameWithAI(userName);

        if (!isValid) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة..."
          );
          return res.sendStatus(200);
        }

        tempBookings[from].name = userName;
        await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
        return res.sendStatus(200);
      }

      // Step 3: Phone input
      if (tempBookings[from] && !tempBookings[from].phone) {
        const normalized = text
          .replace(/[^\d٠-٩]/g, "")
          .replace(/٠/g, "0")
          .replace(/١/g, "1")
          .replace(/٢/g, "2")
          .replace(/٣/g, "3")
          .replace(/٤/g, "4")
          .replace(/٥/g, "5")
          .replace(/٦/g, "6")
          .replace(/٧/g, "7")
          .replace(/٨/g, "8")
          .replace(/٩/g, "9");

        const isValid = /^07\d{8}$/.test(normalized);

        if (!isValid) {
          await sendTextMessage(
            from,
            "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 0785050875"
          );
          return res.sendStatus(200);
        }

        tempBookings[from].phone = normalized;

        // Send service dropdown list
        await sendServiceList(from);
        await sendTextMessage(
          from,
          "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
        );
        return res.sendStatus(200);
      }

      // Step 4: Service input (manual text fallback)
      if (tempBookings[from] && !tempBookings[from].service) {
        const booking = tempBookings[from];
        booking.service = text;
        await saveBooking(booking);

        await sendTextMessage(
          from,
          `✅ تم حفظ حجزك بنجاح:
👤 ${booking.name}
📱 ${booking.phone}
💊 ${booking.service}
📅 ${booking.appointment}`
        );

        delete tempBookings[from];
        return res.sendStatus(200);
      }

      // Step 5: AI chat fallback
      if (!tempBookings[from]) {
        if (text.includes("حجز") || text.toLowerCase().includes("book")) {
          await sendAppointmentOptions(from);
        } else {
          const reply = await askAI(text);
          await sendTextMessage(from, reply);
        }
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("❌ DEBUG => Webhook Error:", err.message || err);
      res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
