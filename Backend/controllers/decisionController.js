const geminiService = require('../services/geminiService');

const resolveConflict = async (req, res) => {
    const { currentState, conflictDescription } = req.body;

    if (!currentState || !conflictDescription) {
        return res.status(400).json({ error: 'Missing required conflict data.' });
    }

    try {
        const decision = await geminiService.getDecisionForConflict({ currentState, conflictDescription });
        res.json(decision);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error while resolving conflict.' });
    }
};

module.exports = { resolveConflict };