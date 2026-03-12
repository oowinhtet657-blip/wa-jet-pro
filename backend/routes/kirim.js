const { Router } = require('express');
const { getReadyClient } = require('../services/whatsapp');
const { saveSentMessage } = require('../services/chatHistory');

const router = Router();

function normalizeNumber(raw) {
  let num = raw.replace(/[^0-9]/g, '');
  if (!num) return null;
  if (num.startsWith('0')) num = '62' + num.slice(1);
  else if (num.startsWith('8') && num.length >= 10 && num.length <= 13) num = '62' + num;
  return num;
}
function isValidIndonesianMobile(num) {
  return /^628[0-9]{8,11}$/.test(num);
}
router.post('/', async (req, res) => {
  try {
    const { nomor, pesan, accountId } = req.body;
    if (!nomor) return res.status(400).json({ status: 'error', msg: 'Nomor kosong' });
    if (!pesan || !pesan.trim()) return res.status(400).json({ status: 'error', msg: 'Pesan kosong' });
    if (pesan.length > 4096) return res.status(400).json({ status: 'error', msg: 'Pesan terlalu panjang (maks 4096 karakter)' });

    const client = getReadyClient(accountId);
    if (!client) return res.status(503).json({ status: 'error', msg: 'Tidak ada akun WA yang siap' });
    const usedEntry = (accountId && global.clientsMap[accountId]?.status === 'ready')
      ? global.clientsMap[accountId]
      : Object.values(global.clientsMap).find(a => a.status === 'ready');
    const usedLabel = usedEntry?.label || '';
    const usedId    = usedEntry?.id    || '';

    const lines = nomor.split(/[\n,;\t]+/)
      .map(n => normalizeNumber(n))
      .filter(n => n && isValidIndonesianMobile(n));

    if (lines.length === 0) return res.status(400).json({ status: 'error', msg: 'Tidak ada nomor valid' });
    if (lines.length > 100) return res.status(400).json({ status: 'error', msg: 'Maks 100 nomor per request' });

    const results = [];
    for (const num of lines) {
      try {
        await client.sendMessage(`${num}@c.us`, pesan.trim());
        results.push({ number: num, status: 'Terkirim' });
        saveSentMessage({
          ts: Date.now(),
          id: `srv_kirim_${Date.now()}_${num}`,
          to: num, toName: '',
          body: pesan.trim(),
          accountId: usedId,
          accountLabel: usedLabel,
        });
      } catch {
        results.push({ number: num, status: 'Gagal' });
      }
    }
    res.json({ status: 'ok', data: results });
  } catch (err) {
    console.error('[/kirim]', err);
    res.status(500).json({ status: 'error', msg: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
