const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cekNomor = require('./bot');
const app = express();
const PORT = process.env.PORT || 3000; // Render pakai port dari env

// Pastikan folder hasil ada
const folderPath = path.join(__dirname, 'hasil');
if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
  console.log("📁 Folder 'hasil' dibuat otomatis");
}

app.use(express.json());
app.use(express.static('public'));

// Fungsi normalisasi nomor HP
function normalizeNumber(raw) {
  let num = raw.replace(/[^0-9]/g, '');
  if (!num) return null;
  // 08xx -> 628xx
  if (num.startsWith('0')) num = '62' + num.slice(1);
  // 8xx (tanpa awalan) -> 628xx
  else if (num.startsWith('8') && num.length >= 10 && num.length <= 13) num = '62' + num;
  return num;
}

// Validasi nomor HP Indonesia (62 + 8xx + 9-12 digit = total 11-14 digit)
function isValidIndonesianMobile(num) {
  return /^628[0-9]{8,11}$/.test(num);
}

global.currentQr = null;
global.inboxMessages = [];

app.get('/status', (req, res) => {
  res.json({ connected: !!global.client, hasQr: !!global.currentQr });
});

app.get('/messages', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const msgs = global.inboxMessages.filter(m => m.ts > since);
  res.json({ messages: msgs });
});

app.delete('/messages', (req, res) => {
  global.inboxMessages = [];
  res.json({ status: 'ok' });
});

app.get('/qr', (req, res) => {
  if (global.client) return res.json({ status: 'connected' });
  if (!global.currentQr) return res.json({ status: 'waiting' });
  res.json({ status: 'qr', qr: global.currentQr });
});

app.post('/reply', async (req, res) => {
  try {
    const { to, pesan } = req.body;
    if (!to || !pesan) return res.status(400).json({ status: 'error', msg: 'Parameter tidak lengkap' });
    if (!global.client) return res.status(503).json({ status: 'error', msg: 'WA client belum siap' });
    await global.client.sendMessage(`${to}@c.us`, pesan.trim());
    console.log(`✅ Balas ke ${to}: ${pesan.slice(0, 60)}`);
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('❌ Gagal balas:', err.message);
    res.status(500).json({ status: 'error', msg: err.message });
  }
});

app.post('/disconnect', async (req, res) => {
  try {
    if (global.client) {
      await waClient.logout();
      global.client = null;
      global.currentQr = null;
    }
    res.json({ status: 'ok' });
  } catch (err) {
    res.json({ status: 'ok' });
  }
});

app.post('/cek', async (req, res) => {
  try {
    const raw = req.body.nomor;
    if (!raw) return res.status(400).json({ status: 'error', msg: 'Nomor kosong' });

    // Pisahkan berdasarkan newline, koma, semicolon, atau tab
    const lines = raw
      .split(/[\n,;\t]+/)
      .map(n => normalizeNumber(n))
      .filter(n => n && isValidIndonesianMobile(n));

    fs.writeFileSync('numbers.json', JSON.stringify(lines, null, 2));

    console.log(`▶️ Mulai cek ${lines.length} nomor...`);
    const hasil = await cekNomor(global.client);

    res.json({ status: 'ok', data: hasil });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ status: 'error', msg: err.message });
  }
});

app.post('/kirim', async (req, res) => {
  try {
    const { nomor, pesan } = req.body;
    if (!nomor) return res.status(400).json({ status: 'error', msg: 'Nomor kosong' });
    if (!pesan || !pesan.trim()) return res.status(400).json({ status: 'error', msg: 'Pesan kosong' });
    if (!global.client) return res.status(503).json({ status: 'error', msg: 'WA client belum siap' });

    const lines = nomor
      .split(/[\n,;\t]+/)
      .map(n => normalizeNumber(n))
      .filter(n => n && isValidIndonesianMobile(n));

    if (lines.length === 0) return res.status(400).json({ status: 'error', msg: 'Tidak ada nomor valid' });

    console.log(`📤 Kirim pesan ke ${lines.length} nomor...`);
    const results = [];

    for (const num of lines) {
      try {
        await global.client.sendMessage(`${num}@c.us`, pesan.trim());
        results.push({ number: num, status: 'Terkirim' });
        console.log(`✅ Terkirim: ${num}`);
      } catch (err) {
        results.push({ number: num, status: 'Gagal' });
        console.error(`❌ Gagal kirim ke ${num}:`, err.message);
      }
    }

    res.json({ status: 'ok', data: results });
  } catch (err) {
    console.error('❌ Error kirim:', err.message);
    res.status(500).json({ status: 'error', msg: err.message });
  }
});

const waClient = new Client({
  authStrategy: new LocalAuth({ dataPath: './_IGNORE_session' }),
  puppeteer: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  }
});

waClient.on('message', async (msg) => {
  try {
    const contact = await msg.getContact();
    const chat = await msg.getChat();
    const entry = {
      ts: Date.now(),
      id: msg.id._serialized,
      from: contact.id.user || msg.from.replace(/@c\.us|@g\.us|@lid/g, ''),
      name: contact.pushname || contact.name || '',
      isGroup: chat.isGroup,
      groupName: chat.isGroup ? chat.name : '',
      body: msg.body,
      type: msg.type
    };
    global.inboxMessages.unshift(entry);
    if (global.inboxMessages.length > 200) global.inboxMessages.pop();
    console.log(`📩 Pesan dari ${entry.from}: ${entry.body.slice(0, 60)}`);
  } catch (e) {}
});

waClient.on('qr', (qr) => {
  global.currentQr = qr;
  console.log('\n📱 QR tersedia di http://localhost:' + PORT + ' — buka halaman Connect WA');
  qrcode.generate(qr, { small: true });
});

waClient.on('ready', () => {
  global.client = waClient;
  global.currentQr = null;
  console.log('✅ WA Client siap!');
});

waClient.on('auth_failure', (msg) => {
  global.currentQr = null;
  console.error('❌ Auth gagal:', msg);
});

waClient.on('disconnected', (reason) => {
  console.log('⚠️ WA Client disconnected:', reason);
  global.client = null;
  global.currentQr = null;
  waClient.initialize();
});

app.listen(PORT, () => {
  console.log(`✅ Server running di http://localhost:${PORT}`);
});

waClient.initialize();

function cleanup() {
  // Bersihkan folder hasil
  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      try {
        fs.unlinkSync(fullPath);
        console.log(`🧹 Hapus: ${file}`);
      } catch (err) {
        console.error(`❌ Gagal hapus ${file}:`, err.message);
      }
    }
  }

  
  // Hapus file hasil lain
  const filesToDelete = ['numbers.json', 'hasil.json', 'hasil.xlsx', 'hasil.txt'];
  filesToDelete.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Hapus: ${file}`);
    }
  });

  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
