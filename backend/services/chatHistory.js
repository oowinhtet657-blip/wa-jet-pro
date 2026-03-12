const fs   = require('fs');
const { INBOX_CACHE_FILE, SENT_MSGS_FILE } = require('../config');

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES  = 500;

function filterFresh(arr) {
  const cutoff = Date.now() - TWO_DAYS_MS;
  return arr.filter(m => m.ts > cutoff);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return []; }
}

function writeJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data)); }
  catch (e) { console.error('[chatHistory] write error:', e.message); }
}

function loadInboxCache() {
  return filterFresh(readJson(INBOX_CACHE_FILE));
}

let _inboxSaveTimer = null;
function saveInboxCache(messages) {
  clearTimeout(_inboxSaveTimer);
  _inboxSaveTimer = setTimeout(() => {
    writeJson(INBOX_CACHE_FILE, filterFresh(messages).slice(0, MAX_ENTRIES));
  }, 1500); // debounce 1.5s agar tidak I/O tiap pesan masuk
}

function loadSentMessages() {
  return filterFresh(readJson(SENT_MSGS_FILE));
}

function saveSentMessage(msg) {
  const arr = filterFresh(readJson(SENT_MSGS_FILE));
  // cegah duplikat berdasarkan id
  if (!arr.some(m => m.id === msg.id)) {
    arr.unshift(msg);
  }
  writeJson(SENT_MSGS_FILE, arr.slice(0, MAX_ENTRIES));
}

function runCleanup() {
  const inbox = filterFresh(readJson(INBOX_CACHE_FILE));
  writeJson(INBOX_CACHE_FILE, inbox);

  const sent = filterFresh(readJson(SENT_MSGS_FILE));
  writeJson(SENT_MSGS_FILE, sent);

  console.log(`🧹 Chat history cleanup: ${inbox.length} inbox, ${sent.length} sent (> 2 hari dihapus)`);
}

module.exports = { loadInboxCache, saveInboxCache, loadSentMessages, saveSentMessage, runCleanup };
