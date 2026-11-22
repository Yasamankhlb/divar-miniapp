// Map for the Mini App: draw one or more search areas (circles or freehand shapes) and see results
// as dots. Leaflet is shipped in vendor/ (CDNs are often blocked in Iran); tiles: OpenStreetMap.
// An area is {c: [lat, lng, radius_m]} or {p: [[lat, lng], ...]} (what the bot receives).
const SHIRAZ = [29.6168, 52.5370];
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const MAX_AREAS = 6, MAX_POINTS = 24; // sendData is limited to 4 KB
let leafletReady = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((ok, fail) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'vendor/leaflet/leaflet.js'; js.onload = ok; js.onerror = fail;
    document.head.appendChild(js);
  });
  return leafletReady;
}

function baseMap(el, center, zoom) {
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, zoom);
  L.tileLayer(TILES, { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  return map;
}

const meters = r => r >= 1000 ? `${(r / 1000).toLocaleString('fa-IR')} کیلومتر` : `${r.toLocaleString('fa-IR')} متر`;
const STYLE = { color: '#2481cc', weight: 2, fillOpacity: 0.15 };
const PICKED = { color: '#f59e0b', weight: 3, fillOpacity: 0.25 };

function shapeLayer(a) {
  return a.c ? L.circle([a.c[0], a.c[1]], { ...STYLE, radius: a.c[2] }) : L.polygon(a.p, STYLE);
}

/** Keep every k-th point so a finger stroke stays small enough for Telegram's 4 KB data limit. */
function simplify(pts) {
  const step = Math.max(1, Math.ceil(pts.length / MAX_POINTS));
  return pts.filter((_, i) => i % step === 0).map(p => [+p.lat.toFixed(5), +p.lng.toFixed(5)]);
}

// ---- areas -> Divar district names (district map points are DIST[i][3], DIST[i][4])
function kmBetween(a, b) {
  const dy = (a[0] - b[0]) * 111, dx = (a[1] - b[1]) * 111 * Math.cos(a[0] * Math.PI / 180);
  return Math.hypot(dx, dy);
}
function inPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > pt[0]) !== (yj > pt[0]) && pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function kmOutside(pt, a) {
  if (a.c) return Math.max(0, kmBetween(pt, a.c) - a.c[2] / 1000);
  return inPolygon(pt, a.p) ? 0 : Math.min(...a.p.map(v => kmBetween(pt, v)));
}
/** Districts an area covers: centers inside it (or within 300 m), else the nearest one. */
function areaDistricts(a) {
  const scored = (typeof DIST === 'undefined' ? [] : DIST).filter(d => d[3]).map(d => [kmOutside([d[3], d[4]], a), d]).sort((x, y) => x[0] - y[0]);
  const near = scored.filter(([g]) => g <= 0.3).map(([, d]) => d);
  return near.length ? near : scored.slice(0, 1).map(([, d]) => d);
}
function areaNames(a, max = 4) {
  const names = areaDistricts(a).map(d => d[1]);
  return names.slice(0, max).join('، ') + (names.length > max ? ` و ${(names.length - max).toLocaleString('fa-IR')} محله‌ی دیگر` : '');
}

/** Full-screen editor. areas: current list; done(list). */
async function openAreaPicker(areas, done) {
  try { await loadLeaflet(); } catch (e) { toast('نقشه بارگذاری نشد؛ اینترنت را بررسی کنید'); return; }
  let list = areas.map(a => JSON.parse(JSON.stringify(a))), mode = 'circle', layers = [], picked = list.length - 1;
  const box = document.createElement('div');
  box.className = 'mapbox';
  box.innerHTML = `<div class="mapmodes"><button class="chip on" data-m="circle">⭕ دایره</button><button class="chip" data-m="draw">✏️ کشیدن با انگشت</button></div>
    <div class="maphint" id="maphint"></div>
    <div id="pickmap"></div>
    <div class="mapbar" id="radbar"><input type="range" id="rad" min="200" max="3000" step="100" value="800"><span id="radl"></span></div>
    <div class="arealist" id="arealist"></div>
    <div class="row2 mapbtns"><button class="big" id="mapok">✅ تأیید</button><button class="big alt" id="mapno">لغو</button></div>`;
  document.body.appendChild(box);
  const $ = s => box.querySelector(s);
  const map = baseMap('pickmap', SHIRAZ, 12);
  const pick = i => { picked = i; const a = list[i]; if (a && a.c) $('#rad').value = a.c[2]; haptic(); redraw(); };
  const remove = i => { list.splice(i, 1); picked = list.length - 1; haptic(); redraw(); };
  const redraw = () => {
    layers.forEach(l => l.remove());
    layers = list.map((a, i) => {
      const l = shapeLayer(a).setStyle(i === picked ? PICKED : STYLE).addTo(map);
      l.on('click', ev => { L.DomEvent.stop(ev); pick(i); });
      return l;
    });
    const sel = list[picked];
    $('#maphint').textContent = mode === 'circle'
      ? (sel && sel.c ? 'نوار پایین اندازه‌ی دایره‌ی نارنجی را عوض می‌کند؛ برای دایره‌ی دیگر روی آن بزنید.' : 'روی نقشه بزنید تا دایره اضافه شود.')
      : 'دور محدوده را با انگشت بکشید؛ برای انتخاب یک شکل، روی آن یک ضربه بزنید.';
    $('#radl').textContent = meters(+$('#rad').value);
    $('#radbar').style.display = mode === 'circle' && sel && sel.c ? 'flex' : mode === 'circle' ? 'flex' : 'none';
    $('#arealist').innerHTML = list.map((a, i) => `<div class="arow ${i === picked ? 'on' : ''}" data-i="${i}">
        <span>${a.c ? '⭕' : '✏️'} ${esc(areaNames(a))}</span><button class="x" data-del="${i}" aria-label="حذف">✕</button></div>`).join('')
      + (list.length > 1 ? '<button class="sbtn" id="clearall">🧹 پاک کردن همه</button>' : '');
    $('#arealist').querySelectorAll('.arow').forEach(r => r.onclick = () => pick(+r.dataset.i));
    $('#arealist').querySelectorAll('[data-del]').forEach(b => b.onclick = ev => { ev.stopPropagation(); remove(+b.dataset.del); });
    const all = $('#clearall'); if (all) all.onclick = () => { list = []; picked = -1; haptic(); redraw(); };
  };
  if (list.length) map.fitBounds(L.featureGroup(list.map(shapeLayer)).getBounds().pad(0.3));
  const add = a => {
    if (list.length >= MAX_AREAS) return toast(`حداکثر ${MAX_AREAS.toLocaleString('fa-IR')} محدوده`);
    haptic(); list.push(a); picked = list.length - 1; redraw();
  };
  map.on('click', ev => { if (mode === 'circle') add({ c: [+ev.latlng.lat.toFixed(5), +ev.latlng.lng.toFixed(5), +$('#rad').value] }); });

  // freehand: while drawing, the map does not pan; the finger stroke becomes a polygon, a tap picks a shape
  let stroke = null, line = null;
  const el = map.getContainer();
  const at = ev => map.mouseEventToLatLng(ev.touches ? ev.touches[0] : ev);
  const start = ev => { if (mode !== 'draw') return; ev.preventDefault(); stroke = [at(ev)]; line = L.polyline(stroke, STYLE).addTo(map); };
  const move = ev => { if (!stroke) return; ev.preventDefault(); stroke.push(at(ev)); line.setLatLngs(stroke); };
  const end = () => {
    if (!stroke) return;
    line.remove();
    if (stroke.length >= 6) add({ p: simplify(stroke) });
    else {
      const pt = [stroke[0].lat, stroke[0].lng], hit = list.findIndex(a => kmOutside(pt, a) === 0);
      if (hit >= 0) pick(hit);
    }
    stroke = null;
  };
  el.addEventListener('touchstart', start, { passive: false }); el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end); el.addEventListener('mousedown', start); el.addEventListener('mousemove', move);
  el.addEventListener('mouseup', end);

  box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    mode = b.dataset.m;
    box.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b));
    if (mode === 'draw') map.dragging.disable(); else map.dragging.enable();
    redraw();
  });
  $('#rad').oninput = () => {  // resize the picked circle live
    const sel = list[picked];
    if (sel && sel.c) { sel.c[2] = +$('#rad').value; layers[picked].setRadius(sel.c[2]); $('#arealist .arow.on span').textContent = '⭕ ' + areaNames(sel); }
    $('#radl').textContent = meters(+$('#rad').value);
  };
  const close = v => { map.remove(); box.remove(); done(v); };
  $('#mapno').onclick = () => close(areas);
  $('#mapok').onclick = () => close(list);
  redraw();
}

/** Results as dots (positions are approximate: Divar blurs most map points by ~500 m). */
async function showResultsMap(el, items, onPick, areas) {
  try { await loadLeaflet(); } catch (e) { el.innerHTML = '<div class="empty">نقشه بارگذاری نشد</div>'; return; }
  const pts = items.filter(i => i.lat && i.lng);
  if (!pts.length) { el.innerHTML = '<div class="empty">هیچ‌کدام از این آگهی‌ها نقطه‌ی نقشه ندارند</div>'; return; }
  const map = baseMap(el, [pts[0].lat, pts[0].lng], 13);
  (areas || []).forEach(a => shapeLayer(a).addTo(map));
  const group = L.featureGroup().addTo(map);
  for (const i of pts) {
    L.circleMarker([i.lat, i.lng], { radius: 8, color: '#fff', weight: 2, fillColor: i.status === 'مشاور' ? '#e5534b' : '#2481cc', fillOpacity: 0.9 })
      .bindPopup(`<b>${esc(i.title)}</b><br>${priceLine(i)}<br><a href="#">دیدن آگهی ↗</a>`)
      .on('popupopen', ev => { const a = ev.popup.getElement().querySelector('a'); if (a) a.onclick = e => { e.preventDefault(); onPick(i); }; })
      .addTo(group);
  }
  if (pts.length > 1) map.fitBounds(group.getBounds().pad(0.2));
  return map;
}

const areaLabel = a => `${a.c ? '⭕' : '✏️'} ${areaNames(a, 3)}`;
