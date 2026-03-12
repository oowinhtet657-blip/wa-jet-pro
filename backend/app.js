const express = require('express');
const path = require('path');
const fs = require('fs');

const { PORT, ROOT, HASIL_DIR, API_KEY } = require('./config');
const { createClient, loadAccountsList } = require('./services/whatsapp');
const { runCleanup }                     = require('./services/chatHistory');
const authMiddleware                     = require('./middleware/auth');
const { defaultLimiter, strictLimiter }  = require('./middleware/rateLimiter');

const accountsRouter  = require('./routes/accounts');
const messagesRouter  = require('./routes/messages');
const cekRouter       = require('./routes/cek');
const kirimRouter     = require('./routes/kirim');
const systemRouter    = require('./routes/system');
1
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));

if (!fs.existsSync(HASIL_DIR)) {
  fs.mkdirSync(HASIL_DIR, { recursive: true });
  console.log("📁 Folder 'hasil' dibuat otomatis");
}

app.get('/api-key', defaultLimiter, (req, res) => {
  res.json({ key: API_KEY });
});

app.use(defaultLimiter);
app.use(authMiddleware);

app.use('/accounts', accountsRouter);
app.use('/messages', messagesRouter);
app.use('/cek',      strictLimiter, cekRouter);
app.use('/kirim',    strictLimiter, kirimRouter);
app.use('/',         systemRouter); 

app.listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Server berjalan di http://127.0.0.1:${PORT}`);
  console.log(`🔑 API Key: ${API_KEY}`);
});
setInterval(runCleanup, 60 * 60 * 1000);

const savedAccounts = loadAccountsList();
if (savedAccounts.length > 0) {
  console.log(`🔄 Memuat ${savedAccounts.length} akun tersimpan...`);
  savedAccounts.forEach(a => createClient(a.id, a.label));
} else {
  console.log('ℹ️  Belum ada akun. Tambah dari menu "Kelola Akun".');
}

process.on('SIGINT',  () => process.exit());
process.on('SIGTERM', () => process.exit());
