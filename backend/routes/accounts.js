const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const { createClient, saveAccountsList } = require('../services/whatsapp');
const { ROOT } = require('../config');

const router = Router();
router.get('/', (req, res) => {
  const list = Object.values(global.clientsMap).map(a => ({
    id: a.id, label: a.label, status: a.status, phone: a.phone, hasQr: !!a.qr,
  }));
  res.json({ accounts: list });
});
router.post('/', (req, res) => {
  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ status: 'error', msg: 'Label akun wajib diisi' });
  if (label.length > 50) return res.status(400).json({ status: 'error', msg: 'Label terlalu panjang (maks 50 karakter)' });
  const id = 'acc_' + Date.now();
  createClient(id, label);
  res.json({ status: 'ok', id, label });
});
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const entry = global.clientsMap[id];
  if (!entry) return res.status(404).json({ status: 'error', msg: 'Akun tidak ditemukan' });
  try { await entry.instance.destroy(); } catch {}
  const sessionPath = path.join(ROOT, `_session_${id}`);
  if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
  delete global.clientsMap[id];
  saveAccountsList();
  console.log(`🗑️ Akun [${entry.label}] dihapus`);
  res.json({ status: 'ok' });
});
router.get('/:id/qr', (req, res) => {
  const entry = global.clientsMap[req.params.id];
  if (!entry) return res.status(404).json({ status: 'error', msg: 'Akun tidak ditemukan' });
  if (entry.status === 'ready') return res.json({ status: 'connected', phone: entry.phone });
  if (entry.qr) return res.json({ status: 'qr', qr: entry.qr });
  res.json({ status: 'waiting' });
});
router.post('/:id/disconnect', async (req, res) => {
  const entry = global.clientsMap[req.params.id];
  if (!entry) return res.status(404).json({ status: 'error', msg: 'Akun tidak ditemukan' });
  try { await entry.instance.logout(); entry.status = 'disconnected'; entry.qr = null; entry.phone = ''; } catch {}
  res.json({ status: 'ok' });
});
router.post('/:id/reconnect', (req, res) => {
  const entry = global.clientsMap[req.params.id];
  if (!entry) return res.status(404).json({ status: 'error', msg: 'Akun tidak ditemukan' });
  entry.status = 'connecting';
  entry.qr = null;
  try { entry.instance.initialize(); } catch {}
  res.json({ status: 'ok' });
});

module.exports = router;
