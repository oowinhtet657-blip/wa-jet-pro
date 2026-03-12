const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { getReadyClient } = require('../services/whatsapp');
const { ROOT } = require('../config');

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
    const { nomor, accountId } = req.body;
    if (!nomor) return res.status(400).json({ status: 'error', msg: 'Nomor kosong' });

    const lines = nomor.split(/[\n,;\t]+/)
      .map(n => normalizeNumber(n))
      .filter(n => n && isValidIndonesianMobile(n));

    if (lines.length === 0) return res.status(400).json({ status: 'error', msg: 'Tidak ada nomor valid' });
    if (lines.length > 100) return res.status(400).json({ status: 'error', msg: 'Maks 100 nomor per request' });

    const client = getReadyClient(accountId);
    if (!client) return res.status(503).json({ status: 'error', msg: 'Tidak ada akun WA yang siap' });

    fs.writeFileSync(path.join(ROOT, 'numbers.json'), JSON.stringify(lines, null, 2));
    console.log(`▶️ Mulai cek ${lines.length} nomor...`);

    const cekNomor = require('../bot');
    const hasil = await cekNomor(client);
    res.json({ status: 'ok', data: hasil });
  } catch (err) {
    console.error('[/cek]', err);
    res.status(500).json({ status: 'error', msg: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
