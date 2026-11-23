/* دیوار‌یار — static Telegram Mini App (no secrets in the client).
   Search → bot:
     - keyboard button → Telegram.WebApp.sendData(JSON)
     - menu / inline → short ?start= code, or POST /pending then ?start=p_<id> for streets/areas
   Results (#data=...): compressed list the bot put in the URL fragment. */
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
const WIZ = [
  { title: 'نوع معامله', hint: 'فروش می‌خواهید، اجاره، یا رهن کامل؟' },
  { title: 'نوع ملک', hint: 'چه ملکی را جستجو کنیم؟' },
  { title: 'محله‌ها', hint: 'یک یا چند محله و خیابان را انتخاب کنید' },
  { title: 'زمان و فیلترها', hint: 'بازه، آگهی شخصی، و در صورت تمایل قیمت' },
  { title: 'تأیید و شروع', hint: 'انتخاب‌ها را یک‌بار دیگر ببینید، بعد شروع کنید' },
];
const DEAL_LBL = { sell: '🏷 فروش', rent: '🔑 اجاره', mortgage: '💰 رهن' };
const TYPE_LBL = { any: 'همهٔ انواع ملک', apartment: '🏢 آپارتمان', villa: '🏡 ویلا / خانه', land: '🌱 زمین / کلنگی', commercial: '🏬 تجاری / اداری', building: '🏗 ساختمان کامل' };
function goStep(n) {
  const toastEl = document.getElementById('toast'); if (toastEl) toastEl.style.display = 'none';
  S.step = Math.max(1, Math.min(5, n));
  S.maxStep = Math.max(S.maxStep || 1, S.step);
  Search();
}
function stepBar() {
  const title = WIZ[S.step - 1];
  const dots = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="dot ${n === S.step ? 'on' : ''} ${n < S.step ? 'done' : ''}" data-go="${n}" aria-label="مرحله ${n}" ${n > (S.maxStep || S.step) ? 'disabled' : ''}></button>`
  ).join('');
  return `<div class="steps">${dots}<span class="steplbl">${fa(S.step)} از ۵ — ${title.title}</span></div>
    <div class="hdr"><h1>${S.editOf ? `✏️ ویرایش کار #${fa(S.editOf)}` : esc(title.title)}</h1><p>${title.hint}</p></div>`;
}
function dock(html) {
  return `<div class="dock">${html}</div><div style="height:84px"></div>`;
}
function placeSummary() {
  const bits = [
    ...S.districts.map(d => d[1]),
    ...S.streets.map(s => s.name.endsWith('*') ? s.name.slice(0, -1) + ' (همه)' : s.name),
    ...S.areas.map(a => (typeof areaLabel === 'function' ? areaLabel(a) : 'محدوده')),
  ];
  return bits.length ? bits.join('، ') : 'همه‌ی محله‌های شیراز';
}
function timeSummary() {
  if (S.window === 'custom' && S.range) return jLabel(S.range.from) + (S.range.to !== S.range.from ? ' تا ' + jLabel(S.range.to) : '');
  return { '1d': 'امروز (۲۴ ساعت)', '3d': '۳ روز اخیر', '7d': '۱ هفته اخیر' }[S.window] || 'امروز';
}
function Search() {
  if (!S.step) S.step = S.editOf ? 5 : 1;
  S.maxStep = Math.max(S.maxStep || 1, S.step);
  const types = { any: 'همه', apartment: '🏢 آپارتمان', villa: '🏡 ویلا / خانه', land: '🌱 زمین / کلنگی', commercial: '🏬 تجاری / اداری', building: '🏗 ساختمان کامل' };
  const priceLbl = S.deal === 'sell' ? 'قیمت (تومان)' : 'ودیعه (تومان)';
  let body = '';
  if (S.step === 1) {
    body = `<div class="sec tight"><div class="seg col">${seg('deal', DEAL_LBL)}</div></div>`
      + dock(`<button class="big" id="btnNext">ادامه</button>`);
  } else if (S.step === 2) {
    body = `<div class="sec tight"><div class="seg col">${seg('ptype', types)}</div></div>`
      + dock(`<button class="sbtn" id="btnBack">بازگشت</button><button class="big" id="btnNext">ادامه</button>`);
  } else if (S.step === 3) {
    body = `<div class="sec"><div class="sugg" id="sel"></div>
      <input class="inp" id="dq" placeholder="جستجوی محله یا خیابان، مثلاً قصرالدشت…" autocomplete="off" style="margin-top:8px">
      <button class="sbtn" id="btnMap" style="margin-top:10px">🗺 انتخاب روی نقشه</button>
      <div class="sugg" id="dsug"></div>
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">اگر محله‌ای نزنید، همه‌ی شیراز جستجو می‌شود. می‌توانید چند محله را با هم انتخاب کنید.</p></div>`
      + dock(`<button class="sbtn" id="btnBack">بازگشت</button><button class="big" id="btnNext">ادامه</button>`);
  } else if (S.step === 4) {
    body = `<div class="sec"><h3>بازه‌ی زمانی</h3>${seg('window', { '1d': 'امروز', '3d': '۳ روز', '7d': '۱ هفته', custom: S.range ? '📅 ' + jLabel(S.range.from) + (S.range.to !== S.range.from ? ' تا ' + jLabel(S.range.to) : '') : '📅 تقویم' })}</div>
      <div class="sec tog"><div><b>فقط آگهی‌های شخصی</b><div class="muted" style="font-size:12.5px;margin-top:2px">مشاورهای پنهان از روی متن کنار گذاشته می‌شوند</div></div><button class="sw ${S.personal ? 'on' : ''}" id="pers"></button></div>
      <div class="sec"><details ${S.min_price || S.max_price || S.min_area || S.max_area ? 'open' : ''}><summary>قیمت و متراژ (اختیاری)</summary>
        <div class="row2"><input class="inp" id="minp" placeholder="${priceLbl} از"><input class="inp" id="maxp" placeholder="تا"></div>
        <div class="muted" style="font-size:12px;margin-top:4px">مثلاً «۵ میلیارد» یا «۸۰۰ میلیون»</div>
        <div class="row2"><input class="inp" inputmode="numeric" id="mina" placeholder="متراژ از (متر)"><input class="inp" inputmode="numeric" id="maxa" placeholder="تا"></div></details></div>
      <div class="sec"><h3>تکرار خودکار <small>فقط جستجوی تازه</small></h3>${seg('repeat', { 0: 'یک بار', 360: 'هر ۶ ساعت', 720: 'هر ۱۲ ساعت', 1440: 'روزانه' })}</div>
      <div class="sec"><details><summary>یا لینک جستجوی دیوار</summary>
        <textarea class="inp" id="url" rows="3" dir="ltr" style="margin-top:8px" placeholder="https://divar.ir/s/shiraz/buy-apartment?districts=522"></textarea></details></div>`
      + dock(`<button class="sbtn" id="btnBack">بازگشت</button><button class="big" id="btnNext">ادامه</button>`);
  } else {
    const rows = [
      ['معامله', DEAL_LBL[S.deal] || S.deal],
      ['نوع ملک', TYPE_LBL[S.ptype] || S.ptype],
      ['محله', placeSummary()],
      ['بازه', timeSummary()],
      ['آگهی‌دهنده', S.personal ? '👤 فقط شخصی' : 'همه'],
    ];
    if (S.min_price || S.max_price) rows.push(['قیمت / ودیعه', (S.min_price ? money(S.min_price) : '…') + ' تا ' + (S.max_price ? money(S.max_price) : '…')]);
    if (S.min_area || S.max_area) rows.push(['متراژ', (S.min_area || '…') + ' تا ' + (S.max_area || '…') + ' متر']);
    if (S.repeat) rows.push(['تکرار', ({ 360: 'هر ۶ ساعت', 720: 'هر ۱۲ ساعت', 1440: 'روزانه' })[S.repeat] || '']);
    body = `<div class="sec"><div class="kv one">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div></div>
      <p class="muted pad" style="font-size:12.5px;line-height:1.8">🔒 شماره گرفته نمی‌شود و وارد حساب دیوار نمی‌شویم. بین صفحه‌ها حداقل ۸ ثانیه فاصله است.</p>`
      + dock(`<button class="sbtn" id="btnBack">بازگشت</button><button class="big" id="btnLive">🚀 جستجوی تازه</button>`)
      + `<button class="big alt" id="btnStored">🗂 فقط از آگهی‌های ذخیره‌شده</button>
         <div class="row2" style="padding:0 12px 20px"><button class="sbtn" id="btnJobs">🕘 کارها</button><button class="sbtn" id="btnHelp">❓ راهنما</button></div>`;
  }
  $app.innerHTML = stepBar() + body;
  $app.querySelectorAll('.dot[data-go]').forEach(b => b.onclick = () => { if (!b.disabled) { haptic(); readInputs(); goStep(+b.dataset.go); } });
  $app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    haptic(); readInputs();
    if (b.dataset.k === 'window' && b.dataset.v === 'custom')
      return openDateRange(S.range, r => { if (r) { S.range = r; S.window = 'custom'; } Search(); });
    S[b.dataset.k] = b.dataset.k === 'repeat' ? +b.dataset.v : b.dataset.v;
    if (S.step === 1 && b.dataset.k === 'deal') return goStep(2);
    if (S.step === 2 && b.dataset.k === 'ptype') return goStep(3);
    Search();
  });
  const back = document.getElementById('btnBack'), next = document.getElementById('btnNext');
  if (back) back.onclick = () => { haptic(); readInputs(); goStep(S.step - 1); };
  if (next) next.onclick = () => { haptic(); readInputs(); goStep(S.step + 1); };
  if (window.pers) pers.onclick = () => { haptic(); S.personal = !S.personal; pers.classList.toggle('on', S.personal); };
  if (window.minp) { minp.value = S.min_price ? money(S.min_price) : ''; maxp.value = S.max_price ? money(S.max_price) : ''; mina.value = S.min_area; maxa.value = S.max_area; }
  const urlBox = document.getElementById('url'); if (urlBox && S.url) urlBox.value = S.url;
  if (window.dq) { drawSel(); dq.oninput = () => suggest(dq.value); suggest(''); }
  if (window.btnMap) btnMap.onclick = () => { haptic(); readInputs(); openAreaPicker(S.areas, a => { S.areas = a; drawSel(); }); };
  if (window.btnLive) btnLive.onclick = () => submit('live');
  if (window.btnStored) btnStored.onclick = () => submit('stored');
  if (window.btnJobs) btnJobs.onclick = () => send({ v: 1, a: 'jobs' }, 'jobs');
  if (window.btnHelp) btnHelp.onclick = () => send({ v: 1, a: 'help' }, 'help');
}
function parseMoney(s) {
  if (!s) return ''; s = String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,،\s]/g, '');
  let m = 1; if (/میلیارد/.test(s)) m = 1e9; else if (/میلیون/.test(s)) m = 1e6; else if (/هزار/.test(s)) m = 1e3;
  const n = parseFloat(s.replace(/[^\d.]/g, '')); return isNaN(n) ? '' : Math.round(n * m);
}
function readInputs() {
  if (window.minp) {
    S.min_price = parseMoney(minp.value) || '';
    S.max_price = parseMoney(maxp.value) || '';
    S.min_area = parseMoney(mina.value) || '';
    S.max_area = parseMoney(maxa.value) || '';
  }
  const box = document.getElementById('url');
  if (box) S.url = (box.value || '').trim();
}
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
/** Main streets of a district (Divar's picker list + OSM main roads lead its list; DIST[i][5] of them). */
function mainStreets(d) {
  const all = streetParts(d[2]).filter(hasLetters);
  return d[5] ? all.slice(0, d[5]) : all;
}
function districtStreets(d) {
  const taken = new Set(S.streets.map(s => norm(s.name)));
  return [['خیابان‌های اصلی', mainStreets(d).filter(st => !taken.has(norm(st))).map(st => ({ name: st, label: st }))]];
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
      for (const st of mainStreets(d)) {  // main streets only: no alleys in search
        const r = streetRank(st, n);
        if (r >= 0)
          hits.push({ kind: 'street', districtId: d[0], name: st, district: d[1], label: `${st} · ${d[1]}`, rank: r });
      }
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
  const link = (S.url || '').trim();
  if (link && !/divar\.ir\/s\//.test(link)) return toast('لینک باید شبیه divar.ir/s/shiraz/… باشد');
  const q = { v: 1, a: mode, deal: S.deal, ptype: S.ptype, d: S.districts.map(d => d[0]),
    streets: S.streets.map(s => s.name), w: S.window, p: S.personal ? 1 : 0, rep: mode === 'live' ? S.repeat : 0 };
  for (const k of ['min_price', 'max_price', 'min_area', 'max_area']) if (S[k]) q[k] = S[k];
  if (S.areas.length) q.areas = S.areas;
  if (S.window === 'custom' && S.range) { q.from = S.range.from; q.to = S.range.to; }
  if (S.editOf) q.edit = S.editOf;  // the bot stops the old job and starts this one
  if (link) { q.url = link; q.a = 'live'; }
  send(q, mode);
}
// compact start-parameter (<=64 chars, [A-Za-z0-9_-]) for launches that cannot sendData
const DEAL_C = { sell: 's', rent: 'r', mortgage: 'm' }, TYPE_C = { any: 'x', apartment: 'a', villa: 'v', land: 'l', commercial: 'c', building: 'b' }, WIN_C = { '1d': '1', '3d': '3', '7d': '7' }, REP_C = { 0: '0', 360: '6', 720: 'c', 1440: 'd' };
function startCode(q) {
  if (q.a === 'jobs') return 'jobs'; if (q.a === 'help') return 'help';
  if (q.url) return null;
  if ((q.streets && q.streets.length) || q.areas || q.from || q.edit) return null; // the short link cannot carry them
  const m = v => v ? Math.round(v / 1e6).toString(36) : '', ar = v => v ? (+v).toString(36) : '';
  const code = 'q' + (q.a === 'live' ? 'L' : 'S') + DEAL_C[q.deal] + TYPE_C[q.ptype] + WIN_C[q.w] + q.p + REP_C[q.rep || 0] + '_' + q.d.map(i => i.toString(36)).join('-') + '_' + [m(q.min_price), m(q.max_price), ar(q.min_area), ar(q.max_area)].join('_');
  return code.length <= 64 ? code : null;
}
const PENDING = 'https://drbarzanouni.cartamed.homes/webhook/divar-pending';
async function send(q, mode) {
  haptic('medium');
  // Keyboard-button launch: Telegram.WebApp.sendData (app closes; bot answers in chat).
  if (fromKeyboard()) { tg.sendData(JSON.stringify(q)); return; }
  // Compact searches fit in ?start= (≤64 chars).
  const code = startCode(q);
  if (code && tg) { tg.openTelegramLink(`https://t.me/${BOT}?start=${code}`); setTimeout(() => tg.close(), 400); return; }
  if (code) { location.href = `https://t.me/${BOT}?start=${code}`; return; }
  // Menu / inline launch with streets or map areas: park the full query on the bot, then deep-link.
  if (tg && tg.initData) {
    try {
      toast('⏳ در حال ارسال…', 4000);
      const r = await fetch(PENDING, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData },
        body: JSON.stringify(q),
      });
      const j = await r.json();
      if (!r.ok || !j.id) throw new Error(j.error || ('http ' + r.status));
      tg.openTelegramLink(`https://t.me/${BOT}?start=p_${j.id}`);
      setTimeout(() => tg.close(), 400);
      return;
    } catch (err) {
      toast('ارسال نشد؛ دوباره امتحان کنید یا از دکمه‌ی جستجو پایین چت باز کنید.', 5000);
      return;
    }
  }
  toast('برای ارسال جستجو، برنامه را از تلگرام باز کنید.', 4000);
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
function card(i, picked) {
  const on = picked.has(+i.id);
  const ph = i.photo ? `<img loading="lazy" src="${esc(i.photo)}" onerror="this.remove()">` : '🏠';
  const m = [i.area ? fa(i.area) + ' متر' : '', i.rooms != null ? fa(i.rooms) + ' خواب' : '', i.floor != null ? 'طبقه ' + fa(i.floor) : '', i.year ? 'ساخت ' + fa(i.year) : ''].filter(Boolean).join(' · ');
  return `<div class="card ${on ? 'on' : ''}" data-t="${esc(i.token)}" data-id="${i.id}" role="checkbox" aria-checked="${on}">
  <div class="pick" aria-hidden="true">${on ? '✓' : ''}</div>
  <div class="im">${ph}${i.deco ? '<span class="dec">تزئینی</span>' : ''}</div><div class="bd">
  <div class="t">${esc(i.title)}</div><div class="price">${priceLine(i)}</div>
  <div class="meta">${esc(i.kind)} · ${esc(i.deal)} · ${esc(i.district || '')}<br>${m}</div>
  <div>${sbadge(i.status)}${vbadge(i.verdict)}</div>
  <div class="acts" style="display:flex;gap:6px;margin-top:6px"><button class="sbtn" data-a="d">🔎 جزئیات در چت</button><button class="sbtn" data-a="o">دیوار ↗</button></div></div></div>`;
}

/** Hand selected listing ids to the bot (queue phone reveals → web panel). */
async function sendPhonePick(ids) {
  const payload = { a: 'phones', ids };
  if (fromKeyboard()) { tg.sendData(JSON.stringify(payload)); return; }
  if (!tg || !tg.initData) { toast('برای ارسال، برنامه را از تلگرام باز کنید.', 4000); return; }
  try {
    const r = await fetch(PENDING, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': tg.initData },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok || !j.id) throw new Error(j.error || ('http ' + r.status));
    tg.openTelegramLink(`https://t.me/${BOT}?start=p_${j.id}`);
    setTimeout(() => tg.close(), 400);
  } catch (err) {
    toast('ارسال نشد؛ دوباره امتحان کنید.', 4000);
  }
}

function packZipStart(ids) {
  const code = 'z_' + ids.map(i => (+i).toString(36)).join('-');
  return code.length <= 64 ? code : null;
}
async function sendZip(ids, title) {
  if (!ids.length) return toast('اول آگهی‌ها را انتخاب کنید');
  haptic('medium');
  const payload = { v: 1, a: 'zip', ids, title: title || 'خروجی انتخاب‌شده' };
  if (fromKeyboard()) { tg.sendData(JSON.stringify(payload)); return; }
  const code = packZipStart(ids);
  if (code && tg) { tg.openTelegramLink(`https://t.me/${BOT}?start=${code}`); setTimeout(() => tg.close(), 400); return; }
  if (code) { location.href = `https://t.me/${BOT}?start=${code}`; return; }
  toast('تعداد انتخاب‌ها برای لینک کوتاه زیاد است. مینی‌اپ را از دکمه‌ی جستجو پایین چت باز کنید، یا در چت بفرستید: /zip ' + ids.join(' '), 7000);
}

async function Results(b64) {
  let r; try { r = await inflate(b64); } catch (e) { $app.innerHTML = '<div class="empty"><div class="ic">⚠️</div>این لینک نتیجه خراب است.<br>از بات دوباره جستجو کنید یا صفحه را ببندید.</div>'; return; }
  const items = r.i.map(a => Object.fromEntries(F.map((k, n) => [k, a[n]])));
  items.forEach(i => { if (i.photo && !/^https?:/.test(i.photo)) i.photo = 'https://s100.divarcdn.com/static/photo/neda/webp_post/' + i.photo + '.webp'; });
  const st = {}; items.forEach(i => st[i.status] = (st[i.status] || 0) + 1);
  let filt = 'all', mapView = false;
  const picked = new Set(); // listing ids the user ticks for phone → panel
  const hasPoints = items.some(i => i.lat && i.lng);
  const openListing = i => { const u = 'https://divar.ir/v/' + i.token; tg ? tg.openLink(u) : window.open(u); };
  const draw = () => {
    const show = items.filter(i => filt === 'all' || i.status === filt);
    const nPick = picked.size;
    const body = mapView ? '<div id="resmap"></div><div class="muted pad" style="font-size:12px">جای نقطه‌ها تقریبی است (دیوار نقطه را تا حدود ۵۰۰ متر جابه‌جا نشان می‌دهد).</div>'
      : show.map(i => card(i, picked)).join('') || '<div class="empty"><div class="ic" style="opacity:.7">🫙</div>آگهی‌ای با این فیلتر پیدا نشد.<br>بازگردید و فیلترها را کمی بازتر کنید.</div>';
    $app.innerHTML = `<div class="hdr"><h1>${esc(r.t)}</h1><p>${fa(r.n)} آگهی${r.n > items.length ? ` · ${fa(items.length)} تای اول` : ''} — برای خروجی، آگهی را تیک بزنید</p></div>
    <div class="stats"><button class="st ${filt === 'all' ? 'chip on' : ''}" data-f="all"><b>${fa(items.length)}</b>همه</button>${Object.entries(st).map(([s, n]) => `<button class="st" data-f="${esc(s)}" style="${filt === s ? 'outline:2px solid var(--btn)' : ''}"><b>${fa(n)}</b>${SL[s] || esc(s)}</button>`).join('')}</div>
    ${hasPoints ? `<div class="pad" style="padding-top:0"><button class="sbtn" id="btnView">${mapView ? '📋 فهرست' : '🗺 روی نقشه'}</button></div>` : ''}
    ${body}
    <button class="big alt" id="btnNew">🔎 جستجوی جدید</button>
    <div class="pickbar">
      <button class="sbtn" id="btnAll">${nPick && nPick === show.length ? 'لغو انتخاب' : 'انتخاب همه'}</button>
      <button class="big" id="btnZip" ${nPick ? '' : 'disabled'}>انتخاب شده: ${fa(nPick)} · خروجی زیپ</button>
      <button class="sbtn" id="btnPhones" ${nPick ? '' : 'disabled'}>📞 شماره به پنل</button>
    </div>
    <div style="height:8px"></div>`;
    $app.querySelectorAll('.stats [data-f]').forEach(b => b.onclick = () => { filt = b.dataset.f; draw(); });
    if (hasPoints) btnView.onclick = () => { haptic(); mapView = !mapView; draw(); };
    if (mapView) showResultsMap(document.getElementById('resmap'), show, openListing);
    $app.querySelectorAll('.card .sbtn').forEach(b => b.onclick = ev => {
      ev.stopPropagation(); const c = b.closest('.card');
      if (b.dataset.a === 'o') { const u = 'https://divar.ir/v/' + c.dataset.t; tg ? tg.openLink(u) : window.open(u); }
      else { const u = `https://t.me/${BOT}?start=d_${c.dataset.id}`; tg ? (tg.openTelegramLink(u), setTimeout(() => tg.close(), 400)) : (location.href = u); }
    });
    $app.querySelectorAll('.card').forEach(c => c.onclick = () => {
      if (mapView) return;
      const id = +c.dataset.id;
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      haptic(); draw();
    });
    btnAll.onclick = () => {
      if (picked.size === show.length) show.forEach(i => picked.delete(i.id));
      else show.forEach(i => picked.add(i.id));
      haptic(); draw();
    };
    btnZip.onclick = () => sendZip([...picked], r.t);
    btnPhones.onclick = async () => {
      if (!picked.size) return;
      const ids = [...picked];
      btnPhones.disabled = true;
      toast(`صف ${fa(ids.length)} شماره…`);
      await sendPhonePick(ids);
    };
    btnNew.onclick = async () => { try { sessionStorage.removeItem('dy_data') } catch (e) { } history.replaceState(null, '', location.pathname); if (!DIST.length) { try { DIST = await (await fetch('districts.json?v=3')).json(); } catch (e) { } } Search(); };
  };
  draw();
}

/** Fill the form with a job's search (from the bot's «✏️ ویرایش» button). */
function prefill(p) {
  S.editOf = p.edit;
  for (const k of ['deal', 'ptype', 'window', 'min_price', 'max_price', 'min_area', 'max_area']) if (p[k] != null) S[k] = p[k];
  if (p.personal != null) S.personal = !!p.personal;
  if (p.repeat != null) S.repeat = +p.repeat || 0;
  if (p.range) { S.range = p.range; S.window = 'custom'; }
  S.districts = (p.districts || []).map(id => DIST.find(d => d[0] === id)).filter(Boolean);
  S.streets = (p.streets || []).map(name => {
    const base = name.replace(/\*$/, ''), home = DIST.find(d => streetParts(d[2]).some(st => norm(st) === norm(base)));
    return { name, district: home ? home[1] : '', districtId: home ? home[0] : null, districtIds: home ? [home[0]] : [] };
  });
  S.areas = p.areas || [];
  if (p.url) S.editUrl = p.url;
}

// ---------------------------------------------------------------- boot
(async function boot() {
  if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('secondary_bg_color') } catch (e) { } }
  const h = new URLSearchParams(location.hash.slice(1)), qs = new URLSearchParams(location.search);
  const data = h.get('data') || qs.get('data') || (h.get('edit') ? '' : sessionStorage.getItem('dy_data') || '');
  if (data) { try { sessionStorage.setItem('dy_data', data) } catch (e) { } return Results(data); }
  try { DIST = await (await fetch('districts.json?v=3')).json(); } catch (e) { DIST = [[522, 'ارم', ''], [515, 'قصرالدشت', '']]; }
  try { const d = JSON.parse(localStorage.getItem('dy_draft') || 'null'); if (d) { Object.assign(S, d); localStorage.removeItem('dy_draft'); } } catch (e) { }
  const edit = h.get('edit');
  if (edit) { try { prefill(await inflate(edit)); } catch (e) { toast('اطلاعات کار برای ویرایش خوانا نبود'); } }
  Search();
  if (S.editUrl) { const u = document.getElementById('url'); u.value = S.editUrl; u.closest('details').open = true; }
})();
