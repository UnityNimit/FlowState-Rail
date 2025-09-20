const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getOptimalRoutingPlan(currentState, aiPriorities) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // The prompt is heavily upgraded to include conditional logic.
    const prompt = `
    You are "RailOps AI," an expert railway traffic controller for the Ghaziabad Junction. Your task is to create a dynamic, conditional routing plan.

    **Operational Priorities (Higher importance if true):**
    \`\`\`json
    ${JSON.stringify(aiPriorities, null, 2)}
    \`\`\`

    **Current System State:**
    This is the real-time state of the network. Analyze all trains, including MOVING, WAITING_SIGNAL, and STOPPED.
    \`\`\`json
    ${JSON.stringify(currentState, null, 2)}
    \`\`\`

    **Your Task:**
    1.  Create the optimal sequence and route for all trains that are not yet on their exit track.
    2.  **CRITICAL FOR HOLD ACTIONS:** If you recommend holding Train B to let Train A pass, you MUST provide a "releaseCondition". The release condition tells the system when it's safe to release Train B. The condition should be the last critical track segment that Train A must clear.
    3.  Avoid routes with 'FAULTY' tracks. Prioritize based on the controller's settings.

    **Required Output Format:**
    Provide your response as a single, minified JSON array of recommendation objects, ordered by sequence priority. Each object MUST have this exact structure:
    {
      "trainId": "The ID of the train.",
      "action": "'PROCEED VIA' or 'HOLD AT SIGNAL'.",
      "details": "The route ID (e.g., 'R-UML-PF2-MRD') or the signal ID to hold at.",
      "humanReadablePath": "The human-readable 'description' from the route object. Use 'N/A' for HOLD actions.",
      "priority": The sequential order number (1, 2, ...),
      "justification": "A concise expert explanation for this decision, mentioning any conflicts resolved.",
      "releaseCondition": {
        "checkTrainId": "The ID of the train to monitor (e.g., the higher priority train).",
        "clearedSegmentId": "The ID of the track segment that the monitored train must clear."
      }
    }

    **IMPORTANT:** For 'PROCEED VIA' actions, the "releaseCondition" object should be present but contain 'null' for its values (e.g., {"checkTrainId": null, "clearedSegmentId": null}). For 'HOLD AT SIGNAL' actions, it MUST be populated.

    Example of a perfect HOLD action output:
    {
      "trainId": "54472-DLI_RE_PASS",
      "action": "HOLD AT SIGNAL",
      "details": "S-H-DML",
      "humanReadablePath": "N/A",
      "priority": 2,
      "justification": "Hold Passenger to allow high-priority Shatabdi to clear the main line, preventing conflict at P-3B.",
      "releaseCondition": {
        "checkTrainId": "12003-LKO_SHTBDI",
        "clearedSegmentId": "TC-S3-P3B"
      }
    }

    Now, generate the complete, conditional plan.
    `;

    try {
        console.log("Sending CONDITIONAL LOGIC prompt to Gemini API...");
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonResponse = JSON.parse(cleanedText);
        console.log("Received valid conditional plan from Gemini API.");
        return jsonResponse;

    } catch (error) {
        console.error("Error calling or parsing Gemini API response:", error);
        return {
            error: "Failed to get a decision from the AI model.",
            details: error.message
        };
    }
}

module.exports = { getOptimalRoutingPlan };