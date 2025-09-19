const express = require('express');
const router = express.Router();
const decisionController = require('../controllers/decisionController');

router.post('/resolve-conflict', decisionController.resolveConflict);

module.exports = router;