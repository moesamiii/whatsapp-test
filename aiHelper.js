// aiHelper.js
const Groq = require("groq-sdk");

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 🔹 Ask the AI assistant
async function askAI(userMessage) {
  try {
    console.log("🤖 DEBUG => Sending message to AI:", userMessage);

    const systemPrompt = `
أنت موظف خدمة عملاء ذكي في عيادة طبية. 
دورك أن ترد فقط على الأسئلة المتعلقة بـ:
- المواعيد 🕒
- الأسعار 💰
- الموقع 📍
- الحجز 📅

🔒 قواعد صارمة:
1. لا تكتب أي شيء خارج هذه المواضيع إطلاقًا.
2. إذا سُئلت عن أي شيء آخر، قل بأدب:
   "أستطيع مساعدتك فقط في المواعيد، الأسعار، الموقع أو الحجز."
3. لا تبتكر أو تخمن معلومات.
4. إذا لم تكن متأكدًا من الإجابة، قل:
   "دعني أؤكد لك المعلومة بعد قليل."
5. تكلّم دائمًا بالعربية الفصحى باحترام ومهنية.
6. لا تستخدم رموز أو إيموجي إلا نادرًا.
`;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_completion_tokens: 512,
    });

    const reply =
      completion.choices[0]?.message?.content || "عذراً، لم أفهم سؤالك.";
    console.log("🤖 DEBUG => AI Reply:", reply);
    return reply;
  } catch (err) {
    console.error("❌ DEBUG => AI Error:", err.response?.data || err.message);
    return "⚠️ حدث خطأ في نظام المساعد الذكي.";
  }
}

// 🔹 Validate name using AI
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
