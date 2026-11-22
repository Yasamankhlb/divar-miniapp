/* دیوار‌یار — static Telegram Mini App (no backend).
   Search mode: builds a search and hands it to the bot through Telegram itself:
     - opened from the chat keyboard button -> Telegram.WebApp.sendData(JSON)
     - opened from the menu / an inline button -> t.me/<bot>?start=<compact code>
   Results mode (#data=...): shows a compact, compressed result list the bot put in the URL fragment.
   Contains no token, no data and no owner id; the bot checks who sent the request. */
const tg = window.Telegram ? Telegram.WebApp : null;
const BOT = 'DivarMaava_bot';
const $app = document.getElementById('app');
const S = { deal: 'sell', ptype: 'any', districts: [], streets: [], areas: [], window: '1d', personal: true, min_price: '', max_price: '', min_area: '', max_area: '', repeat: 0 };
let DIST = [];
const fa = n => (n === null || n === undefined || n === '') ? '—' : String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function money(v) { if (v == null) return '—'; v = +v; if (v >= 1e9) return fa((v / 1e9).toFixed(2).replace(/\.?0+$/, '')) + ' میلیارد'; if (v >= 1e6) return fa(Math.round(v / 1e6).toLocaleString('en')) + ' میلیون'; return fa(v.toLocaleString('en')); }
function toast(t, ms = 2600) { const e = document.getElementById('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(() => e.style.display = 'none', ms); }
function haptic(k = 'light') { try { tg.HapticFeedback.impactOccurred(k) } catch (e) { } }
const norm = s => String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c]/g, '').replace(/[آأإ]/g, 'ا');
// Street name without «بلوار/خیابان/کوچه/میدان/شهید»: typing «مهر» finds «بلوار مهر» first.
const PLACE_WORDS = /^(بلوار|خیابان|خ|کوچه|میدان|شهید)\s+/;
const skey = s => { let t = String(s || '').trim(); while (PLACE_WORDS.test(t)) t = t.replace(PLACE_WORDS, ''); return norm(t); };
// «رادفر۲/۱»، «۸/۱رادفر»، «رادفر دوم» -> «رادفر»: one «رادفر (همه)» chip selects every variant.
const ORDINALS = new Set(['اول','دوم','سوم','چهارم','پنجم','ششم','هفتم','هشتم','نهم','دهم','یازدهم','دوازدهم','شمالی','جنوبی','شرقی','غربی','الف','ب','ج','کوچه','فرعی','بن‌بست','بلوار','خیابان','خ','میدان','شهید']);
function streetBase(st) {
  const words = String(st || '').replace(/[0-9۰-۹/\\\-_.]+/g, ' ').split(/\s+/).filter(w => w && !ORDINALS.has(w));
  return words.join(' ') || String(st || '').trim();
}
let GROUPS = null; // norm(base) -> {name, members:Set, ids:Set}
function streetGroups() {
  if (GROUPS && GROUPS.src === DIST) return GROUPS.map;
  const map = new Map();
  for (const d of DIST) for (const st of streetParts(d[2])) {
    const base = streetBase(st), k = skey(base);
    if (!k) continue;
    if (!map.has(k)) map.set(k, { name: base, members: new Set(), ids: new Set() });
    map.get(k).members.add(st); map.get(k).ids.add(d[0]);
  }
  for (const [k, g] of map) if (g.members.size < 2) map.delete(k);
  GROUPS = { src: DIST, map };
  return map;
}
function streetRank(st, n) {
  const k = skey(st), sn = norm(st);
  if (k === n) return 0;
  if (k.startsWith(n)) return 1;
  if (sn.includes(n)) return 2;
  return -1;
}
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
  $app.innerHTML = `<div class="hdr"><h1>🔎 جستجوی آگهی ملک</h1></div>
  <div class="sec"><h3>نوع معامله</h3>${seg('deal', { sell: '🏷 فروش', rent: '🔑 اجاره', mortgage: '💰 رهن' })}</div>
  <div class="sec"><h3>نوع ملک</h3>${seg('ptype', types)}</div>
  <div class="sec"><h3>محله / خیابان</h3>
    <div class="sugg" id="sel"></div>
    <input class="inp" id="dq" placeholder="مثلاً ارم، قصرالدشت، ابیوردی، چمران…" autocomplete="off" style="margin-top:8px">
    <button class="sbtn" id="btnMap" style="margin-top:8px">🗺 روی نقشه</button>
    <div class="sugg" id="dsug"></div></div>
  <div class="sec"><h3>بازه‌ی زمانی</h3>${seg('window', { '1d': 'امروز', '3d': '۳ روز', '7d': '۱ هفته', custom: S.range ? '📅 ' + jLabel(S.range.from) + (S.range.to !== S.range.from ? ' تا ' + jLabel(S.range.to) : '') : '📅 تقویم' })}</div>
  <div class="sec tog"><div><b>فقط آگهی‌های شخصی</b></div><button class="sw ${S.personal ? 'on' : ''}" id="pers"></button></div>
  <div class="sec"><details ${S.min_price || S.max_price || S.min_area || S.max_area ? 'open' : ''}><summary>قیمت و متراژ</summary>
    <div class="row2"><input class="inp" id="minp" placeholder="${priceLbl} از"><input class="inp" id="maxp" placeholder="تا"></div>
    <div class="row2"><input class="inp" inputmode="numeric" id="mina" placeholder="متراژ از (متر)"><input class="inp" inputmode="numeric" id="maxa" placeholder="تا"></div></details></div>
  <div class="sec"><h3>تکرار خودکار</h3>${seg('repeat', { 0: 'یک بار', 360: 'هر ۶ ساعت', 720: 'هر ۱۲ ساعت', 1440: 'روزانه' })}</div>
  <div class="sec"><details><summary>یا لینک جستجوی دیوار</summary>
    <textarea class="inp" id="url" rows="3" dir="ltr" style="margin-top:8px" placeholder="https://divar.ir/s/shiraz/buy-apartment?districts=522"></textarea></details></div>
  <button class="big" id="btnLive">🚀 جستجوی تازه در دیوار</button>
  <button class="big alt" id="btnStored">🗂 فقط از آگهی‌های ذخیره‌شده</button>
  <div class="row2" style="padding:0 12px"><button class="big alt" style="margin:0;width:auto" id="btnJobs">🕘 کارها</button><button class="big alt" style="margin:0;width:auto" id="btnHelp">❓ راهنما</button></div><div style="height:16px"></div>`;
  $app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    haptic(); readInputs();
    if (b.dataset.k === 'window' && b.dataset.v === 'custom')
      return openDateRange(S.range, r => { if (r) { S.range = r; S.window = 'custom'; } Search(); });
    S[b.dataset.k] = b.dataset.k === 'repeat' ? +b.dataset.v : b.dataset.v; Search();
  });
  pers.onclick = () => { haptic(); S.personal = !S.personal; pers.classList.toggle('on', S.personal); };
  minp.value = S.min_price ? money(S.min_price) : ''; maxp.value = S.max_price ? money(S.max_price) : ''; mina.value = S.min_area; maxa.value = S.max_area;
  drawSel(); dq.oninput = () => suggest(dq.value); suggest('');
  btnMap.onclick = () => { haptic(); readInputs(); openAreaPicker(S.areas, a => { S.areas = a; drawSel(); }); };
  btnLive.onclick = () => submit('live'); btnStored.onclick = () => submit('stored');
  btnJobs.onclick = () => send({ v: 1, a: 'jobs' }, 'jobs'); btnHelp.onclick = () => send({ v: 1, a: 'help' }, 'help');
}
function parseMoney(s) {
  if (!s) return ''; s = String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,،\s]/g, '');
  let m = 1; if (/میلیارد/.test(s)) m = 1e9; else if (/میلیون/.test(s)) m = 1e6; else if (/هزار/.test(s)) m = 1e3;
  const n = parseFloat(s.replace(/[^\d.]/g, '')); return isNaN(n) ? '' : Math.round(n * m);
}
function readInputs() { if (!window.minp) return; S.min_price = parseMoney(minp.value) || ''; S.max_price = parseMoney(maxp.value) || ''; S.min_area = parseMoney(mina.value) || ''; S.max_area = parseMoney(maxa.value) || ''; }
function addStreet(h) {
  if (!S.streets.some(s => norm(s.name) === norm(h.name))) S.streets.push({ name: h.name, district: h.district, districtId: h.districtId, districtIds: h.districtIds });
  for (const id of h.districtIds || [h.districtId]) {
    const d = DIST.find(x => x[0] === id); if (d && !S.districts.some(x => x[0] === id)) S.districts.push(d);
  }
}
let openLimit = 12;
const startsWithDigit = s => /^[0-9۰-۹]/.test(s);
const natural = (a, b) => (startsWithDigit(a) - startsWithDigit(b)) || a.localeCompare(b, 'fa', { numeric: true });
const hasLetters = s => /[\u0600-\u06FFa-zA-Z]{2}/.test(s.replace(/[0-9۰-۹]/g, ''));
/** Streets of the opened district in three sections: main streets (Divar's list + OSM main roads,
 *  DIST[i][5] of them lead the list), alleys grouped by their street («رادفر (همه، ۱۲)»), other alleys. */
function districtStreets(d) {
  const all = streetParts(d[2]).filter(hasLetters), nMain = d[5] || 0;
  const taken = new Set(S.streets.map(s => norm(s.name)));
  const item = (name, label) => ({ name, label: label || name });
  const groups = [...streetGroups().values()].filter(g => g.ids.has(d[0]));
  const inGroup = new Set(groups.flatMap(g => [...g.members].map(norm)));
  const main = all.slice(0, nMain).filter(st => !inGroup.has(norm(st)) || streetBase(st) === st).map(st => item(st));
  const mainSet = new Set(main.map(x => norm(x.name)));
  const grouped = groups.sort((a, b) => b.members.size - a.members.size || natural(a.name, b.name))
    .map(g => item(g.name + '*', `${g.name} (همه، ${[...g.members].filter(m => streetParts(d[2]).includes(m)).length.toLocaleString('fa-IR')})`));
  const others = all.slice(nMain).filter(st => !inGroup.has(norm(st)) && !mainSet.has(norm(st))).sort(natural).map(st => item(st));
  const free = x => !taken.has(norm(x.name));
  return [['خیابان‌های اصلی', main.filter(free)], ['کوچه‌ها به تفکیک خیابان', grouped.filter(free)], ['کوچه‌های دیگر', others.filter(free)]];
}
function drawSel() {
  const chips = [];
  const label = s => s.name.endsWith('*') ? `${s.name.slice(0, -1)} (همه)` : `${s.name} · ${s.district}`;
  S.streets.forEach(s => chips.push(`<button class="chip on x" data-kind="street" data-name="${esc(s.name)}">${esc(label(s))}</button>`));
  S.districts.forEach(d => {
    // a district reached through a chosen street stays visible (lighter) as the handle to its streets
    const cov = S.streets.some(s => (s.districtIds || [s.districtId]).includes(d[0])) ? ' cov' : '';
    chips.push(`<span class="chip on dchip${cov} ${S.open === d[0] ? 'open' : ''}"><button data-open="${d[0]}">${esc(d[1])} ▾</button><button class="x" data-kind="district" data-id="${d[0]}">✕</button></span>`);
  });
  S.areas.forEach((a, i) => chips.unshift(`<button class="chip on x" data-kind="area" data-i="${i}">${esc(areaLabel(a))}</button>`));
  const n = S.districts.length + S.streets.length + S.areas.length;
  const od = S.open && S.districts.find(d => d[0] === S.open);
  let panel = '';
  if (od) {
    const sections = districtStreets(od), flat = [];
    panel = `<div class="dstreets"><div class="dsthead">${esc(od[1])}</div>` + sections.map(([title, list], k) => {
      if (!list.length) return '';
      const cut = k === 2 ? openLimit : list.length;  // only «other alleys» is collapsed
      const chipsHtml = list.slice(0, cut).map(x => { flat.push(x); return `<button class="chip" data-st="${flat.length - 1}">${esc(x.label)}</button>`; }).join(' ');
      const more = list.length > cut ? ` <button class="chip" id="stmore">+ ${(list.length - cut).toLocaleString('fa-IR')} کوچه‌ی دیگر</button>` : '';
      return `<div class="dsec"><div class="muted">${title}</div>${chipsHtml}${more}</div>`;
    }).join('') + (flat.length ? '' : '<span class="muted">خیابانی ثبت نشده</span>') + '</div>';
    setTimeout(() => {
      sel.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
        const x = flat[+b.dataset.st]; haptic();
        addStreet({ name: x.name, district: od[1], districtId: od[0], districtIds: [od[0]] }); drawSel();  // stay in this district
      });
      const more = document.getElementById('stmore'); if (more) more.onclick = () => { openLimit += 60; drawSel(); };
    });
  }
  sel.innerHTML = (n ? chips.join(' ') : '') + panel;
  sel.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { haptic(); S.open = S.open === +b.dataset.open ? null : +b.dataset.open; openLimit = 12; drawSel(); });
  sel.querySelectorAll('.chip.x, .chip .x').forEach(c => c.onclick = () => {
    if (c.dataset.kind === 'area') S.areas = S.areas.filter((_, i) => i !== +c.dataset.i);
    else if (c.dataset.kind === 'street') S.streets = S.streets.filter(s => s.name !== c.dataset.name);
    else { S.districts = S.districts.filter(d => d[0] != c.dataset.id); if (S.open == c.dataset.id) S.open = null; }
    drawSel(); suggest(dq.value);
  });
}
const POPULAR = [522, 515, 533, 505, 503, 2782, 511, 1357];
function streetParts(s) { return String(s || '').split(/[،,]/).map(x => x.trim()).filter(Boolean); }
function suggest(q) {
  const n = norm(q);
  const haveD = new Set(S.districts.map(d => d[0]));
  const haveS = new Set(S.streets.map(s => norm(s.name)));
  let hits = []; // {kind, id, name, district, label, districtId}
  if (!n) {
    hits = POPULAR.map(i => DIST.find(d => d[0] === i)).filter(Boolean)
      .map(d => ({ kind: 'district', districtId: d[0], name: d[1], district: d[1], label: d[1] }));
  } else {
    for (const d of DIST) {
      const dn = norm(d[1]);
      if (dn.startsWith(n) || dn.includes(n))
        hits.push({ kind: 'district', districtId: d[0], name: d[1], district: d[1], label: d[1], rank: dn === n ? 0 : dn.startsWith(n) ? 1 : 2 });
    }
    for (const d of DIST) {
      for (const st of streetParts(d[2])) {
        const r = streetRank(st, n);
        if (r >= 0)
          hits.push({ kind: 'street', districtId: d[0], name: st, district: d[1], label: `${st} · ${d[1]}`, rank: r });
      }
    }
    for (const [k, g] of streetGroups()) {
      if (k !== n && !k.startsWith(n)) continue;
      const ids = [...g.ids], names = DIST.filter(d => g.ids.has(d[0])).map(d => d[1]).join('، ');
      hits.push({ kind: 'street', districtId: ids[0], districtIds: ids, name: g.name + '*', district: names,
        label: `${g.name} (همه، ${g.members.size.toLocaleString('fa-IR')} کوچه/خیابان)`, rank: k === n ? -1 : 0.5 });
    }
    hits.sort((a, b) => (a.rank - b.rank) || a.label.localeCompare(b.label, 'fa'));
  }
  hits = hits.filter(h => h.kind === 'street' ? !haveS.has(norm(h.name)) : !haveD.has(h.districtId)).slice(0, 15);
  dsug.innerHTML = hits.map((h, i) => `<button class="chip" data-i="${i}" title="${esc(h.kind === 'street' ? h.district : (DIST.find(d => d[0] === h.districtId)?.[2] || ''))}">${esc(h.label)}</button>`).join('')
    || (n ? '<span class="muted">محله/خیابانی پیدا نشد</span>' : '');
  dsug.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    haptic();
    const h = hits[+c.dataset.i]; if (!h) return;
    if (h.kind === 'street') {
      addStreet(h);
      toast(`✅ ${h.name.endsWith('*') ? h.name.slice(0, -1) + ' (همه)' : 'خیابان ' + h.name + ' · ' + h.district}`, 1800);
    } else {
      const d = DIST.find(x => x[0] === h.districtId);
      if (d && !S.districts.some(x => x[0] === d[0])) S.districts.push(d);
      if (d) { S.open = d[0]; openLimit = 12; }  // show its streets right away
      toast(`✅ محله ${h.name}`, 1800);
    }
    drawSel(); suggest(dq.value);
  });
}
function submit(mode) {
  readInputs();
  const box = document.getElementById('url'), link = (box && box.value || '').trim();
  if (link && !/divar\.ir\/s\//.test(link)) return toast('لینک باید شبیه divar.ir/s/shiraz/… باشد');
  const q = { v: 1, a: mode, deal: S.deal, ptype: S.ptype, d: S.districts.map(d => d[0]),
    streets: S.streets.map(s => s.name), w: S.window, p: S.personal ? 1 : 0, rep: mode === 'live' ? S.repeat : 0 };
  for (const k of ['min_price', 'max_price', 'min_area', 'max_area']) if (S[k]) q[k] = S[k];
  if (S.areas.length) q.areas = S.areas;
  if (S.window === 'custom' && S.range) { q.from = S.range.from; q.to = S.range.to; }
  if (link) { q.url = link; q.a = 'live'; }
  send(q, mode);
}
// compact start-parameter (<=64 chars, [A-Za-z0-9_-]) for launches that cannot sendData
const DEAL_C = { sell: 's', rent: 'r', mortgage: 'm' }, TYPE_C = { any: 'x', apartment: 'a', villa: 'v', land: 'l', commercial: 'c', building: 'b' }, WIN_C = { '1d': '1', '3d': '3', '7d': '7' }, REP_C = { 0: '0', 360: '6', 720: 'c', 1440: 'd' };
function startCode(q) {
  if (q.a === 'jobs') return 'jobs'; if (q.a === 'help') return 'help';
  if (q.url) return null;
  if ((q.streets && q.streets.length) || q.areas || q.from) return null; // the short link cannot carry them
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
  // Only the chat-keyboard launch can hand the whole search to the bot: keep the choices for then.
  try { localStorage.setItem('dy_draft', JSON.stringify(S)); } catch (e) { }
  toast('خیابان و محدوده‌ی نقشه فقط وقتی فرستاده می‌شود که برنامه را از دکمه‌ی «📱 جستجو با مینی‌اپ» پایین چت باز کنید. انتخاب‌هایتان ذخیره شد؛ از آن دکمه باز کنید و دوباره بزنید.', 8000);
}

// ---------------------------------------------------------------- results viewer (#data=)
async function inflate(b64) {
  const bin = Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const ds = new DecompressionStream('deflate-raw');
  const txt = await new Response(new Blob([bin]).stream().pipeThrough(ds)).text();
  return JSON.parse(txt);
}
const F = ['id', 'title', 'price', 'deposit', 'rent', 'area', 'rooms', 'floor', 'year', 'kind', 'deal', 'district', 'verdict', 'status', 'token', 'photo', 'deco', 'lat', 'lng'];
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
  let filt = 'all', mapView = false;
  const hasPoints = items.some(i => i.lat && i.lng);
  const openListing = i => { const u = 'https://divar.ir/v/' + i.token; tg ? tg.openLink(u) : window.open(u); };
  const draw = () => {
    const show = items.filter(i => filt === 'all' || i.status === filt);
    const body = mapView ? '<div id="resmap"></div><div class="muted pad" style="font-size:12px">جای نقطه‌ها تقریبی است (دیوار نقطه را تا حدود ۵۰۰ متر جابه‌جا نشان می‌دهد).</div>'
      : show.map(card).join('') || '<div class="empty">آگهی‌ای نیست</div>';
    $app.innerHTML = `<div class="hdr"><h1>${esc(r.t)}</h1><p>${fa(r.n)} آگهی${r.n > items.length ? ` · ${fa(items.length)} تای اول اینجا، همه در فایل اکسل/HTML چت` : ''}</p></div>
    <div class="stats"><button class="st ${filt === 'all' ? 'chip on' : ''}" data-f="all"><b>${fa(items.length)}</b>همه</button>${Object.entries(st).map(([s, n]) => `<button class="st" data-f="${esc(s)}" style="${filt === s ? 'outline:2px solid var(--btn)' : ''}"><b>${fa(n)}</b>${SL[s] || esc(s)}</button>`).join('')}</div>
    ${hasPoints ? `<div class="pad" style="padding-top:0"><button class="sbtn" id="btnView">${mapView ? '📋 فهرست' : '🗺 روی نقشه'}</button></div>` : ''}
    ${body}
    <button class="big alt" id="btnNew">🔎 جستجوی جدید</button><div style="height:16px"></div>`;
    $app.querySelectorAll('.stats [data-f]').forEach(b => b.onclick = () => { filt = b.dataset.f; draw(); });
    if (hasPoints) btnView.onclick = () => { haptic(); mapView = !mapView; draw(); };
    if (mapView) showResultsMap(document.getElementById('resmap'), show, openListing);
    $app.querySelectorAll('.card .sbtn').forEach(b => b.onclick = ev => {
      ev.stopPropagation(); const c = b.closest('.card');
      if (b.dataset.a === 'o') { const u = 'https://divar.ir/v/' + c.dataset.t; tg ? tg.openLink(u) : window.open(u); }
      else { const u = `https://t.me/${BOT}?start=d_${c.dataset.id}`; tg ? (tg.openTelegramLink(u), setTimeout(() => tg.close(), 400)) : (location.href = u); }
    });
    $app.querySelectorAll('.card').forEach(c => c.onclick = () => { const u = 'https://divar.ir/v/' + c.dataset.t; tg ? tg.openLink(u) : window.open(u); });
    btnNew.onclick = async () => { try { sessionStorage.removeItem('dy_data') } catch (e) { } history.replaceState(null, '', location.pathname); if (!DIST.length) { try { DIST = await (await fetch('districts.json?v=3')).json(); } catch (e) { } } Search(); };
  };
  draw();
}

// ---------------------------------------------------------------- boot
(async function boot() {
  if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('secondary_bg_color') } catch (e) { } }
  const h = new URLSearchParams(location.hash.slice(1)), qs = new URLSearchParams(location.search);
  const data = h.get('data') || qs.get('data') || (sessionStorage.getItem('dy_data') || '');
  if (data) { try { sessionStorage.setItem('dy_data', data) } catch (e) { } return Results(data); }
  try { DIST = await (await fetch('districts.json?v=3')).json(); } catch (e) { DIST = [[522, 'ارم', ''], [515, 'قصرالدشت', '']]; }
  try { const d = JSON.parse(localStorage.getItem('dy_draft') || 'null'); if (d) { Object.assign(S, d); localStorage.removeItem('dy_draft'); } } catch (e) { }
  Search();
})();
