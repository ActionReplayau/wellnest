// Tiny SVG charts
import { fmtDay, dayName, esc } from './util.js';

const W = 320, H = 120, PAD = 22;

// days: array of 'YYYY-MM-DD'; values: Map day -> number
export function lineChart(days, values, { max = 10, min = 0, colour = 'url(#gLine)', area = true, ticks = 3, unit = '' } = {}) {
  const pts = days.map((d, i) => [i, values.get(d)]).filter(([, v]) => v != null);
  if (!pts.length) return '<div class="empty" style="padding:12px">Nothing logged in this time</div>';
  const x = (i) => PAD + (days.length === 1 ? (W - PAD * 2) / 2 : (i / (days.length - 1)) * (W - PAD * 2));
  const y = (v) => 8 + (1 - (v - min) / (max - min || 1)) * (H - 30);
  const line = pts.map(([i, v]) => `${x(i)},${y(v)}`).join(' ');
  const areaPath = `M${x(pts[0][0])},${H - 22} L${line.replace(/ /g, ' L')} L${x(pts[pts.length - 1][0])},${H - 22} Z`;
  const labels = [0, Math.floor((days.length - 1) / 2), days.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    .map((i) => `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(fmtDay(days[i]))}</text>`).join('');
  const grid = Array.from({ length: ticks }, (_, k) => {
    const v = min + ((max - min) * (k + 1)) / ticks;
    return `<line x1="${PAD}" x2="${W - PAD}" y1="${y(v)}" y2="${y(v)}" stroke="var(--track)" stroke-dasharray="3 4"/><text class="axis" x="${PAD - 4}" y="${y(v) + 3}" text-anchor="end">${Math.round(v * 10) / 10}${unit}</text>`;
  }).join('');
  return `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}">${grid}
    ${area && pts.length > 1 ? `<path d="${areaPath}" fill="url(#gArea)"/>` : ''}
    <polyline points="${line}" fill="none" stroke="${colour}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map(([i, v]) => `<circle cx="${x(i)}" cy="${y(v)}" r="${pts.length > 30 ? 1.8 : 3.2}" fill="#fff" stroke="#C026D3" stroke-width="2"/>`).join('')}
    ${labels}</svg></div>`;
}

export function barChart(days, values, { max = 12, goal = null, goalText = null, hit = null, label = (d) => dayName(d).charAt(0) } = {}) {
  const n = days.length, bw = (W - PAD * 2) / n;
  const y = (v) => 8 + (1 - v / max) * (H - 30);
  const bars = days.map((d, i) => {
    const v = values.get(d);
    if (v == null) return `<rect x="${PAD + i * bw + bw * 0.2}" y="${H - 26}" width="${bw * 0.6}" height="4" rx="2" fill="var(--track)"/>`;
    return `<rect x="${PAD + i * bw + bw * 0.18}" y="${y(v)}" width="${bw * 0.64}" height="${H - 22 - y(v)}" rx="${Math.min(6, bw * 0.3)}" fill="${hit && hit(v) ? 'url(#gHit)' : 'url(#gBar)'}"/>`;
  }).join('');
  const labs = n <= 14 ? days.map((d, i) => `<text class="axis" x="${PAD + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(label(d))}</text>`).join('')
    : [0, Math.floor(n / 2), n - 1].map((i) => `<text class="axis" x="${PAD + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(fmtDay(days[i]))}</text>`).join('');
  const g = goal ? `<line x1="${PAD}" x2="${W - PAD}" y1="${y(goal)}" y2="${y(goal)}" stroke="#A78BFA" stroke-dasharray="4 4"/><text class="axis" x="${W - PAD}" y="${y(goal) - 4}" text-anchor="end">${goalText ?? `${goal}h`}</text>` : '';
  return `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}">${g}${bars}${labs}</svg></div>`;
}
