const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const KEY_FILE = path.join(ROOT, '.api_key');
let API_KEY = process.env.API_KEY || '';
if (!API_KEY) {
  if (fs.existsSync(KEY_FILE)) {
    API_KEY = fs.readFileSync(KEY_FILE, 'utf-8').trim();
  } else {
    API_KEY = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(KEY_FILE, API_KEY, { mode: 0o600 });
    console.log(`🔑 API Key baru dibuat → ${KEY_FILE}`);
  }
}

module.exports = {
  PORT: process.env.PORT || 3000,
  ROOT,
  HASIL_DIR:        path.join(ROOT, 'hasil'),
  ACCOUNTS_FILE:    path.join(ROOT, 'accounts.json'),
  INBOX_CACHE_FILE: path.join(ROOT, 'chat-inbox.json'),
  SENT_MSGS_FILE:   path.join(ROOT, 'chat-sent.json'),
  CHROME_PATH:   'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  API_KEY,
};
