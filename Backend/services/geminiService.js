const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getDecisionForConflict(conflictData) {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // This is the most critical part: The Prompt.
    // We are giving Gemini a role, context, the problem, constraints, and a required output format.
    const prompt = `
    You are "RailFlow AI," an expert decision-support system for Indian Railways traffic controllers. Your goal is to optimize network throughput and minimize train delays while ensuring absolute safety.

    **Current Situation:**
    ${JSON.stringify(conflictData.currentState, null, 2)}

    **Conflict to Resolve:**
    ${conflictData.conflictDescription}

    **Operational Rules & Constraints:**
    1.  Safety is the highest priority. No two trains can be on the same track section at the same time unless in a station.
    2.  High-priority trains (like Rajdhani, Shatabdi, Express) must be given precedence over freight or local trains.
    3.  Minimize the cumulative delay across all affected trains. A small hold on a freight train to let an express pass is acceptable.
    4.  Consider platform availability at upcoming stations.
    5.  Decisions must be actionable (e.g., "Hold train X at signal Y for Z minutes," "Reroute train A to alternate line B").

    **Required Output Format:**
    Provide your response as a single, minified JSON object. Do not include any text before or after the JSON object. The JSON object must have the following structure:
    {
      "recommendation": "A clear, concise recommended action.",
      "reasoning": "A brief explanation of why this recommendation is optimal, referencing the operational rules.",
      "confidenceScore": A number between 0.85 and 1.0 representing your confidence in the recommendation,
      "alternatives": [
        {
          "action": "A different possible action.",
          "impact": "The potential negative impact of this alternative."
        }
      ]
    }

    Analyze the situation and provide the optimal decision in the specified JSON format.
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Clean up the response to ensure it's valid JSON
        const jsonResponse = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        return jsonResponse;

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return {
            error: "Failed to get a decision from the AI model."
        };
    }
}

module.exports = { getDecisionForConflict };