// Map for the Mini App: pick a search area (tap a point + radius) and see results as dots.
// Leaflet is shipped in vendor/ (CDNs are often blocked in Iran); tiles come from OpenStreetMap.
const SHIRAZ = [29.6168, 52.5370];
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
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

/** Full-screen picker. area = [lat, lng, radius_m] or null; done(area|null). */
async function openAreaPicker(area, done) {
  try { await loadLeaflet(); } catch (e) { toast('نقشه بارگذاری نشد؛ اینترنت را بررسی کنید'); return; }
  const box = document.createElement('div');
  box.className = 'mapbox';
  box.innerHTML = `<div class="maphint">روی نقشه بزنید تا مرکز محدوده مشخص شود، بعد شعاع را تنظیم کنید.</div>
    <div id="pickmap"></div>
    <div class="mapbar"><input type="range" id="rad" min="200" max="3000" step="100" value="${area ? area[2] : 800}">
      <span id="radl"></span></div>
    <div class="row2 mapbtns"><button class="big" id="mapok">✅ تأیید محدوده</button><button class="big alt" id="mapno">لغو</button></div>`;
  document.body.appendChild(box);
  const map = baseMap('pickmap', area ? [area[0], area[1]] : SHIRAZ, area ? 14 : 12);
  let circle = null;
  const rad = box.querySelector('#rad'), radl = box.querySelector('#radl');
  const draw = latlng => {
    const r = +rad.value; radl.textContent = 'شعاع: ' + meters(r);
    if (!latlng) return;
    if (circle) circle.setLatLng(latlng).setRadius(r);
    else circle = L.circle(latlng, { radius: r, color: '#2481cc', weight: 2, fillOpacity: 0.15 }).addTo(map);
  };
  if (area) draw(L.latLng(area[0], area[1])); else draw(null);
  map.on('click', ev => { haptic(); draw(ev.latlng); });
  rad.oninput = () => draw(circle && circle.getLatLng());
  const close = v => { map.remove(); box.remove(); done(v); };
  box.querySelector('#mapno').onclick = () => close(area);
  box.querySelector('#mapok').onclick = () => {
    if (!circle) return toast('اول روی نقشه یک نقطه بزنید');
    const c = circle.getLatLng();
    close([+c.lat.toFixed(5), +c.lng.toFixed(5), +rad.value]);
  };
}

/** Results as dots (positions are approximate: Divar blurs most map points by ~500 m). */
async function showResultsMap(el, items, onPick) {
  try { await loadLeaflet(); } catch (e) { el.innerHTML = '<div class="empty">نقشه بارگذاری نشد</div>'; return; }
  const pts = items.filter(i => i.lat && i.lng);
  if (!pts.length) { el.innerHTML = '<div class="empty">هیچ‌کدام از این آگهی‌ها نقطه‌ی نقشه ندارند</div>'; return; }
  const map = baseMap(el, [pts[0].lat, pts[0].lng], 13);
  const group = L.featureGroup().addTo(map);
  for (const i of pts) {
    L.circleMarker([i.lat, i.lng], { radius: 8, color: '#fff', weight: 2, fillColor: i.status === 'مشاور' ? '#e5534b' : '#2481cc', fillOpacity: 0.9 })
      .bindPopup(`<b>${esc(i.title)}</b><br>${priceLine(i)}<br><a href="#" data-t="${esc(i.token)}">دیدن آگهی ↗</a>`)
      .on('popupopen', ev => { const a = ev.popup.getElement().querySelector('a'); if (a) a.onclick = e => { e.preventDefault(); onPick(i); }; })
      .addTo(group);
  }
  if (pts.length > 1) map.fitBounds(group.getBounds().pad(0.2));
  return map;
}

const areaLabel = a => a ? `🗺 محدوده‌ی نقشه (${meters(a[2])})` : '';
