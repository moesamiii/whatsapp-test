/**
 * bookingFlowHandler.js
 *
 * Responsibilities:
 * - Manage booking flow state and steps (appointment, name, phone, service).
 * - Handle interactive messages (buttons/lists) for appointments and services.
 * - Process text input for each booking step with validation.
 * - Handle side questions during booking flow and return to correct step.
 * - Validate and save bookings.
 */

const {
  askAI,
  validateNameWithAI,
  sendTextMessage,
  sendServiceList,
  sendAppointmentOptions,
  saveBooking,
} = require("./helpers");

const { isBookingRequest, isEnglish } = require("./messageHandlers");

// ---------------------------------------------
// 🧠 Session storage (per-user conversation memory)
// ---------------------------------------------
const sessions = {}; // { userId: { ...state } }

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      waitingForOffersConfirmation: false,
      waitingForDoctorConfirmation: false,
      waitingForBookingDetails: false,
      lastIntent: null,
    };
  }
  return sessions[userId];
}

function isSideQuestion(text = "") {
  if (!text) return false;
  const t = text.trim().toLowerCase();

  return (
    t.endsWith("?") ||
    t.includes("كم") ||
    t.includes("price") ||
    t.includes("how") ||
    t.includes("مدة") ||
    t.includes("ليش") ||
    t.includes("why") ||
    t.startsWith("هل ") ||
    t.startsWith("شو ") ||
    t.startsWith("what ")
  );
}

/**
 * Handle interactive messages (buttons/lists)
 */
async function handleInteractiveMessage(message, from, tempBookings) {
  const interactiveType = message.interactive?.type;
  const id =
    interactiveType === "list_reply"
      ? message.interactive?.list_reply?.id
      : message.interactive?.button_reply?.id;

  if (id?.startsWith("slot_")) {
    const appointment = id.replace("slot_", "").toUpperCase();
    const fridayWords = ["الجمعة", "Friday", "friday"];

    if (
      fridayWords.some((word) =>
        appointment.toLowerCase().includes(word.toLowerCase())
      )
    ) {
      await sendTextMessage(
        from,
        "📅 يوم الجمعة عطلة رسمية والعيادة مغلقة، اختر يومًا آخر للحجز بإذن الله 🌷"
      );

      setTimeout(async () => {
        await sendTextMessage(from, "📅 لنبدأ الحجز، اختر الوقت المناسب 👇");
        await sendAppointmentOptions(from);
      }, 2000);

      return;
    }

    tempBookings[from] = { appointment };
    await sendTextMessage(from, "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:");
    return;
  }

  if (id?.startsWith("service_")) {
    const serviceName = id.replace("service_", "").replace(/_/g, " ");
    if (!tempBookings[from] || !tempBookings[from].phone) {
      await sendTextMessage(
        from,
        "⚠️ يرجى إكمال خطوات الحجز أولاً (الموعد، الاسم، رقم الجوال)"
      );
      return;
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
    return;
  }
}

/**
 * Handle text messages throughout the booking flow
 */
async function handleTextMessage(text, from, tempBookings) {
  // 🧩 Step 1: Appointment shortcut
  if (!tempBookings[from] && ["3", "6", "9"].includes(text)) {
    const appointment = `${text} PM`;
    tempBookings[from] = { appointment };
    await sendTextMessage(from, "👍 تم اختيار الموعد! الآن من فضلك ارسل اسمك:");
    return;
  }

  // 🧩 Step 2: Name input
  if (tempBookings[from] && !tempBookings[from].name) {
    // ⭐ User asked a side question while booking
    if (isSideQuestion(text)) {
      const answer = await askAI(text);
      await sendTextMessage(from, answer);

      // Return to the name step
      await sendTextMessage(from, "نكمّل الحجز؟ أرسل اسمك 😊");
      return;
    }

    const userName = text.trim();

    const isValid = await validateNameWithAI(userName);

    if (!isValid) {
      await sendTextMessage(
        from,
        "⚠️ الرجاء إدخال اسم حقيقي مثل: أحمد، محمد علي، سارة..."
      );
      return;
    }

    tempBookings[from].name = userName;
    await sendTextMessage(from, "📱 ممتاز! الآن أرسل رقم جوالك:");
    return;
  }

  // 🧩 Step 3: Phone input
  if (tempBookings[from] && !tempBookings[from].phone) {
    // ⭐ User asked a side question while booking
    if (isSideQuestion(text)) {
      const answer = await askAI(text);
      await sendTextMessage(from, answer);

      // Return to the phone step
      await sendTextMessage(from, "تمام! الآن أرسل رقم جوالك:");
      return;
    }

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
        "⚠️ الرجاء إدخال رقم أردني صحيح مثل: 07XXXXXXXX"
      );
      return;
    }

    tempBookings[from].phone = normalized;
    await sendServiceList(from);
    await sendTextMessage(
      from,
      "💊 يرجى اختيار الخدمة من القائمة المنسدلة أعلاه:"
    );
    return;
  }

  // 🧩 Step 4: Service input
  if (tempBookings[from] && !tempBookings[from].service) {
    // ⭐ User asked a side question while booking
    if (isSideQuestion(text)) {
      const answer = await askAI(text);
      await sendTextMessage(from, answer);

      // Return to the service step
      await sendTextMessage(from, "نرجع للحجز… ما هي الخدمة المطلوبة؟");
      return;
    }

    const booking = tempBookings[from];
    const userService = text.trim();

    // ✅ Define valid services and their possible keywords
    const SERVICE_KEYWORDS = {
      "تنظيف الأسنان": ["تنظيف", "كلين", "كلينينج", "clean", "تنضيف"],
      "تبييض الأسنان": ["تبييض", "تبيض", "whitening"],
      "حشو الأسنان": ["حشو", "حشوة", "حشوات", "fill", "filling"],
      "زراعة الأسنان": ["زراعة", "زرع", "implant", "زراعه"],
      "ابتسامة هوليود": ["ابتسامة", "هوليود", "ابتسامه", "smile"],
      "تقويم الأسنان": ["تقويم", "braces"],
      "خلع الأسنان": ["خلع", "قلع", "remove", "extraction"],
      "جلسة ليزر بشرة": ["ليزر", "جلسة", "بشرة", "laser"],
      فيلر: ["فيلر", "filler"],
      بوتوكس: ["بوتوكس", "botox"],
    };

    // ❌ Common nonsense or forbidden body areas
    const FORBIDDEN_WORDS = [
      "أنف",
      "بطن",
      "ظهر",
      "رجل",
      "يد",
      "عين",
      "أذن",
      "وجه",
      "شعر",
      "رقبة",
      "تصفير",
      "تحمير",
      "تزريق",
      "تخصير",
      "تسويد",
    ];

    // 🔍 Normalize text for safer matching
    const normalized = userService
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, "")
      .toLowerCase();

    // ❌ Detect nonsense / forbidden areas
    if (FORBIDDEN_WORDS.some((word) => normalized.includes(word))) {
      await sendTextMessage(
        from,
        "⚠️ يبدو أنك ذكرت منطقة من الجسم لا تتعلق بخدماتنا. يرجى اختيار خدمة خاصة بالأسنان أو البشرة فقط."
      );
      await sendServiceList(from);
      return;
    }

    // ✅ Fuzzy match against valid keywords
    let matchedService = null;
    for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
      if (
        keywords.some((kw) => normalized.includes(kw.toLowerCase())) ||
        normalized.includes(service.replace(/\s/g, ""))
      ) {
        matchedService = service;
        break;
      }
    }

    // If still nothing found, use AI for backup validation
    if (!matchedService) {
      try {
        const aiCheck = await askAI(
          `هل "${userService}" خدمة تتعلق بطب الأسنان أو البشرة في عيادة تجميل؟ أجب فقط بـ نعم أو لا.`
        );
        if (aiCheck.toLowerCase().includes("نعم")) {
          // Still safe to ask the user to clarify which exact service
          await sendTextMessage(
            from,
            "💬 ممكن توضح أكثر نوع الخدمة؟ مثلاً: حشو الأسنان، تبييض، فيلر..."
          );
          return;
        }
      } catch (err) {
        console.warn("⚠️ AI service validation fallback failed:", err.message);
      }
    }

    // ❌ Not matched → reject gracefully
    if (!matchedService) {
      await sendTextMessage(
        from,
        `⚠️ لا يمكننا تحديد "${userService}" كخدمة صحيحة.\nالخدمات المتاحة لدينا:\n- ${Object.keys(
          SERVICE_KEYWORDS
        ).join("\n- ")}`
      );
      await sendServiceList(from);
      return;
    }

    // ✅ Valid service found → continue booking
    booking.service = matchedService;
    await saveBooking(booking);

    await sendTextMessage(
      from,
      `✅ تم حفظ حجزك بنجاح:\n👤 ${booking.name}\n📱 ${booking.phone}\n💊 ${booking.service}\n📅 ${booking.appointment}`
    );

    delete tempBookings[from];
    return;
  }

  // 💬 Step 5: Booking or AI fallback
  if (!tempBookings[from]) {
    // 🗓️ If user wants to book (even with typos)
    if (isBookingRequest(text)) {
      console.log(`✅ Booking intent detected from ${from}`);
      await sendAppointmentOptions(from);
      return;
    }

    // 💬 Otherwise fallback to AI
    const reply = await askAI(text);
    await sendTextMessage(from, reply);
    return;
  }
}

module.exports = {
  getSession,
  handleInteractiveMessage,
  handleTextMessage,
};
