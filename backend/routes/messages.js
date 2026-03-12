const { Router } = require('express');
const { loadSentMessages } = require('../services/chatHistory');

const router = Router();

// GET /messages?since=&accountId=
router.get('/', (req, res) => {
  const since     = parseInt(req.query.since) || 0;
  const accountId = req.query.accountId || null;
  let msgs = global.inboxMessages.filter(m => m.ts > since);
  if (accountId) msgs = msgs.filter(m => m.accountId === accountId);
  res.json({ messages: msgs });
});

// DELETE /messages
router.delete('/', (req, res) => {
  global.inboxMessages = [];
  res.json({ status: 'ok' });
});

// GET /sent-messages
router.get('/sent', (req, res) => {
  res.json({ messages: loadSentMessages() });
});

module.exports = router;
