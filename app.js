/* دیوار‌یار — static Telegram Mini App (no backend).
   Search mode: builds a search and hands it to the bot through Telegram itself:
     - opened from the chat keyboard button -> Telegram.WebApp.sendData(JSON)
     - opened from the menu / an inline button -> t.me/<bot>?start=<compact code>
   Results mode (#data=...): shows a compact, compressed result list the bot put in the URL fragment.
   Contains no token, no data and no owner id; the bot checks who sent the request. */
const tg = window.Telegram ? Telegram.WebApp : null;
const BOT = 'DivarMaava_bot';
const $app = document.getElementById('app');
const S = { deal: 'sell', ptype: 'any', districts: [], window: '1d', personal: true, min_price: '', max_price: '', min_area: '', max_area: '', repeat: 0 };
let DIST = [];
const fa = n => (n === null || n === undefined || n === '') ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function money(v) { if (v == null) return '—'; v = +v; if (v >= 1e9) return fa((v / 1e9).toFixed(2).replace(/\.?0+$/, '')) + ' میلیارد'; if (v >= 1e6) return fa(Math.round(v / 1e6).toLocaleString('en')) + ' میلیون'; return fa(v.toLocaleString('en')); }
function toast(t, ms = 2600) { const e = document.getElementById('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(() => e.style.display = 'none', ms); }
function haptic(k = 'light') { try { tg.HapticFeedback.impactOccurred(k) } catch (e) { } }
const norm = s => String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c]/g, '').replace(/[آأإ]/g, 'ا');
// keyboard-button launch has no initData; menu/inline launch has it
const fromKeyboard = () => tg && !tg.initData && tg.platform !== 'unknown';

const VC = { 'داخل محله': 'v-in', 'مرزی': 'v-edge', 'خارج': 'v-out', 'تعارض': 'v-conf', 'نامشخص': 'v-unk' };
const SC = { 'شخصی ✔': 's-ok', 'مشاور': 's-ag', 'بررسی': 's-rev', 'خارج از محله': 's-out' };
const SL = { 'شخصی ✔': '👤 شخصی', 'مشاور': '🏢 مشاور', 'بررسی': '🔍 نیاز به بررسی', 'خارج از محله': '📍 خارج از محله' };
const vbadge = v => v ? `<span class="b ${VC[v] || 'v-unk'}">📍 ${esc(v)}</span>` : '';
const sbadge = s => `<span class="b ${SC[s] || ''}">${SL[s] || esc(s)}</span>`;

// ---------------------------------------------------------------- search builder
function seg(key, opts) {
  return `<div class="seg">` + Object.entries(opts).map(([k, v]) => `<button class="opt ${String(S[key]) === String(k) ? 'on' : ''}" data-k="${key}" data-v="${k}">${v}</button>`).join('') + `</div>`;
}
function Search() {
  const types = { any: 'همه', apartment: '🏢 آپارتمان', villa: '🏡 ویلا/خانه', land: '🌱 زمین/کلنگی', commercial: '🏬 تجاری/اداری', building: '🏗 ساختمان کامل' };
  const priceLbl = S.deal === 'sell' ? 'قیمت (تومان)' : 'ودیعه (تومان)';
  $app.innerHTML = `<div class="hdr"><h1>🔎 جستجوی آگهی ملک</h1><p>دیوار شیراز · گزینه‌ها را بزنید، بعد یکی از دکمه‌های پایین</p></div>
  <div class="sec"><h3>نوع معامله</h3>${seg('deal', { sell: '🏷 فروش', rent: '🔑 اجاره', mortgage: '💰 رهن' })}</div>
  <div class="sec"><h3>نوع ملک</h3>${seg('ptype', types)}</div>
  <div class="sec"><h3>محله <small>(اسم محله یا خیابان را تایپ کنید)</small></h3>
    <div class="sugg" id="sel"></div>
    <input class="inp" id="dq" placeholder="مثلاً ارم، قصرالدشت، چمران…" autocomplete="off" style="margin-top:8px">
    <div class="sugg" id="dsug"></div></div>
  <div class="sec"><h3>بازه‌ی زمانی</h3>${seg('window', { '1d': 'امروز', '3d': '۳ روز', '7d': '۱ هفته' })}</div>
  <div class="sec tog"><div><b>فقط آگهی‌های شخصی</b><div class="muted" style="font-size:13px">مشاورهای پنهان هم از روی متن کنار گذاشته می‌شوند</div></div><button class="sw ${S.personal ? 'on' : ''}" id="pers"></button></div>
  <div class="sec"><details ${S.min_price || S.max_price || S.min_area || S.max_area ? 'open' : ''}><summary>قیمت و متراژ (اختیاری)</summary>
    <div class="row2"><input class="inp" id="minp" placeholder="${priceLbl} از"><input class="inp" id="maxp" placeholder="تا"></div>
    <div class="muted" style="font-size:12px;margin-top:4px">مثلاً «۵ میلیارد» یا «۸۰۰ میلیون»</div>
    <div class="row2"><input class="inp" inputmode="numeric" id="mina" placeholder="متراژ از (متر)"><input class="inp" inputmode="numeric" id="maxa" placeholder="تا"></div></details></div>
  <div class="sec"><h3>تکرار خودکار <small>(فقط جستجوی تازه)</small></h3>${seg('repeat', { 0: 'یک بار', 360: 'هر ۶ ساعت', 720: 'هر ۱۲ ساعت', 1440: 'روزانه' })}</div>
  <div class="sec"><details><summary>یا لینک جستجوی دیوار</summary>
    <textarea class="inp" id="url" rows="3" dir="ltr" style="margin-top:8px" placeholder="https://divar.ir/s/shiraz/buy-apartment?districts=522"></textarea></details></div>
  <button class="big" id="btnLive">🚀 جستجوی تازه در دیوار</button>
  <button class="big alt" id="btnStored">🗂 فقط از آگهی‌های ذخیره‌شده</button>
  <div class="row2" style="padding:0 12px"><button class="big alt" style="margin:0;width:auto" id="btnJobs">🕘 کارها</button><button class="big alt" style="margin:0;width:auto" id="btnHelp">❓ راهنما</button></div>
  <div class="sec muted" style="font-size:12.5px;line-height:1.9">🔒 فقط صاحب ربات می‌تواند جستجو کند. شماره‌ی تماس گرفته نمی‌شود و وارد حساب دیوار نمی‌شویم. بین صفحه‌ها حداقل ۸ ثانیه فاصله است و با کپچا یا مسدودی کار متوقف می‌شود.</div><div style="height:16px"></div>`;
  $app.querySelectorAll('.opt').forEach(b => b.onclick = () => { haptic(); readInputs(); S[b.dataset.k] = b.dataset.k === 'repeat' ? +b.dataset.v : b.dataset.v; Search(); });
  pers.onclick = () => { haptic(); S.personal = !S.personal; pers.classList.toggle('on', S.personal); };
  minp.value = S.min_price ? money(S.min_price) : ''; maxp.value = S.max_price ? money(S.max_price) : ''; mina.value = S.min_area; maxa.value = S.max_area;
  drawSel(); dq.oninput = () => suggest(dq.value); suggest('');
  btnLive.onclick = () => submit('live'); btnStored.onclick = () => submit('stored');
  btnJobs.onclick = () => send({ v: 1, a: 'jobs' }, 'jobs'); btnHelp.onclick = () => send({ v: 1, a: 'help' }, 'help');
}
function parseMoney(s) {
  if (!s) return ''; s = String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,،\s]/g, '');
  let m = 1; if (/میلیارد/.test(s)) m = 1e9; else if (/میلیون/.test(s)) m = 1e6; else if (/هزار/.test(s)) m = 1e3;
  const n = parseFloat(s.replace(/[^\d.]/g, '')); return isNaN(n) ? '' : Math.round(n * m);
}
function readInputs() { if (!window.minp) return; S.min_price = parseMoney(minp.value) || ''; S.max_price = parseMoney(maxp.value) || ''; S.min_area = parseMoney(mina.value) || ''; S.max_area = parseMoney(maxa.value) || ''; }
function drawSel() {
  sel.innerHTML = S.districts.length ? S.districts.map(d => `<button class="chip on x" data-id="${d[0]}">${esc(d[1])}</button>`).join('') : '<span class="muted" style="font-size:13px">هیچ محله‌ای انتخاب نشده (= همه‌ی شیراز)</span>';
  sel.querySelectorAll('.chip').forEach(c => c.onclick = () => { S.districts = S.districts.filter(d => d[0] != c.dataset.id); drawSel(); suggest(dq.value); });
}
function suggest(q) {
  const n = norm(q), have = new Set(S.districts.map(d => d[0]));
  let list;
  if (!n) list = DIST.filter(d => d[0] === 522 || d[0] === 515);
  else {
    const a = DIST.filter(d => norm(d[1]).startsWith(n)), b = DIST.filter(d => !a.includes(d) && norm(d[1]).includes(n)), c = DIST.filter(d => !a.includes(d) && !b.includes(d) && norm(d[2]).includes(n));
    list = [...a, ...b, ...c].slice(0, 15);
  }
  list = list.filter(d => !have.has(d[0]));
  dsug.innerHTML = list.map(d => `<button class="chip" data-id="${d[0]}" title="${esc(d[2])}">${esc(d[1])}</button>`).join('') || (n ? '<span class="muted">محله‌ای پیدا نشد</span>' : '');
  dsug.querySelectorAll('.chip').forEach(c => c.onclick = () => { haptic(); S.districts.push(DIST.find(d => d[0] == c.dataset.id)); dq.value = ''; drawSel(); suggest(''); });
}
function submit(mode) {
  readInputs();
  const box = document.getElementById('url'), link = (box && box.value || '').trim();
  if (link && !/divar\.ir\/s\//.test(link)) return toast('لینک باید شبیه divar.ir/s/shiraz/… باشد');
  const q = { v: 1, a: mode, deal: S.deal, ptype: S.ptype, d: S.districts.map(d => d[0]), w: S.window, p: S.personal ? 1 : 0, rep: mode === 'live' ? S.repeat : 0 };
  for (const k of ['min_price', 'max_price', 'min_area', 'max_area']) if (S[k]) q[k] = S[k];
  if (link) { q.url = link; q.a = 'live'; }
  send(q, mode);
}
// compact start-parameter (<=64 chars, [A-Za-z0-9_-]) for launches that cannot sendData
const DEAL_C = { sell: 's', rent: 'r', mortgage: 'm' }, TYPE_C = { any: 'x', apartment: 'a', villa: 'v', land: 'l', commercial: 'c', building: 'b' }, WIN_C = { '1d': '1', '3d': '3', '7d': '7' }, REP_C = { 0: '0', 360: '6', 720: 'c', 1440: 'd' };
function startCode(q) {
  if (q.a === 'jobs') return 'jobs'; if (q.a === 'help') return 'help';
  if (q.url) return null;
  const m = v => v ? Math.round(v / 1e6).toString(36) : '', ar = v => v ? (+v).toString(36) : '';
  const code = 'q' + (q.a === 'live' ? 'L' : 'S') + DEAL_C[q.deal] + TYPE_C[q.ptype] + WIN_C[q.w] + q.p + REP_C[q.rep || 0] + '_' + q.d.map(i => i.toString(36)).join('-') + '_' + [m(q.min_price), m(q.max_price), ar(q.min_area), ar(q.max_area)].join('_');
  return code.length <= 64 ? code : null;
}
function send(q, mode) {
  haptic('medium');
  if (fromKeyboard()) { tg.sendData(JSON.stringify(q)); return; } // the app closes; the bot answers in chat
  const code = startCode(q);
  if (code && tg) { tg.openTelegramLink(`https://t.me/${BOT}?start=${code}`); setTimeout(() => tg.close(), 400); return; }
  if (code) { location.href = `https://t.me/${BOT}?start=${code}`; return; }
  toast('این جستجو طولانی است؛ برنامه را از دکمه‌ی «📱 جستجو» پایین چت باز کنید، یا لینک را مستقیم در چت بفرستید.', 6000);
}

// ---------------------------------------------------------------- results viewer (#data=)
async function inflate(b64) {
  const bin = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const ds = new DecompressionStream('deflate-raw');
  const txt = await new Response(new Blob([bin]).stream().pipeThrough(ds)).text();
  return JSON.parse(txt);
}
const F = ['id', 'title', 'price', 'deposit', 'rent', 'area', 'rooms', 'floor', 'year', 'kind', 'deal', 'district', 'verdict', 'status', 'token', 'photo', 'deco'];
function priceLine(i) {
  if (i.deal === 'فروش') return money(i.price) + ' تومان';
  const p = []; if (i.deposit != null) p.push('ودیعه ' + money(i.deposit)); if (i.rent) p.push('اجاره ' + money(i.rent)); return p.join(' · ') || money(i.price);
}
function card(i) {
  const ph = i.photo ? `<img loading="lazy" src="${esc(i.photo)}" onerror="this.remove()">` : '🏠';
  const m = [i.area ? fa(i.area) + ' متر' : '', i.rooms != null ? fa(i.rooms) + ' خواب' : '', i.floor != null ? 'طبقه ' + fa(i.floor) : '', i.year ? 'ساخت ' + fa(i.year) : ''].filter(Boolean).join(' · ');
  return `<div class="card" data-t="${esc(i.token)}" data-id="${i.id}"><div class="im">${ph}${i.deco ? '<span class="dec">تزئینی</span>' : ''}</div><div class="bd">
  <div class="t">${esc(i.title)}</div><div class="price">${priceLine(i)}</div>
  <div class="meta">${esc(i.kind)} · ${esc(i.deal)} · ${esc(i.district || '')}<br>${m}</div>
  <div>${sbadge(i.status)}${vbadge(i.verdict)}</div>
  <div class="acts" style="display:flex;gap:6px;margin-top:6px"><button class="sbtn" data-a="d">🔎 جزئیات در چت</button><button class="sbtn" data-a="o">دیوار ↗</button></div></div></div>`;
}
async function Results(b64) {
  let r; try { r = await inflate(b64); } catch (e) { $app.innerHTML = '<div class="empty"><div class="ic">⚠️</div>این لینک نتیجه خراب است. جستجو را دوباره بزنید.</div>'; return; }
  const items = r.i.map(a => Object.fromEntries(F.map((k, n) => [k, a[n]])));
  items.forEach(i => { if (i.photo && !/^https?:/.test(i.photo)) i.photo = 'https://s100.divarcdn.com/static/photo/neda/webp_post/' + i.photo + '.webp'; });
  const st = {}; items.forEach(i => st[i.status] = (st[i.status] || 0) + 1);
  let filt = 'all';
  const draw = () => {
    const show = items.filter(i => filt === 'all' || i.status === filt);
    $app.innerHTML = `<div class="hdr"><h1>${esc(r.t)}</h1><p>${fa(r.n)} آگهی${r.n > items.length ? ` · ${fa(items.length)} تای اول اینجا، همه در فایل اکسل/HTML چت` : ''}</p></div>
    <div class="stats"><button class="st ${filt === 'all' ? 'chip on' : ''}" data-f="all"><b>${fa(items.length)}</b>همه</button>${Object.entries(st).map(([s, n]) => `<button class="st" data-f="${esc(s)}" style="${filt === s ? 'outline:2px solid var(--btn)' : ''}"><b>${fa(n)}</b>${SL[s] || esc(s)}</button>`).join('')}</div>
    ${show.map(card).join('') || '<div class="empty">آگهی‌ای نیست</div>'}
    <button class="big alt" id="btnNew">🔎 جستجوی جدید</button><div style="height:16px"></div>`;
    $app.querySelectorAll('.stats [data-f]').forEach(b => b.onclick = () => { filt = b.dataset.f; draw(); });
    $app.querySelectorAll('.card .sbtn').forEach(b => b.onclick = ev => {
      ev.stopPropagation(); const c = b.closest('.card');
      if (b.dataset.a === 'o') { const u = 'https://divar.ir/v/' + c.dataset.t; tg ? tg.openLink(u) : window.open(u); }
      else { const u = `https://t.me/${BOT}?start=d_${c.dataset.id}`; tg ? (tg.openTelegramLink(u), setTimeout(() => tg.close(), 400)) : (location.href = u); }
    });
    $app.querySelectorAll('.card').forEach(c => c.onclick = () => { const u = 'https://divar.ir/v/' + c.dataset.t; tg ? tg.openLink(u) : window.open(u); });
    btnNew.onclick = async () => { try { sessionStorage.removeItem('dy_data') } catch (e) { } history.replaceState(null, '', location.pathname); if (!DIST.length) { try { DIST = await (await fetch('districts.json?v=1')).json(); } catch (e) { } } Search(); };
  };
  draw();
}

// ---------------------------------------------------------------- boot
(async function boot() {
  if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('secondary_bg_color') } catch (e) { } }
  const h = new URLSearchParams(location.hash.slice(1)), qs = new URLSearchParams(location.search);
  const data = h.get('data') || qs.get('data') || (sessionStorage.getItem('dy_data') || '');
  if (data) { try { sessionStorage.setItem('dy_data', data) } catch (e) { } return Results(data); }
  try { DIST = await (await fetch('districts.json?v=1')).json(); } catch (e) { DIST = [[522, 'ارم', ''], [515, 'قصرالدشت', '']]; }
  Search();
})();
