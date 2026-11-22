// Small helpers shared by every screen

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icon = (name, cls = 'i') => `<svg class="${cls}"><use href="#i-${name}"/></svg>`;

// ---------- dates (always the phone's local date) ----------
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export const dayName = (s) => parseDay(s).toLocaleDateString('en-AU', { weekday: 'short' });
export const fmtDay = (s, opts = { day: 'numeric', month: 'short' }) => parseDay(s).toLocaleDateString('en-AU', opts);
export const fmtLong = (s) => parseDay(s).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
export const fmtClock = (t) => { // "20:00:00" -> "8:00pm"
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${pad(m)}${ap}`;
};
export const ageOn = (birthday, on = today()) => {
  if (!birthday) return null;
  const b = parseDay(birthday), d = parseDay(on);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
};
export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? ['Morning', '☀️'] : h < 17 ? ['Afternoon', '🌤️'] : ['Evening', '🌙'];
};

// ---------- people ----------
export const COLOURS = ['violet', 'pink', 'amber', 'teal', 'green', 'indigo', 'rose', 'sky'];
export const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();
export const avatar = (m, size = 44, extra = '') =>
  `<div class="av c-${esc(m?.colour || 'violet')} ${extra}" style="--s:${size}px">${esc(initial(m?.display_name))}</div>`;
export const slug = (name) => (name || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '') || 'person';

// ---------- severity ----------
export const sevClass = (n) => (n >= 7 ? 'hi' : n >= 4 ? 'mid' : 'lo');
export const SEV_WORDS = ['', 'Barely there', 'Mild', 'Mild', 'Annoying', 'Annoying', 'Hard to ignore', 'Bad', 'Very bad', 'Awful', 'Worst ever'];
export const sevColour = (n) => {
  const stops = ['#22C55E', '#22C55E', '#4ADE80', '#A3E635', '#FACC15', '#F59E0B', '#F97316', '#FB7185', '#F43F5E', '#E11D48', '#BE123C'];
  return stops[n] || '#A855F7';
};

// ---------- feedback ----------
let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// A slide-up panel. Returns {el, close}. onClose runs when dismissed.
export function sheet(html, { onClose } = {}) {
  const layer = document.getElementById('layer');
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="dim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  layer.appendChild(wrap);
  const close = () => { wrap.remove(); onClose && onClose(); };
  wrap.querySelector('.dim').addEventListener('click', close);
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { el: wrap.querySelector('.sheet'), close };
}

export function confirmBox(title, body, yes = 'Yes', danger = false) {
  return new Promise((resolve) => {
    let answered = false;
    const s = sheet(`<div class="h2">${esc(title)}</div><p class="lead mt8">${esc(body)}</p>
      <button class="btn ${danger ? 'danger' : ''} mt20" data-yes>${esc(yes)}</button>
      <button class="btn ghost mt12" data-close>Cancel</button>`, { onClose: () => { if (!answered) resolve(false); } });
    s.el.querySelector('[data-yes]').addEventListener('click', () => { answered = true; s.close(); resolve(true); });
  });
}

// Wire up clicks on [data-act="name"] inside root to handlers[name](el, event).
// Each root keeps one listener; calling on() again replaces the handlers.
export function on(root, handlers) {
  root._acts = handlers;
  if (root._actsWired) return;
  root._actsWired = true;
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = root._acts && root._acts[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
}

export const loadingHtml = '<div class="loading"><span class="spinner"></span></div>';

// Ring progress SVG
export function ring(done, total, size = 84, label = '') {
  const r = size / 2 - 8, c = 2 * Math.PI * r, f = total ? Math.min(done / total, 1) : 0;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="9"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#gRing)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * f} ${c}"/></svg>
    <div class="lbl">${label || `${done}/${total}`}<small>done</small></div></div>`;
}

export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const avg = (a) => (a.length ? sum(a) / a.length : 0);
export const round1 = (n) => Math.round(n * 10) / 10;
// Hours between going to sleep and waking, e.g. "22:30" -> "06:45" = 8.25 (crosses midnight)
export const sleepHours = (bed, wake) => {
  if (!bed || !wake) return null;
  const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let d = mins(wake) - mins(bed);
  if (d <= 0) d += 1440;
  return Math.round((d / 60) * 100) / 100;
};
// Average clock time, treating evening + early morning as one night (so 11pm and 1am average to midnight)
export const avgClock = (times, eveningStart = 12) => {
  const list = times.filter(Boolean).map((t) => { const [h, m] = t.split(':').map(Number); let x = h * 60 + m; if (h < eveningStart && eveningStart !== 0) x += 1440; return x; });
  if (!list.length) return null;
  const a = Math.round(list.reduce((x, y) => x + y, 0) / list.length) % 1440;
  return `${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
};
export const hoursText = (h) => { if (h == null) return '–'; const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${hh}h ${pad(mm)}m`; };
