const express = require('express');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cekNomor = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Pastikan folder hasil ada
const folderPath = path.join(__dirname, 'hasil');
if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
  console.log("📁 Folder 'hasil' dibuat otomatis");
}

app.use(express.json());
app.use(express.static('public'));

// ====== MULTI-AKUN STATE ======
// clientsMap: { [id]: { id, label, instance, status, qr, phone } }
global.clientsMap = {};
global.inboxMessages = [];

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
function loadAccountsList() {
  try { return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8')); }
  catch { return []; }
}
function saveAccountsList() {
  const list = Object.values(global.clientsMap).map(a => ({ id: a.id, label: a.label }));
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(list, null, 2));
}

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

function createClient(id, label) {
  const sessionPath = path.join(__dirname, `_session_${id}`);
  const instance = new Client({
    authStrategy: new LocalAuth({ clientId: id, dataPath: sessionPath }),
    puppeteer: {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    }
  });

  const entry = { id, label, instance, status: 'connecting', qr: null, phone: '', pushname: '' };
  global.clientsMap[id] = entry;
  saveAccountsList();

  instance.on('qr', (qr) => {
    entry.qr = qr;
    entry.status = 'connecting';
    console.log(`\n📱 [${label}] QR siap — scan di browser`);
    qrcode.generate(qr, { small: true });
  });

  instance.on('ready', async () => {
    entry.status = 'ready';
    entry.qr = null;
    try {
      const info = instance.info;
      entry.phone = info ? info.wid.user : '';
      entry.pushname = info ? (info.pushname || '') : '';
    } catch {}
    console.log(`✅ [${label}] WA siap! (${entry.phone})`);
  });

  instance.on('auth_failure', () => {
    entry.status = 'disconnected';
    entry.qr = null;
    console.error(`❌ [${label}] Auth gagal`);
  });

  instance.on('disconnected', (reason) => {
    entry.status = 'disconnected';
    entry.qr = null;
    console.log(`⚠️ [${label}] Disconnected: ${reason}`);
  });

  instance.on('message', async (msg) => {
    try {
      const contact = await msg.getContact();
      const chat = await msg.getChat();
      const msgEntry = {
        ts: Date.now(),
        id: msg.id._serialized,
        accountId: id,
        accountLabel: label,
        accountPhone: entry.phone || '',
        accountName: entry.pushname || '',
        from: contact.id.user || msg.from.replace(/@c\.us|@g\.us|@lid/g, ''),
        name: contact.pushname || contact.name || '',
        isGroup: chat.isGroup,
        groupName: chat.isGroup ? chat.name : '',
        body: msg.body,
        type: msg.type
      };
      global.inboxMessages.unshift(msgEntry);
      if (global.inboxMessages.length > 200) global.inboxMessages.pop();
      console.log(`📩 [${label}] Dari ${msgEntry.from}: ${msgEntry.body.slice(0, 60)}`);
    } catch {}
  });

  instance.initialize();
  console.log(`🔧 Inisialisasi akun [${label}]...`);
  return entry;
}

function getReadyClient(accountId) {
  if (accountId && global.clientsMap[accountId]) {
    const a = global.clientsMap[accountId];
    return a.status === 'ready' ? a.instance : null;
  }
  const found = Object.values(global.clientsMap).find(a => a.status === 'ready');
  return found ? found.instance : null;
}

// ====== ACCOUNTS API ======
app.get('/accounts', (req, res) => {
  const list = Object.values(global.clientsMap).map(a => ({
    id: a.id, label: a.label, status: a.status, phone: a.phone, hasQr: !!a.qr
  }));
  res.json({ accounts: list });
});

app.post('/accounts', (req, res) => {
  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ status: 'error', msg: 'Label akun wajib diisi' });
  const id = 'acc_' + Date.now();
  createClient(id, label);
  res.json({ status: 'ok', id, label });
});

app.delete('/accounts/:id', async (req, res) => {
  const { id } = req.params;
  const entry = global.clientsMap[id];
  if (!entry) return res.status(404).json({ status: 'error', msg: 'Akun tidak ditemukan' });
  try { await entry.instance.destroy(); } catch {}
  const sessionPath = path.join(__dirname, `_session_${id}`);
  if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
  delete global.clientsMap[id];
  saveAccountsList();
  console.log(`🗑️ Akun [${entry.label}] dihapus`);
  res.json({ status: 'ok' });
});

app.get('/accounts/:id/qr', (req, res) => {
  const entry = global.clientsMap[req.params.id];
  if (!entry) return res.status(404).json({ status: 'error', msg: 'Akun tidak ditemukan' });
  if (entry.status === 'ready') return res.json({ status: 'connected', phone: entry.phone });
  if (entry.qr) return res.json({ status: 'qr', qr: entry.qr });
  res.json({ status: 'waiting' });
});

app.post('/accounts/:id/disconnect', async (req, res) => {
  const entry = global.clientsMap[req.params.id];
  if (!entry) return res.status(404).json({ status: 'error', msg: 'Akun tidak ditemukan' });
  try { await entry.instance.logout(); entry.status = 'disconnected'; entry.qr = null; entry.phone = ''; } catch {}
  res.json({ status: 'ok' });
});

app.post('/accounts/:id/reconnect', (req, res) => {
  const entry = global.clientsMap[req.params.id];
  if (!entry) return res.status(404).json({ status: 'error', msg: 'Akun tidak ditemukan' });
  entry.status = 'connecting'; entry.qr = null;
  try { entry.instance.initialize(); } catch {}
  res.json({ status: 'ok' });
});

// ====== STATUS (compat) ======
app.get('/status', (req, res) => {
  const accounts = Object.values(global.clientsMap);
  const readyCount = accounts.filter(a => a.status === 'ready').length;
  res.json({ connected: readyCount > 0, readyCount, totalAccounts: accounts.length });
});

// ====== MESSAGES ======
app.get('/messages', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const accountId = req.query.accountId || null;
  let msgs = global.inboxMessages.filter(m => m.ts > since);
  if (accountId) msgs = msgs.filter(m => m.accountId === accountId);
  res.json({ messages: msgs });
});

app.delete('/messages', (req, res) => {
  global.inboxMessages = [];
  res.json({ status: 'ok' });
});

// ====== QR (compat - akun pertama) ======
app.get('/qr', (req, res) => {
  const accounts = Object.values(global.clientsMap);
  if (accounts.length === 0) return res.json({ status: 'waiting' });
  const first = accounts[0];
  if (first.status === 'ready') return res.json({ status: 'connected' });
  if (first.qr) return res.json({ status: 'qr', qr: first.qr });
  res.json({ status: 'waiting' });
});

// ====== REPLY ======
app.post('/reply', async (req, res) => {
  try {
    const { to, pesan, accountId } = req.body;
    if (!to || !pesan) return res.status(400).json({ status: 'error', msg: 'Parameter tidak lengkap' });
    const client = getReadyClient(accountId);
    if (!client) return res.status(503).json({ status: 'error', msg: 'Tidak ada akun WA yang siap' });
    await client.sendMessage(`${to}@c.us`, pesan.trim());
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', msg: err.message });
  }
});

// ====== DISCONNECT (compat) ======
app.post('/disconnect', async (req, res) => {
  const { accountId } = req.body || {};
  if (accountId && global.clientsMap[accountId]) {
    try { await global.clientsMap[accountId].instance.logout(); global.clientsMap[accountId].status = 'disconnected'; } catch {}
  }
  res.json({ status: 'ok' });
});

// ====== CACHE & HASIL ======
app.delete('/cache', (req, res) => {
  try {
    const p = path.join(__dirname, '.wwebjs_cache');
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    res.json({ status: 'ok', msg: 'Cache browser WA berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ status: 'error', msg: err.message });
  }
});

app.delete('/hasil', (req, res) => {
  try {
    const dir = path.join(__dirname, 'hasil');
    if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => fs.unlinkSync(path.join(dir, f)));
    ['hasil.json', 'hasil.xlsx', 'hasil.txt'].forEach(f => {
      const p = path.join(__dirname, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    res.json({ status: 'ok', msg: 'File output berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ status: 'error', msg: err.message });
  }
});

// ====== CEK ======
app.post('/cek', async (req, res) => {
  try {
    const { nomor, accountId } = req.body;
    if (!nomor) return res.status(400).json({ status: 'error', msg: 'Nomor kosong' });
    const lines = nomor.split(/[\n,;\t]+/).map(n => normalizeNumber(n)).filter(n => n && isValidIndonesianMobile(n));
    if (lines.length === 0) return res.status(400).json({ status: 'error', msg: 'Tidak ada nomor valid' });
    const client = getReadyClient(accountId);
    if (!client) return res.status(503).json({ status: 'error', msg: 'Tidak ada akun WA yang siap' });
    fs.writeFileSync('numbers.json', JSON.stringify(lines, null, 2));
    console.log(`▶️ Mulai cek ${lines.length} nomor...`);
    const hasil = await cekNomor(client);
    res.json({ status: 'ok', data: hasil });
  } catch (err) {
    res.status(500).json({ status: 'error', msg: err.message });
  }
});

// ====== KIRIM ======
app.post('/kirim', async (req, res) => {
  try {
    const { nomor, pesan, accountId } = req.body;
    if (!nomor) return res.status(400).json({ status: 'error', msg: 'Nomor kosong' });
    if (!pesan || !pesan.trim()) return res.status(400).json({ status: 'error', msg: 'Pesan kosong' });
    const client = getReadyClient(accountId);
    if (!client) return res.status(503).json({ status: 'error', msg: 'Tidak ada akun WA yang siap' });
    const lines = nomor.split(/[\n,;\t]+/).map(n => normalizeNumber(n)).filter(n => n && isValidIndonesianMobile(n));
    if (lines.length === 0) return res.status(400).json({ status: 'error', msg: 'Tidak ada nomor valid' });
    const results = [];
    for (const num of lines) {
      try {
        await client.sendMessage(`${num}@c.us`, pesan.trim());
        results.push({ number: num, status: 'Terkirim' });
      } catch {
        results.push({ number: num, status: 'Gagal' });
      }
    }
    res.json({ status: 'ok', data: results });
  } catch (err) {
    res.status(500).json({ status: 'error', msg: err.message });
  }
});

// ====== START ======
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running di http://127.0.0.1:${PORT}`);
});

const savedAccounts = loadAccountsList();
if (savedAccounts.length > 0) {
  console.log(`🔄 Memuat ${savedAccounts.length} akun tersimpan...`);
  savedAccounts.forEach(a => createClient(a.id, a.label));
} else {
  console.log('ℹ️  Belum ada akun. Tambah dari menu "Kelola Akun".');
}

process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());