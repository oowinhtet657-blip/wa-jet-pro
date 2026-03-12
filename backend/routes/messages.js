const { Router } = require('express');
const { loadSentMessages } = require('../services/chatHistory');

const router = Router();
router.get('/', (req, res) => {
  const since     = parseInt(req.query.since) || 0;
  const accountId = req.query.accountId || null;
  let msgs = global.inboxMessages.filter(m => m.ts > since);
  if (accountId) msgs = msgs.filter(m => m.accountId === accountId);
  res.json({ messages: msgs });
});
router.delete('/', (req, res) => {
  global.inboxMessages = [];
  res.json({ status: 'ok' });
});
router.get('/sent', (req, res) => {
  res.json({ messages: loadSentMessages() });
});

module.exports = router;
