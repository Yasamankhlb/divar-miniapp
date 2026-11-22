// Persian (Jalali) calendar: conversion (jalaali-js algorithm, MIT) and a month-grid range picker.
const JBREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const idiv = (a, b) => ~~(a / b), imod = (a, b) => a - ~~(a / b) * b;
function jalCal(jy) {
  const gy = jy + 621; let leapJ = -14, jp = JBREAKS[0], jump = 0;
  for (let i = 1; i < JBREAKS.length; i++) {
    const jm = JBREAKS[i]; jump = jm - jp; if (jy < jm) break;
    leapJ += idiv(jump, 33) * 8 + idiv(imod(jump, 33), 4); jp = jm;
  }
  let n = jy - jp;
  leapJ += idiv(n, 33) * 8 + idiv(imod(n, 33) + 3, 4);
  if (imod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = idiv(gy, 4) - idiv((idiv(gy, 100) + 1) * 3, 4) - 150;
  if (jump - n < 6) n = n - jump + idiv(jump + 4, 33) * 33;
  let leap = imod(imod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4;
  return { leap, gy, march: 20 + leapJ - leapG };
}
function g2d(gy, gm, gd) {
  let d = idiv((gy + idiv(gm - 8, 6) + 100100) * 1461, 4) + idiv(153 * imod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - idiv(idiv(gy + 100100 + idiv(gm - 8, 6), 100) * 3, 4) + 752;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j += idiv(idiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = idiv(imod(j, 1461), 4) * 5 + 308, gd = idiv(imod(i, 153), 5) + 1, gm = imod(idiv(i, 153), 12) + 1;
  return { gy: idiv(j, 1461) - 100100 + idiv(8 - gm, 6), gm, gd };
}
function toJalali(gy, gm, gd) {
  const jdn = g2d(gy, gm, gd), g = d2g(jdn); let jy = g.gy - 621; const r = jalCal(jy);
  let k = jdn - g2d(g.gy, 3, r.march);
  if (k >= 0) { if (k <= 185) return { jy, jm: 1 + idiv(k, 31), jd: imod(k, 31) + 1 }; k -= 186; }
  else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  return { jy, jm: 7 + idiv(k, 30), jd: imod(k, 30) + 1 };
}
function toGregorian(jy, jm, jd) {
  const r = jalCal(jy);
  return d2g(g2d(r.gy, 3, r.march) + (jm - 1) * 31 - idiv(jm, 7) * (jm - 7) + jd - 1);
}
const jMonthLen = (jy, jm) => jm <= 6 ? 31 : jm <= 11 ? 30 : jalCal(jy).leap === 0 ? 30 : 29;
const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const pad2 = n => String(n).padStart(2, '0');
const isoOf = (jy, jm, jd) => { const g = toGregorian(jy, jm, jd); return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`; };
function jOf(iso) { const [y, m, d] = iso.split('-').map(Number); return toJalali(y, m, d); }
const jLabel = iso => { const j = jOf(iso); return `${j.jd.toLocaleString('fa-IR')} ${J_MONTHS[j.jm - 1]}`; };

/** Bottom sheet with a Persian month grid: tap the first and last day. done({from, to}) in ISO dates. */
function openDateRange(cur, done) {
  const t = new Date(), today = toJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());
  const todayIso = isoOf(today.jy, today.jm, today.jd);
  let y = today.jy, m = today.jm, from = cur && cur.from, to = cur && cur.to;
  const box = document.createElement('div');
  box.className = 'mapbox sheet';
  document.body.appendChild(box);
  const draw = () => {
    const first = toGregorian(y, m, 1), wd = (new Date(first.gy, first.gm - 1, first.gd).getDay() + 1) % 7; // Saturday = 0
    const cells = Array(wd).fill('<span></span>');
    for (let d = 1; d <= jMonthLen(y, m); d++) {
      const iso = isoOf(y, m, d), future = iso > todayIso;
      const on = iso === from || iso === to, mid = from && to && iso > from && iso < to;
      cells.push(`<button class="day${on ? ' on' : ''}${mid ? ' mid' : ''}" data-d="${iso}" ${future ? 'disabled' : ''}>${d.toLocaleString('fa-IR')}</button>`);
    }
    box.innerHTML = `<div class="cal">
      <div class="calhd"><button class="sbtn" id="calnext">›</button><b>${J_MONTHS[m - 1]} ${y.toLocaleString('fa-IR', { useGrouping: false })}</b><button class="sbtn" id="calprev">‹</button></div>
      <div class="calgrid">${['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(w => `<span class="muted">${w}</span>`).join('')}${cells.join('')}</div>
      <div class="caltxt">${from ? 'از ' + jLabel(from) + (to ? ' تا ' + jLabel(to) : ' — روز آخر را بزنید') : 'روز اول را بزنید'}</div>
      <div class="row2 mapbtns"><button class="big" id="calok">✅ تأیید</button><button class="big alt" id="calno">لغو</button></div></div>`;
    box.querySelector('#calprev').onclick = () => { if (--m < 1) { m = 12; y--; } draw(); };
    box.querySelector('#calnext').onclick = () => { if (y < today.jy || m < today.jm) { if (++m > 12) { m = 1; y++; } draw(); } };
    box.querySelectorAll('.day').forEach(b => b.onclick = () => {
      haptic(); const d = b.dataset.d;
      if (!from || to || d < from) { from = d; to = null; } else to = d;
      draw();
    });
    box.querySelector('#calno').onclick = () => { box.remove(); done(cur); };
    box.querySelector('#calok').onclick = () => {
      if (!from) return toast('یک روز را انتخاب کنید');
      box.remove(); done({ from, to: to || from });
    };
  };
  draw();
}
