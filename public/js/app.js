// ─── API Key Interceptor ─────────────────────────────────────────────────────
// Semua fetch otomatis menunggu API key siap, lalu menyertakan X-API-Key header
let _API_KEY = '';
const _realFetch = window.fetch.bind(window);
let _keyReady = false;
let _keyPromise = null;
window.fetch = async function(url, opts) {
  if (!_keyReady) await _keyPromise;
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers, { 'X-API-Key': _API_KEY });
  return _realFetch(url, opts);
};
async function initApiKey() {
  try {
    const r = await _realFetch('/api-key');
    const d = await r.json();
    _API_KEY = d.key || '';
  } catch {}
  _keyReady = true;
}
_keyPromise = initApiKey();

function normalizeNumber(raw) {
  let num = raw.replace(/[^0-9]/g, '');
  if (!num) return null;
  if (num.startsWith('0')) num = '62' + num.slice(1);
  else if (num.startsWith('8') && num.length >= 10 && num.length <= 13) num = '62' + num;
  return num;
}
function isValidIndonesianMobile(num) { return /^628[0-9]{8,11}$/.test(num); }
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
function fmtTime(ts) { return new Date(ts).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }

function updateClock() {
  document.getElementById('topbarTime').textContent = new Date().toLocaleString('id-ID', {
    weekday:'short', day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
}
updateClock(); setInterval(updateClock, 1000);

async function checkWaStatus() {
  try {
    const res = await fetch('/status');
    const data = await res.json();
    const dot = document.getElementById('sidebarDot');
    const lbl = document.getElementById('sidebarStatus');
    const badge = document.getElementById('waBadge');
    if (data.connected) {
      dot.classList.add('online');
      lbl.textContent = data.readyCount > 1 ? `${data.readyCount} Akun` : 'Connected';
      badge.className = 'wa-badge connected';
      badge.textContent = data.readyCount > 1 ? `✓ ${data.readyCount} Akun Aktif` : '✓ WA Terhubung';
    } else {
      dot.classList.remove('online'); lbl.textContent = 'Disconnected';
      badge.className = 'wa-badge'; badge.textContent = '⚡ Menunggu WA...';
    }
  } catch {}
}
checkWaStatus(); setInterval(checkWaStatus, 5000);

let qrInterval = null;

async function loadQr() {
  try {
    const res = await fetch('/qr');
    const data = await res.json();
    const stateOnline = document.getElementById('connectStateOnline');
    const stateQr = document.getElementById('connectStateQr');
    const stateWaiting = document.getElementById('connectStateWaiting');

    if (data.status === 'connected') {
      stateOnline.style.display = 'block';
      stateQr.style.display = 'none';
      stateWaiting.style.display = 'none';
      if (qrInterval) { clearInterval(qrInterval); qrInterval = null; }
    } else if (data.status === 'qr' && data.qr) {
      stateOnline.style.display = 'none';
      stateWaiting.style.display = 'none';
      stateQr.style.display = 'block';
      renderQr(data.qr);
    } else {
      stateOnline.style.display = 'none';
      stateQr.style.display = 'none';
      stateWaiting.style.display = 'block';
    }
  } catch {}
}

function renderQr(qrString) {
  if (typeof QRCode === 'undefined') return;
  const canvas = document.getElementById('qrCanvas');
  QRCode.toCanvas(canvas, qrString, { width: 240, margin: 0, color: { dark: '#000000', light: '#ffffff' } });
}

document.getElementById('refreshQrBtn').addEventListener('click', loadQr);

document.getElementById('disconnectBtn').addEventListener('click', async () => {
  try {
    await fetch('/disconnect', { method: 'POST' });
    showToast('Koneksi WA diputus');
    loadQr();
  } catch { showToast('Gagal memutus koneksi'); }
});

document.getElementById('btnCleanCache').addEventListener('click', async () => {
  if (!confirm('Hapus .wwebjs_cache? Server akan menghapus cache browser WA.\n(WA tidak perlu scan QR ulang)')) return;
  try {
    const r = await fetch('/cache', { method: 'DELETE' });
    const d = await r.json();
    showToast(d.status === 'ok' ? '✅ ' + d.msg : '❌ ' + d.msg);
  } catch { showToast('❌ Gagal menghapus cache'); }
});

document.getElementById('btnCleanHasil').addEventListener('click', async () => {
  if (!confirm('Hapus semua file hasil? Aksi ini tidak bisa dibatalkan.')) return;
  try {
    const r = await fetch('/hasil', { method: 'DELETE' });
    const d = await r.json();
    showToast(d.status === 'ok' ? '✅ ' + d.msg : '❌ ' + d.msg);
  } catch { showToast('❌ Gagal menghapus file hasil'); }
});

document.getElementById('btnCleanInbox').addEventListener('click', async () => {
  if (!confirm('Kosongkan inbox? Pesan yang sudah masuk akan dihapus dari tampilan.')) return;
  try {
    await fetch('/messages', { method: 'DELETE' });
    inboxAll = []; inboxLastTs = 0; inboxUnread = 0;
    renderInbox();
    const badge = document.getElementById('inboxBadge');
    if (badge) badge.style.display = 'none';
    showToast('✅ Inbox dikosongkan');
  } catch { showToast('❌ Gagal mengosongkan inbox'); }
});

document.getElementById('btnResetStats').addEventListener('click', () => {
  if (!confirm('Reset semua statistik & riwayat dashboard?')) return;
  localStorage.removeItem('wa_stats');
  localStorage.removeItem('wa_hist_cek');
  localStorage.removeItem('wa_hist_kirim');
  renderDashboard();
  showToast('✅ Statistik direset');
});

let inboxInterval = null;
let inboxLastTs = 0;
let inboxUnread = 0;
let inboxAll = [];

function fmtMsg(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' }) + ' ' +
         d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function renderInbox() {
  const body = document.getElementById('inboxBody');
  const empty = document.getElementById('inboxEmpty');
  const wrap = document.getElementById('inboxTableWrap');
  if (!body) return;
  if (inboxAll.length === 0) {
    empty.style.display = 'block'; wrap.style.display = 'none'; return;
  }
  empty.style.display = 'none'; wrap.style.display = 'block';
  body.innerHTML = inboxAll.map((m, i) => {
    const replied = repliedIds.has(m.id);
    const rowStyle = replied ? 'opacity:0.55;' : '';
    const from = m.name
      ? `<span style="color:var(--text-bright);font-weight:600;">${m.name}</span><br><span style="font-size:0.7rem;color:var(--accent);">+${m.from}</span>`
      : `<span style="color:var(--accent);font-weight:600;">+${m.from}</span>`;
    const groupTag = m.isGroup ? `<span style="display:inline-block;font-size:0.6rem;background:rgba(124,92,191,0.15);color:var(--accent2);border:1px solid rgba(124,92,191,0.25);border-radius:3px;padding:0 4px;margin-right:4px;">${m.groupName}</span>` : '';
    const bodyText = m.type !== 'chat' ? `<em style="color:var(--text-dim);">[${m.type}]</em>` : m.body.replace(/</g,'&lt;');
    const toAkun = m.accountLabel
      ? (m.accountName
        ? `<span style="color:var(--text-bright);font-weight:600;">${m.accountName}</span><br><span style="font-size:0.7rem;color:var(--success);">+${m.accountPhone || m.accountLabel}</span>`
        : `<span style="color:var(--success);font-weight:600;">+${m.accountPhone || m.accountLabel}</span>`)
      : `<span style="font-size:0.7rem;color:var(--text-dim);">—</span>`;
    const replyBtn = replied
      ? `<span style="font-size:0.65rem;color:var(--success);padding:0.25rem 0.5rem;">✓ Dibalas</span>`
      : `<button class="btn btn-ghost reply-btn" data-idx="${i}" style="font-size:0.65rem;padding:0.25rem 0.5rem;white-space:nowrap;">&#8617; Balas</button>`;
    return `<tr style="${rowStyle}">
      <td style="font-size:0.7rem;color:var(--text-dim);white-space:nowrap;">${fmtMsg(m.ts)}</td>
      <td style="min-width:120px;">${from}</td>
      <td style="font-size:0.8125rem;word-break:break-word;">${groupTag}${bodyText}</td>
      <td style="white-space:nowrap;">${toAkun}</td>
      <td>${replyBtn}</td>
    </tr>`;
  }).join('');

  body.querySelectorAll('.reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = inboxAll[parseInt(btn.dataset.idx)];
      if (m) openReplyModal(m.from, m.name || '', m.body, m.id);
    });
  });
}

async function pollInbox() {
  try {
    const res = await fetch('/messages?since=' + inboxLastTs);
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      inboxAll = [...data.messages, ...inboxAll].slice(0, 200);
     
      const seen = new Set(); inboxAll = inboxAll.filter(m => { if(seen.has(m.id)){return false;} seen.add(m.id); return true; });
      inboxLastTs = inboxAll[0].ts;
      const activePage = document.querySelector('.page.active');
      if (activePage?.id === 'page-pesan') {
        renderInbox();
      } else if (activePage?.id === 'page-chat') {
        renderChatList();
        if (activeChatPhone && data.messages.some(m => m.from === activeChatPhone)) {
          const ct = buildChatContacts()[activeChatPhone];
          if (ct) renderChatThread(ct);
        }
      } else {
        inboxUnread += data.messages.length;
        const badge = document.getElementById('inboxBadge');
        if (badge) { badge.style.display = 'inline-block'; badge.textContent = inboxUnread > 99 ? '99+' : inboxUnread; }
      }
    }
  } catch {}
}

setInterval(pollInbox, 3000);

let replyTarget = null;
let replyTargetId = null;
let replyTargetName = null;
const repliedIds = new Set();
let activeChatPhone = null;
let sentMessages = [];

// Load sent messages history dari server (persist 2 hari)
async function loadSentHistory() {
  try {
    const res = await fetch('/messages/sent');
    const d   = await res.json();
    if (Array.isArray(d.messages) && d.messages.length > 0) {
      // Gabung dengan sesi ini, dedup by id
      const existingIds = new Set(sentMessages.map(m => m.id));
      const fresh = d.messages.filter(m => !existingIds.has(m.id));
      sentMessages = [...sentMessages, ...fresh];
      sentMessages.sort((a, b) => a.ts - b.ts);
      // Re-render chat jika sudah terbuka
      if (activeChatPhone) {
        const ct = buildChatContacts()[activeChatPhone];
        if (ct) { renderChatList(); renderChatThread(ct); }
      }
    }
  } catch {}
}

function openReplyModal(from, name, quote, msgId) {
  replyTarget = from;
  replyTargetId = msgId || null;
  replyTargetName = name || null;
  document.getElementById('replyTo').innerHTML = `Membalas ke: <span style="color:var(--accent);font-weight:600;">+${from}</span>${name ? ` <span style="color:var(--text-dim)">(${name})</span>` : ''}`;
  document.getElementById('replyQuote').textContent = quote.slice(0, 120);
  document.getElementById('replyText').value = '';
  const modal = document.getElementById('replyModal');
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('replyText').focus(), 50);
}

function closeReplyModal() {
  document.getElementById('replyModal').style.display = 'none';
  replyTarget = null;
  replyTargetId = null;
  replyTargetName = null;
}

document.getElementById('sendReplyBtn').addEventListener('click', async () => {
  const pesan = document.getElementById('replyText').value.trim();
  if (!pesan) return showToast('Tulis pesan dahulu');
  if (!replyTarget) return;
  const btn = document.getElementById('sendReplyBtn');
  const sp = document.getElementById('replySpinner');
  btn.disabled = true; sp.style.display = 'inline-block';
  try {
    const res = await fetch('/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: replyTarget, pesan, accountId: document.getElementById('replyAccountId')?.value || undefined })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      const _rAccId = document.getElementById('replyAccountId')?.value || '';
      const _rAccLabel = document.getElementById('replyAccountId')?.selectedOptions[0]?.text || 'Akun Kamu';
      sentMessages.push({ ts:Date.now(), id:'sreply_'+Date.now(), to:replyTarget, toName:replyTargetName||'', body:pesan, accountId:_rAccId, accountLabel:_rAccLabel });
      if (replyTargetId) { repliedIds.add(replyTargetId); renderInbox(); }
      showToast('Balasan terkirim!');
      closeReplyModal();
    } else {
      showToast('Gagal: ' + (data.msg || 'error'));
    }
  } catch { showToast('Koneksi error'); }
  btn.disabled = false; sp.style.display = 'none';
});

document.getElementById('refreshInboxBtn').addEventListener('click', () => { inboxLastTs = 0; inboxAll = []; pollInbox().then(renderInbox); });
document.getElementById('clearInboxBtn').addEventListener('click', async () => {
  try {
    await fetch('/messages', { method: 'DELETE' });
    inboxAll = []; inboxLastTs = 0; inboxUnread = 0;
    const badge = document.getElementById('inboxBadge');
    if (badge) badge.style.display = 'none';
    renderInbox();
    showToast('Pesan dihapus');
  } catch { showToast('Gagal menghapus'); }
});

function getStats() { return JSON.parse(localStorage.getItem('wa_stats') || '{"totalCek":0,"terdaftar":0,"tidak":0,"kirim":0}'); }
function saveStats(s) { localStorage.setItem('wa_stats', JSON.stringify(s)); }
function getHistCek() { return JSON.parse(localStorage.getItem('wa_hist_cek') || '[]'); }
function getHistKirim() { return JSON.parse(localStorage.getItem('wa_hist_kirim') || '[]'); }

function renderDashboard() {
  const s = getStats();
  document.getElementById('statTotalCek').textContent = s.totalCek;
  document.getElementById('statTerdaftar').textContent = s.terdaftar;
  document.getElementById('statTidak').textContent = s.tidak;
  document.getElementById('statKirim').textContent = s.kirim;

  const hc = getHistCek();
  const hcBody = document.getElementById('histCekBody');
  hcBody.innerHTML = hc.length === 0
    ? '<tr><td colspan="4" class="empty-state">Belum ada riwayat</td></tr>'
    : hc.slice().reverse().slice(0, 10).map(h => `<tr>
        <td style="color:var(--text-dim)">${fmtTime(h.ts)}</td>
        <td>${h.total}</td>
        <td style="color:var(--success)">${h.terdaftar}</td>
        <td style="color:var(--danger)">${h.tidak}</td>
      </tr>`).join('');

  const hk = getHistKirim();
  const hkBody = document.getElementById('histKirimBody');
  hkBody.innerHTML = hk.length === 0
    ? '<tr><td colspan="4" class="empty-state">Belum ada riwayat</td></tr>'
    : hk.slice().reverse().slice(0, 10).map(h => `<tr>
        <td style="color:var(--text-dim)">${fmtTime(h.ts)}</td>
        <td>${h.total}</td>
        <td style="color:var(--accent)">${h.terkirim}</td>
        <td style="color:var(--danger)">${h.gagal}</td>
      </tr>`).join('');
}
renderDashboard();
const pageNames = { dashboard:'Dashboard', rapih:'Rapihkan Nomor', cek:'Check WA', kirim:'Kirim Pesan', connect:'Connect WA', pesan:'Pesan Masuk', akun:'Kelola Akun', chat:'Chat' };
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const page = item.dataset.page;
    const el = document.getElementById('page-' + page);
    if (!el) return;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('topbarTitle').textContent = pageNames[page];
    if (page === 'dashboard') renderDashboard();
    if (page === 'connect') {
      loadQr();
      clearInterval(qrInterval);
      qrInterval = setInterval(loadQr, 3000);
    } else {
      clearInterval(qrInterval);
      qrInterval = null;
    }
    if (page === 'pesan') {
      inboxUnread = 0;
      const badge = document.getElementById('inboxBadge');
      if (badge) badge.style.display = 'none';
      renderInbox();
    }
    if (page === 'chat') {
      renderChatList();
      if (activeChatPhone) { const ct = buildChatContacts()[activeChatPhone]; if (ct) renderChatThread(ct); }
    }
    if (page === 'akun') loadAccounts();
  });
});

function goToPage(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('topbarTitle').textContent = pageNames[page];
}
document.getElementById('rapihkanBtn').addEventListener('click', () => {
  const raw = document.getElementById('rapihInput').value.trim();
  if (!raw) return showToast('Paste nomor di kolom input dulu');
  const all = raw.split(/[\n,;\t]+/);
  const cleaned = [], removed = [];
  all.forEach(n => {
    const norm = normalizeNumber(n.trim());
    if (norm && isValidIndonesianMobile(norm)) cleaned.push(norm);
    else if (n.trim()) removed.push(n.trim());
  });
  const unique = [...new Set(cleaned)];
  const dupes = cleaned.length - unique.length;
  document.getElementById('rapihOutput').value = unique.join('\n');
  document.getElementById('rapihOutput08').value = unique.map(n => '0' + n.slice(2)).join('\n');
  document.getElementById('rapihStats').innerHTML = `
    <span style="color:var(--success);font-weight:700;">${unique.length} valid</span>
    ${removed.length > 0 ? `<span style="color:var(--danger);font-weight:700;">${removed.length} dibuang</span>` : ''}
    ${dupes > 0 ? `<span style="color:var(--warning);font-weight:700;">${dupes} duplikat</span>` : ''}
  `;
  showToast(`${unique.length} nomor berhasil dirapihkan`);
});
document.getElementById('rapihCopyBtn').addEventListener('click', () => {
  const v = document.getElementById('rapihOutput').value.trim();
  if (!v) return showToast('Rapihkan nomor dulu');
  navigator.clipboard.writeText(v).then(() => showToast('Format 62 disalin!')).catch(() => showToast('Gagal menyalin'));
});
document.getElementById('rapihCopy08Btn').addEventListener('click', () => {
  const v = document.getElementById('rapihOutput08').value.trim();
  if (!v) return showToast('Rapihkan nomor dulu');
  navigator.clipboard.writeText(v).then(() => showToast('Format 08 disalin!')).catch(() => showToast('Gagal menyalin'));
});
document.getElementById('rapihPasteBtn').addEventListener('click', () => {
  const v = document.getElementById('rapihOutput').value.trim();
  if (!v) return showToast('Rapihkan nomor dulu');
  document.getElementById('nomor').value = v;
  goToPage('cek');
  showToast('Nomor dipindahkan ke Cek WA');
});
function updateLastResult(data, type) {
  document.getElementById('lastResultEmpty').style.display = 'none';
  document.getElementById('lastResultTable').style.display = 'block';
  document.getElementById('lastResultBody').innerHTML = data.slice(0, 20).map((item, i) => {
    let cls = 'terdaftar';
    if (item.status.includes('Tidak')) cls = 'tidak-terdaftar';
    else if (item.status.includes('Error') || item.status === 'Gagal') cls = type === 'kirim' ? 'gagal' : 'error';
    else if (type === 'kirim') cls = 'terkirim';
    return `<tr>
      <td style="color:var(--text-dim)">${i+1}</td>
      <td>${item.number}</td>
      <td><span class="badge ${cls}"><span class="badge-dot"></span>${item.status}</span></td>
      <td style="color:var(--text-dim);font-size:0.6875rem;">${type === 'kirim' ? 'Kirim' : 'Cek'}</td>
    </tr>`;
  }).join('');
}

document.getElementById('submitBtn').addEventListener('click', async () => {
  let nomor = document.getElementById('nomor').value.trim();
  if (!nomor) return showToast('Masukkan nomor terlebih dahulu');
  const cleaned = nomor.split(/[\n,;\t]+/).map(n => normalizeNumber(n)).filter(n => n && isValidIndonesianMobile(n));
  if (cleaned.length === 0) return showToast('Tidak ada nomor valid');
  document.getElementById('nomor').value = cleaned.join('\n');

  const btn = document.getElementById('submitBtn');
  const sp = document.getElementById('spinner');
  const bIcon = btn.querySelector('svg'); const bText = btn.querySelector('span');
  bIcon.style.display = 'none'; sp.style.display = 'inline-block';
  bText.textContent = 'Memproses...'; btn.disabled = true;

  document.getElementById('cekHasil').style.display = 'block';
  document.getElementById('hasilBody').innerHTML = `<tr class="processing-row"><td colspan="3"><div class="process-content"><div class="spinner" style="display:inline-block;border:2px solid rgba(0,212,255,0.2);border-top-color:var(--accent);"></div><span>Sedang mengecek nomor...</span></div></td></tr>`;

  try {
    const cekAccId = document.getElementById('cekAccountId')?.value || '';
    const res = await fetch('/cek', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nomor: cleaned.join('\n'), ...(cekAccId && { accountId: cekAccId }) }) });
    const data = await res.json();
    if (data.status === 'ok') {
      let terdaftar = 0, tidak = 0, err = 0;
      document.getElementById('hasilBody').innerHTML = data.data.map((item, i) => {
        let cls = 'terdaftar';
        if (item.status.includes('Tidak')) { cls = 'tidak-terdaftar'; tidak++; }
        else if (item.status.includes('Error')) { cls = 'error'; err++; }
        else terdaftar++;
        return `<tr><td style="color:var(--text-dim)">${i+1}</td><td>${item.number}</td><td><span class="badge ${cls}"><span class="badge-dot"></span>${item.status}</span></td></tr>`;
      }).join('');
      document.getElementById('cekStats').innerHTML = `
        <span style="color:var(--success);font-weight:700;">${terdaftar} Aktif</span>
        <span style="color:var(--danger);font-weight:700;">${tidak} Tidak</span>
        ${err > 0 ? `<span style="color:var(--warning);font-weight:700;">${err} Error</span>` : ''}`;
      const s = getStats(); s.totalCek += data.data.length; s.terdaftar += terdaftar; s.tidak += tidak; saveStats(s);
      const hc = getHistCek(); hc.push({ ts:Date.now(), total:data.data.length, terdaftar, tidak });
      if (hc.length > 20) hc.splice(0, hc.length - 20);
      localStorage.setItem('wa_hist_cek', JSON.stringify(hc));
      updateLastResult(data.data, 'cek');
      showToast(`Selesai! ${data.data.length} nomor dicek`);
    } else {
      document.getElementById('hasilBody').innerHTML = `<tr class="processing-row"><td colspan="3" style="color:var(--danger);">${data.msg||'Gagal'}</td></tr>`;
      showToast('Gagal memproses nomor');
    }
  } catch {
    document.getElementById('hasilBody').innerHTML = `<tr class="processing-row"><td colspan="3" style="color:var(--danger);">Koneksi error</td></tr>`;
    showToast('Koneksi error');
  }
  bIcon.style.display = ''; sp.style.display = 'none'; bText.textContent = 'Mulai Cek'; btn.disabled = false;
});

document.getElementById('copyButton').addEventListener('click', () => {
  const rows = document.querySelectorAll('#hasilBody tr:not(.processing-row)');
  if (!rows.length) return showToast('Belum ada hasil');
  let text = '';
  rows.forEach(r => { const n = r.children[1]?.innerText.trim(); const s = r.children[2]?.innerText.trim(); if (n&&s) text += `${n}\t${s}\n`; });
  navigator.clipboard.writeText(text).then(() => showToast('Semua hasil disalin!')).catch(() => showToast('Gagal'));
});
document.getElementById('copyTerdaftarBtn').addEventListener('click', () => {
  const rows = document.querySelectorAll('#hasilBody tr:not(.processing-row)');
  let text = '', count = 0;
  rows.forEach(r => { const n = r.children[1]?.innerText.trim(); const b = r.querySelector('.badge'); if (b?.classList.contains('terdaftar')) { text += n+'\n'; count++; } });
  if (!count) return showToast('Tidak ada nomor terdaftar');
  navigator.clipboard.writeText(text).then(() => showToast(`${count} nomor terdaftar disalin!`)).catch(() => showToast('Gagal'));
});
document.getElementById('copyTidakBtn').addEventListener('click', () => {
  const rows = document.querySelectorAll('#hasilBody tr:not(.processing-row)');
  let text = '', count = 0;
  rows.forEach(r => { const n = r.children[1]?.innerText.trim(); const b = r.querySelector('.badge'); if (b?.classList.contains('tidak-terdaftar')) { text += n+'\n'; count++; } });
  if (!count) return showToast('Tidak ada nomor tidak terdaftar');
  navigator.clipboard.writeText(text).then(() => showToast(`${count} nomor disalin!`)).catch(() => showToast('Gagal'));
});
document.getElementById('kirimBtn').addEventListener('click', async () => {
  const nomor = document.getElementById('kirimNomor').value.trim();
  const pesan = document.getElementById('kirimPesan').value.trim();
  if (!nomor) return showToast('Masukkan nomor tujuan');
  if (!pesan) return showToast('Tulis pesan terlebih dahulu');

  const btn = document.getElementById('kirimBtn');
  const sp = document.getElementById('kirimSpinner');
  const bIcon = btn.querySelector('svg'); const bText = btn.querySelector('span');
  bIcon.style.display = 'none'; sp.style.display = 'inline-block';
  bText.textContent = 'Mengirim...'; btn.disabled = true;

  document.getElementById('kirimHasilCard').style.display = 'block';
  document.getElementById('kirimBody').innerHTML = `<tr class="processing-row"><td colspan="3"><div class="process-content"><div class="spinner" style="display:inline-block;border:2px solid rgba(0,212,255,0.2);border-top-color:var(--accent);"></div><span>Sedang mengirim pesan...</span></div></td></tr>`;

  try {
    const kirimAccId = document.getElementById('kirimAccountId')?.value || '';
    const res = await fetch('/kirim', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ nomor, pesan, ...(kirimAccId && { accountId: kirimAccId }) }) });
    const data = await res.json();
    if (data.status === 'ok') {
      let terkirim = 0, gagal = 0;
      document.getElementById('kirimBody').innerHTML = data.data.map((item, i) => {
        const ok = item.status === 'Terkirim';
        if (ok) terkirim++; else gagal++;
        return `<tr><td style="color:var(--text-dim)">${i+1}</td><td>${item.number}</td><td><span class="badge ${ok?'terkirim':'gagal'}"><span class="badge-dot"></span>${item.status}</span></td></tr>`;
      }).join('');
      document.getElementById('kirimStats').innerHTML = `
        <span style="color:var(--accent);font-weight:700;">${terkirim} Terkirim</span>
        ${gagal > 0 ? `<span style="color:var(--danger);font-weight:700;">${gagal} Gagal</span>` : ''}`;
      const s = getStats(); s.kirim += terkirim; saveStats(s);
      const hk = getHistKirim(); hk.push({ ts:Date.now(), total:data.data.length, terkirim, gagal });
      if (hk.length > 20) hk.splice(0, hk.length - 20);
      localStorage.setItem('wa_hist_kirim', JSON.stringify(hk));
      updateLastResult(data.data, 'kirim');
      const _kAccLabel = document.getElementById('kirimAccountId')?.selectedOptions[0]?.text || 'Akun Kamu';
      data.data.forEach(item => { if (item.status==='Terkirim') sentMessages.push({ ts:Date.now(), id:'skirim_'+Date.now()+'_'+item.number, to:item.number, toName:'', body:pesan, accountId:kirimAccId, accountLabel:_kAccLabel }); });
      document.getElementById('kirimNomor').value = '';
      document.getElementById('kirimPesan').value = '';
      showToast(`Selesai! ${terkirim} pesan terkirim`);
    } else {
      document.getElementById('kirimBody').innerHTML = `<tr class="processing-row"><td colspan="3" style="color:var(--danger);">${data.msg||'Gagal'}</td></tr>`;
      showToast('Gagal mengirim pesan');
    }
  } catch {
    document.getElementById('kirimBody').innerHTML = `<tr class="processing-row"><td colspan="3" style="color:var(--danger);">Koneksi error</td></tr>`;
    showToast('Koneksi error');
  }
  bIcon.style.display = ''; sp.style.display = 'none'; bText.textContent = 'Kirim Pesan'; btn.disabled = false;
});

// ===== KELOLA AKUN =====
async function loadAccounts() {
  try {
    const res = await fetch('/accounts');
    const data = await res.json();
    renderAccountCards(data.accounts);
    populateAccountDropdowns(data.accounts);
  } catch {}
}

function populateAccountDropdowns(accounts) {
  ['cekAccountId', 'kirimAccountId', 'replyAccountId', 'chatAccountId'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">── Pilih Nomor WA ──</option>';
    accounts.filter(a => a.status === 'ready').forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.label + (a.phone && a.phone !== a.label ? ' (+' + a.phone + ')' : '');
      sel.appendChild(opt);
    });
    if (cur && accounts.find(a => a.id === cur)) sel.value = cur;
  });
}

function renderAccountCards(accounts) {
  const list = document.getElementById('akunList');
  const empty = document.getElementById('akunEmpty');
  if (!list) return;
  if (accounts.length === 0) {
    if (empty) empty.style.display = 'block';
    [...list.querySelectorAll('.akun-card')].forEach(c => c.remove());
    return;
  }
  if (empty) empty.style.display = 'none';
  const incoming = new Set(accounts.map(a => a.id));
  [...list.querySelectorAll('.akun-card')].forEach(c => { if (!incoming.has(c.dataset.id)) c.remove(); });
  accounts.forEach(acc => {
    let card = list.querySelector('.akun-card[data-id="' + acc.id + '"]');
    const isNew = !card;
    if (isNew) {
      card = document.createElement('div');
      card.className = 'card akun-card';
      card.dataset.id = acc.id;
      card.style.marginBottom = '0.75rem';
    }
    const sc = acc.status === 'ready' ? 'var(--success)' : acc.status === 'connecting' ? 'var(--warning)' : 'var(--danger)';
    const sl = acc.status === 'ready' ? 'Terhubung' : acc.status === 'connecting' ? 'Menghubungkan...' : 'Terputus';
    const btnQr = (acc.hasQr || acc.status === 'connecting') ? `<button class="btn btn-ghost" onclick="openAkunQr('${acc.id}','${acc.label.replace(/'/g,"\\'")}')">📷 Scan QR</button>` : '';
    const btnPutus = acc.status === 'ready' ? `<button class="btn btn-ghost" onclick="disconnectAccount('${acc.id}')">⏏ Putus</button>` : '';
    const btnRecon = acc.status === 'disconnected' ? `<button class="btn btn-ghost" onclick="reconnectAccount('${acc.id}')">🔄 Reconnect</button>` : '';
    const btnDel = `<button class="btn btn-ghost" onclick="deleteAccount('${acc.id}','${acc.label.replace(/'/g,"\\'")}')">🗑</button>`;
    card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">' +
        '<div style="display:flex;align-items:center;gap:0.75rem;flex:1;min-width:180px;">' +
          '<div style="width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,0.3);border:2px solid ' + sc + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:' + sc + ';"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
          '</div>' +
          '<div>' +
            '<div style="font-weight:600;font-size:0.875rem;color:var(--text-bright);">' + acc.label + '</div>' +
            '<div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px;">' + (acc.phone ? '+' + acc.phone : 'Belum terhubung') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">' +
          '<span style="font-size:0.7rem;font-weight:700;color:' + sc + ';padding:0.2rem 0.625rem;border-radius:999px;background:' + sc + '22;border:1px solid ' + sc + '44;">' + sl + '</span>' +
          btnQr + btnPutus + btnRecon + btnDel +
        '</div>' +
      '</div>';
    if (isNew) list.appendChild(card);
  });
}

async function addAccount() {
  const label = (document.getElementById('newAkunLabel')?.value || '').trim();
  if (!label) return showToast('Isi label akun dahulu');
  try {
    const res = await fetch('/accounts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ label }) });
    const data = await res.json();
    if (data.status === 'ok') {
      document.getElementById('newAkunLabel').value = '';
      showToast('✅ Akun "' + label + '" ditambahkan — tunggu QR...');
      loadAccounts();
    } else { showToast('❌ ' + (data.msg || 'Gagal')); }
  } catch { showToast('❌ Koneksi error'); }
}

async function deleteAccount(id, label) {
  if (!confirm('Hapus akun "' + label + '"? Session WA akan dihapus.')) return;
  try {
    await fetch('/accounts/' + id, { method:'DELETE' });
    showToast('🗑 Akun "' + label + '" dihapus');
    loadAccounts();
  } catch { showToast('❌ Gagal menghapus'); }
}

async function disconnectAccount(id) {
  try { await fetch('/accounts/' + id + '/disconnect', { method:'POST' }); showToast('⏏ Akun diputus'); loadAccounts(); } catch {}
}

async function reconnectAccount(id) {
  try { await fetch('/accounts/' + id + '/reconnect', { method:'POST' }); showToast('🔄 Mencoba reconnect...'); loadAccounts(); } catch {}
}

let akunQrInterval = null;
async function openAkunQr(id, label) {
  const modal = document.getElementById('akunQrModal');
  if (!modal) return;
  document.getElementById('akunQrLabel').textContent = 'Akun: ' + label;
  document.getElementById('akunQrState').innerHTML = '<div style="display:inline-block;width:32px;height:32px;border:3px solid rgba(0,212,255,0.15);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;"></div>';
  modal.style.display = 'flex';
  const fetchQr = async () => {
    try {
      const res = await fetch('/accounts/' + id + '/qr');
      const d = await res.json();
      if (d.status === 'connected') {
        document.getElementById('akunQrState').innerHTML = '<div style="padding:2rem;"><div style="font-size:2.5rem;">✅</div><div style="color:var(--success);font-weight:700;margin-top:0.75rem;">Berhasil Terhubung!</div><div style="color:var(--text-dim);font-size:0.75rem;margin-top:0.375rem;">+' + d.phone + '</div></div>';
        clearInterval(akunQrInterval); akunQrInterval = null;
        setTimeout(() => { closeAkunQrModal(); loadAccounts(); }, 2000);
      } else if (d.status === 'qr' && d.qr) {
        const st = document.getElementById('akunQrState');
        let canvas = st.querySelector('canvas');
        if (!canvas) {
          st.innerHTML = '';
          canvas = document.createElement('canvas');
          canvas.style.cssText = 'border-radius:8px;border:2px solid var(--accent);display:block;';
          st.appendChild(canvas);
        }
        if (typeof QRCode !== 'undefined') QRCode.toCanvas(canvas, d.qr, { width:240, margin:0, color:{dark:'#000000',light:'#ffffff'} });
      }
    } catch {}
  };
  await fetchQr();
  if (akunQrInterval) clearInterval(akunQrInterval);
  akunQrInterval = setInterval(fetchQr, 3000);
}

function closeAkunQrModal() {
  if (akunQrInterval) { clearInterval(akunQrInterval); akunQrInterval = null; }
  const m = document.getElementById('akunQrModal');
  if (m) m.style.display = 'none';
}

// ===== CHAT =====
const SYSTEM_MSG_TYPES = new Set(['e2e_notification','notification_template','revoked','protocol','call_log','groups_v4_invite','gp2','broadcast']);
function buildChatContacts() {
  const map = {};
  inboxAll.forEach(m => {
    if (SYSTEM_MSG_TYPES.has(m.type)) return;
    const k = m.from;
    if (!map[k]) map[k] = { phone:k, name:m.name||'', messages:[] };
    if (m.name) map[k].name = m.name;
    map[k].messages.push({ dir:'in', ts:m.ts, body:m.body, id:m.id, type:m.type, accountLabel:m.accountLabel });
  });
  sentMessages.forEach(m => {
    const k = m.to;
    if (!map[k]) map[k] = { phone:k, name:m.toName||'', messages:[] };
    if (m.toName) map[k].name = m.toName;
    map[k].messages.push({ dir:'out', ts:m.ts, body:m.body, id:m.id, accountLabel:m.accountLabel });
  });
  Object.values(map).forEach(c => c.messages.sort((a,b) => a.ts - b.ts));
  return map;
}

function fmtMsgShort(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' });
}

function renderChatList() {
  const listEl = document.getElementById('chatListItems');
  const emptyEl = document.getElementById('chatListEmpty');
  if (!listEl) return;
  const contacts = buildChatContacts();
  const sorted = Object.values(contacts).sort((a,b) => {
    const la = a.messages[a.messages.length-1]?.ts || 0;
    const lb = b.messages[b.messages.length-1]?.ts || 0;
    return lb - la;
  });
  if (sorted.length === 0) { emptyEl.style.display = 'block'; listEl.innerHTML = ''; return; }
  emptyEl.style.display = 'none';
  listEl.innerHTML = sorted.map(c => {
    const last = c.messages[c.messages.length-1];
    const rawPreview = last ? ((last.dir==='out'?'↗ ':'') + (last.type && last.type!=='chat' ? `[${last.type}]` : (last.body||''))) : '';
    const preview = rawPreview.slice(0,42).replace(/</g,'&lt;');
    const active = c.phone === activeChatPhone ? ' active' : '';
    return `<div class="chat-list-item${active}" data-phone="${c.phone}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.25rem;">
        <div class="chat-list-name">${(c.name||'+'+c.phone).replace(/</g,'&lt;')}</div>
        <div style="font-size:0.6rem;color:var(--text-dim);white-space:nowrap;flex-shrink:0;">${last ? fmtMsgShort(last.ts) : ''}</div>
      </div>
      <div class="chat-list-preview">${preview}</div>
    </div>`;
  }).join('');
  listEl.querySelectorAll('.chat-list-item').forEach(el => {
    el.addEventListener('click', () => openChat(el.dataset.phone));
  });
}

function openChat(phone) {
  activeChatPhone = phone;
  renderChatList();
  const contacts = buildChatContacts();
  const contact = contacts[phone];
  if (!contact) return;
  const header = document.getElementById('chatPanelHeader');
  if (header) header.innerHTML =
    `<div style="font-weight:700;font-size:0.925rem;color:var(--text-bright);">${(contact.name||'+'+phone).replace(/</g,'&lt;')}</div>` +
    `<div style="font-size:0.7rem;color:var(--accent);margin-top:2px;">+${phone}</div>`;
  const emptyEl = document.getElementById('chatPanelEmpty');
  const contentEl = document.getElementById('chatPanelContent');
  if (emptyEl) emptyEl.style.display = 'none';
  if (contentEl) { contentEl.style.display = 'flex'; contentEl.style.flexDirection = 'column'; contentEl.style.flex = '1'; contentEl.style.overflow = 'hidden'; }
  renderChatThread(contact);
  setTimeout(() => document.getElementById('chatInput')?.focus(), 50);
}

function renderChatThread(contact) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  el.innerHTML = contact.messages.map(m => {
    const isOut = m.dir === 'out';
    const bodyTxt = (m.type && m.type !== 'chat' ? `[${m.type}]` : (m.body||'')).replace(/</g,'&lt;').replace(/\n/g,'<br>');
    if (isOut) return `<div class="chat-bubble-out">
        <div class="chat-bsender-out">${(m.accountLabel||'Akun Kamu').replace(/</g,'&lt;')}</div>
        <div style="font-size:0.8125rem;">${bodyTxt}</div>
        <div class="chat-btime" style="text-align:right;">${fmtMsg(m.ts)}</div>
      </div>`;
    return `<div class="chat-bubble-in">
        <div class="chat-bsender">${(contact.name||'+'+contact.phone).replace(/</g,'&lt;')}</div>
        <div style="font-size:0.8125rem;">${bodyTxt}</div>
        <div class="chat-btime">${fmtMsg(m.ts)}</div>
      </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

document.getElementById('chatSendBtn').addEventListener('click', async () => {
  const pesan = document.getElementById('chatInput').value.trim();
  if (!pesan) return showToast('Tulis pesan dahulu');
  if (!activeChatPhone) return;
  const accountEl = document.getElementById('chatAccountId');
  const accountId = accountEl?.value || '';
  const accountLabel = accountEl?.selectedOptions[0]?.text || 'Akun Kamu';
  const btn = document.getElementById('chatSendBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: activeChatPhone, pesan, ...(accountId && { accountId }) })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      const cname = buildChatContacts()[activeChatPhone]?.name || '';
      sentMessages.push({ ts:Date.now(), id:'schat_'+Date.now(), to:activeChatPhone, toName:cname, body:pesan, accountId, accountLabel });
      document.getElementById('chatInput').value = '';
      const ct = buildChatContacts()[activeChatPhone];
      renderChatList();
      if (ct) renderChatThread(ct);
      showToast('Pesan terkirim!');
    } else { showToast('Gagal: ' + (data.msg||'error')); }
  } catch { showToast('Koneksi error'); }
  btn.disabled = false;
});

document.getElementById('chatInput').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('chatSendBtn').click();
  }
});

loadAccounts();
setInterval(loadAccounts, 4000);
loadSentHistory();
