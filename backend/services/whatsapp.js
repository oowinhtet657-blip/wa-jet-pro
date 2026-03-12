const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const { ROOT, ACCOUNTS_FILE, CHROME_PATH } = require('../config');
const { loadInboxCache, saveInboxCache } = require('./chatHistory');

global.clientsMap    = global.clientsMap    || {};
global.inboxMessages = (global.inboxMessages && global.inboxMessages.length)
  ? global.inboxMessages
  : loadInboxCache();

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadAccountsList() {
  try { return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveAccountsList() {
  const list = Object.values(global.clientsMap).map(a => ({ id: a.id, label: a.label }));
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(list, null, 2));
}

// ─── Client Factory ────────────────────────────────────────────────────────────

function createClient(id, label) {
  const sessionPath = path.join(ROOT, `_session_${id}`);

  const instance = new Client({
    authStrategy: new LocalAuth({ clientId: id, dataPath: sessionPath }),
    puppeteer: {
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    },
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
      entry.phone    = info ? info.wid.user      : '';
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
      const chat    = await msg.getChat();
      const msgEntry = {
        ts:           Date.now(),
        id:           msg.id._serialized,
        accountId:    id,
        accountLabel: label,
        accountPhone: entry.phone    || '',
        accountName:  entry.pushname || '',
        from:         contact.id.user || msg.from.replace(/@c\.us|@g\.us|@lid/g, ''),
        name:         contact.pushname || contact.name || '',
        isGroup:      chat.isGroup,
        groupName:    chat.isGroup ? chat.name : '',
        body:         msg.body,
        type:         msg.type,
      };
      global.inboxMessages.unshift(msgEntry);
      if (global.inboxMessages.length > 500) global.inboxMessages.pop();
      saveInboxCache(global.inboxMessages);
      console.log(`📩 [${label}] Dari ${msgEntry.from}: ${msgEntry.body.slice(0, 60)}`);
    } catch {}
  });

  instance.initialize();
  console.log(`🔧 Inisialisasi akun [${label}]...`);
  return entry;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getReadyClient(accountId) {
  if (accountId && global.clientsMap[accountId]) {
    const a = global.clientsMap[accountId];
    return a.status === 'ready' ? a.instance : null;
  }
  const found = Object.values(global.clientsMap).find(a => a.status === 'ready');
  return found ? found.instance : null;
}

module.exports = { createClient, getReadyClient, loadAccountsList, saveAccountsList };
