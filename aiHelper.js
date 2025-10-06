const Groq = require("groq-sdk");

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 🤖 الذكاء الاصطناعي الجديد
async function askAI(userMessage) {
  try {
    console.log("🤖 DEBUG => Sending message to AI:", userMessage);

    const systemPrompt = `
أنت موظف ذكي في عيادة طبية، ودود ومهذب وتتكلم بالعربية الفصحى.
هدفك الأساسي مساعدة العميل في:
- الحجز أو تعديل الموعد
- معرفة الأسعار أو العروض
- شرح الخدمات أو الإجراءات العلاجية بطريقة بسيطة
- الإجابة على أسئلة عامة عن العيادة (الموقع، الأطباء، أوقات الدوام...)

🎯 قواعد عامة:
1. يمكنك التحدث بحرية وبأسلوب ودود، لكن لا تخرج عن مواضيع العيادة أو الحجز.
2. إذا سأل المستخدم سؤالاً خارج نطاق العيادة (مثل مواضيع شخصية أو عامة جداً)، أجب بلطف:
   "يمكنني المساعدة فقط فيما يخص خدمات وعياداتنا."
3. إذا ذكر المستخدم أي نية للحجز أو الموعد أو التواصل، انتقل فورًا إلى مرحلة جمع البيانات (الموعد، الاسم، رقم الهاتف).
4. استخدم أسلوباً إنسانياً طبيعيًا — لا تكن رسميًا جدًا، ولا تكرر الجمل نفسها.
5. يمكنك استخدام إيموجي خفيفة مثل 🙂 أو 💬 أو 📅 لجعل الرد لطيفًا.

الهدف: أن يشعر العميل أنه يتحدث مع موظف حقيقي وليس روبوت.
`;

    const completion = await client.chat.completions.create({
      model: "llama-4-scout",

      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8, // ↑ أكثر حرية
      max_completion_tokens: 512,
    });

    const reply =
      completion.choices[0]?.message?.content || "عذرًا، لم أفهم سؤالك تمامًا.";
    console.log("🤖 DEBUG => AI Reply:", reply);
    return reply;
  } catch (err) {
    console.error("❌ DEBUG => AI Error:", err.response?.data || err.message);
    return "⚠️ حدث خطأ في نظام المساعد الذكي.";
  }
}

// 🔹 التحقق من الاسم بالذكاء الاصطناعي
async function validateNameWithAI(name) {
  try {
    const prompt = `
الاسم المدخل هو: "${name}"
هل هذا يبدو كاسم شخص حقيقي بالعربية مثل أحمد، محمد، علي، ريم، سارة؟
أجب فقط بـ "نعم" أو "لا".
`;
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_completion_tokens: 10,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    console.log("🤖 DEBUG => Name validation reply:", reply);
    return reply && reply.startsWith("نعم");
  } catch (err) {
    console.error("❌ DEBUG => Name validation error:", err.message);
    return false;
  }
}

module.exports = { askAI, validateNameWithAI };
