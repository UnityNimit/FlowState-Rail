const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// This uses the same API key and setup as the dispatcher
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getChatbotResponse(question, networkState) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // This prompt is specifically designed for conversational Q&A about the network state.
    const prompt = `
    You are "RailOps AI," a helpful and expert assistant to a railway section controller. Your sole purpose is to answer questions based on the real-time data provided below.

    **Current System State:**
    This is a snapshot of the entire railway network state right now. Use this data exclusively to answer the user's question.
    \`\`\`json
    ${JSON.stringify(networkState, null, 2)}
    \`\`\`

    **Controller's Question:**
    "${question}"

    **Your Task:**
    1.  Carefully analyze the provided JSON data.
    2.  Answer the controller's question concisely and accurately based ONLY on the data.
    3.  If the answer isn't in the data, simply say, "I do not have that information in the current network state." Do not make up information.
    4.  Be professional and direct in your response.

    Example Answer Style:
    - Q: "Is TC-PF4 blocked?" -> A: "Yes, track segment TC-PF4 currently has a 'FAULTY' status."
    - Q: "Which train is on TC-UML-APP?" -> A: "Currently, no train is occupying track segment TC-UML-APP."

    Now, provide your answer to the controller's question.
    `;

    try {
        console.log("Sending Chatbot prompt to Gemini API...");
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log("Received Chatbot response from Gemini API.");
        return text;
    } catch (error) {
        console.error("Error calling Gemini API for chat:", error);
        return "I apologize, but I encountered an error while processing your request.";
    }
}

module.exports = { getChatbotResponse };