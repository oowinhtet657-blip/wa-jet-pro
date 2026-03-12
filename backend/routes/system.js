const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { getReadyClient } = require('../services/whatsapp');
const { saveSentMessage } = require('../services/chatHistory');
const { ROOT, HASIL_DIR } = require('../config');

const router = Router();

// GET /status
router.get('/status', (req, res) => {
  const accounts   = Object.values(global.clientsMap);
  const readyCount = accounts.filter(a => a.status === 'ready').length;
  res.json({ connected: readyCount > 0, readyCount, totalAccounts: accounts.length });
});

// GET /qr  (compat — akun pertama)
router.get('/qr', (req, res) => {
  const accounts = Object.values(global.clientsMap);
  if (accounts.length === 0) return res.json({ status: 'waiting' });
  const first = accounts[0];
  if (first.status === 'ready') return res.json({ status: 'connected' });
  if (first.qr) return res.json({ status: 'qr', qr: first.qr });
  res.json({ status: 'waiting' });
});

// POST /disconnect  (compat)
router.post('/disconnect', async (req, res) => {
  const { accountId } = req.body || {};
  if (accountId && global.clientsMap[accountId]) {
    try {
      await global.clientsMap[accountId].instance.logout();
      global.clientsMap[accountId].status = 'disconnected';
    } catch {}
  }
  res.json({ status: 'ok' });
});

// POST /reply
router.post('/reply', async (req, res) => {
  try {
    const { to, pesan, accountId } = req.body;
    if (!to || !pesan) return res.status(400).json({ status: 'error', msg: 'Parameter tidak lengkap' });
    if (pesan.length > 4096) return res.status(400).json({ status: 'error', msg: 'Pesan terlalu panjang (maks 4096 karakter)' });
    const client = getReadyClient(accountId);
    if (!client) return res.status(503).json({ status: 'error', msg: 'Tidak ada akun WA yang siap' });
    await client.sendMessage(`${to}@c.us`, pesan.trim());
    const usedEntry = (accountId && global.clientsMap[accountId]?.status === 'ready')
      ? global.clientsMap[accountId]
      : Object.values(global.clientsMap).find(a => a.status === 'ready');
    saveSentMessage({
      ts: Date.now(),
      id: `srv_reply_${Date.now()}_${to}`,
      to, toName: '',
      body: pesan.trim(),
      accountId:    usedEntry?.id    || '',
      accountLabel: usedEntry?.label || '',
    });
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[/reply]', err);
    res.status(500).json({ status: 'error', msg: 'Terjadi kesalahan server' });
  }
});

// DELETE /cache
router.delete('/cache', (req, res) => {
  try {
    const p = path.join(ROOT, '.wwebjs_cache');
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    res.json({ status: 'ok', msg: 'Cache browser WA berhasil dihapus' });
  } catch (err) {
    console.error('[/cache]', err);
    res.status(500).json({ status: 'error', msg: 'Terjadi kesalahan server' });
  }
});

// DELETE /hasil
router.delete('/hasil', (req, res) => {
  try {
    if (fs.existsSync(HASIL_DIR)) {
      fs.readdirSync(HASIL_DIR).forEach(f => fs.unlinkSync(path.join(HASIL_DIR, f)));
    }
    ['hasil.json', 'hasil.xlsx', 'hasil.txt'].forEach(f => {
      const p = path.join(ROOT, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    res.json({ status: 'ok', msg: 'File output berhasil dihapus' });
  } catch (err) {
    console.error('[/hasil]', err);
    res.status(500).json({ status: 'error', msg: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
