// "Your hormones this phase": a graph of how hormones TYPICALLY rise and fall
// through a cycle of this person's length, plus food ideas for the phase they're in.
// These are general patterns from textbooks, not anyone's measured levels.
import { esc, icon } from './util.js';
import { phases, phaseOn } from './cycle.js';

// A bell-shaped bump. Different widths on each side so curves can rise slowly and fall fast.
const bump = (d, at, left, right = left) => Math.exp(-(((d - at) / (d < at ? left : right)) ** 2) / 2);

export const HORMONES = [
  { key: 'oe', name: 'Oestrogen', colour: '#EC4899', what: 'Builds the womb lining. Often linked with more energy and a brighter mood.',
    level: (d, ov) => 0.12 + 0.88 * bump(d, ov - 1, 3.6, 1.6) + 0.42 * bump(d, ov + 7, 3.2) },
  { key: 'pr', name: 'Progesterone', colour: '#A78BFA', what: 'Rises after ovulation to keep the lining ready. Can feel calming, or a bit tired and bloated.',
    level: (d, ov) => 0.04 + 0.96 * bump(d, ov + 7, 3.4, 3.0) },
  { key: 'lh', name: 'LH', colour: '#F59E0B', what: 'Luteinising hormone. A short, sharp surge is what triggers ovulation.',
    level: (d, ov) => 0.07 + 0.93 * bump(d, ov - 1, 1.0, 0.8) },
  { key: 'fsh', name: 'FSH', colour: '#38BDF8', what: 'Follicle stimulating hormone. Helps an egg grow early in the cycle, with a small rise at ovulation.',
    level: (d, ov) => 0.16 + 0.3 * bump(d, 2, 3.2) + 0.42 * bump(d, ov - 1, 1.1) },
  { key: 'te', name: 'Testosterone', colour: '#2DD4BF', what: 'Present in small amounts. A little bump near ovulation, often with more drive and confidence.',
    level: (d, ov) => 0.26 + 0.24 * bump(d, ov - 1, 2.6) },
];

const PHASE_TEXT = {
  menstrual: 'Oestrogen and progesterone are both at their lowest, which is what starts your period. FSH is starting to rise to get the next cycle going.',
  follicular: 'Oestrogen is climbing steadily as an egg gets ready. Many people feel their energy and mood lift.',
  ovulation: 'Oestrogen peaks, then LH surges to release an egg. Testosterone gets a small boost too.',
  luteal: 'Progesterone takes the lead, with a second smaller rise in oestrogen. Both drop near the end, which can bring PMS.',
};

export const FOODS = {
  menstrual: { why: 'Replace iron you lose and keep warm and comfortable.', items: [
    ['🥩', 'Red meat or lentils', 'iron'], ['🥬', 'Spinach and leafy greens', 'iron'], ['🍊', 'Oranges and capsicum', 'help iron soak in'],
    ['🍲', 'Warm soups and stews', 'comfort'], ['🍫', 'Dark chocolate', 'magnesium for cramps'], ['🫚', 'Ginger tea', 'may ease cramps'] ] },
  follicular: { why: 'Fresh, lighter foods to match rising energy.', items: [
    ['🥚', 'Eggs', 'protein'], ['🥣', 'Oats', 'steady energy'], ['🫐', 'Berries', 'antioxidants'],
    ['🥗', 'Big fresh salads', 'fibre'], ['🥛', 'Yoghurt or kefir', 'gut friendly'], ['🍗', 'Chicken or tofu', 'protein'] ] },
  ovulation: { why: 'Fibre and colour help your body clear the oestrogen peak.', items: [
    ['🥦', 'Broccoli and cauliflower', 'fibre'], ['🐟', 'Salmon or sardines', 'omega-3'], ['🍓', 'Strawberries', 'vitamin C'],
    ['🌾', 'Quinoa', 'protein and fibre'], ['🥜', 'Almonds', 'vitamin E'], ['💧', 'Plenty of water', 'energy'] ] },
  luteal: { why: 'Slow carbs and magnesium for steadier moods and cravings.', items: [
    ['🍠', 'Sweet potato', 'slow energy'], ['🍚', 'Brown rice', 'B vitamins'], ['🎃', 'Pumpkin seeds', 'magnesium'],
    ['🍌', 'Bananas', 'B6 and potassium'], ['🫘', 'Chickpeas', 'fibre'], ['🧂', 'Go easy on salt and coffee', 'less bloating'] ] },
};

export const MOVE = {
  menstrual: { energy: 2, word: 'Lower', why: 'Your body is working hard. Gentle movement can ease cramps, and rest days are fine.', items: [
    ['🚶', 'Easy walks'], ['🧘', 'Yoga or stretching'], ['🏊', 'Gentle swim'], ['🛋️', 'Rest if you need it'] ] },
  follicular: { energy: 4, word: 'Rising', why: 'Energy is building, so it\'s a good time to try something new or push a little harder.', items: [
    ['🏃', 'Jogging'], ['🚴', 'Bike riding'], ['💃', 'Dance class'], ['🏋️', 'Strength training'] ] },
  ovulation: { energy: 5, word: 'Highest', why: 'Often your strongest, most energetic days. Great for your hardest workouts.', items: [
    ['⚡', 'Fast, intense workouts'], ['🏐', 'Team sports'], ['🏋️', 'Heavier weights'], ['🤸', 'Group classes'] ] },
  luteal: { energy: 3, word: 'Steady, then lower', why: 'Keep it moderate early on, then ease off as your period gets closer.', items: [
    ['🧘‍♀️', 'Pilates'], ['🥾', 'Longer walks or hikes'], ['🏋️', 'Lighter weights'], ['🚲', 'Easy bike ride'] ] },
};

// Builds the graph as an SVG: phase bands behind, one line per hormone, and a marker for today.
function graph(cycleLen, periodLen, dayOf, show) {
  const W = 320, H = 150, top = 14, bottom = H - 22, ov = Math.max(periodLen + 4, cycleLen - 14);
  const x = (d) => ((d - 1) / (cycleLen - 1)) * W;
  const y = (v) => bottom - v * (bottom - top);
  const bands = phases(cycleLen, periodLen).map((p) =>
    `<rect x="${x(p.from - 0.5).toFixed(1)}" y="${top - 8}" width="${(x(p.to + 0.5) - x(p.from - 0.5)).toFixed(1)}" height="${bottom - top + 8}" fill="${p.colour}" opacity="${dayOf && phaseOn(dayOf, cycleLen, periodLen)?.key === p.key ? 0.16 : 0.06}"/>`).join('');
  const lines = HORMONES.filter((h) => show.has(h.key)).map((h) => {
    const pts = [];
    for (let d = 1; d <= cycleLen; d += 0.25) pts.push(`${x(d).toFixed(1)},${y(h.level(d, ov)).toFixed(1)}`);
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${h.colour}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  const ticks = [1, Math.round(cycleLen / 4), Math.round(cycleLen / 2), Math.round((3 * cycleLen) / 4), cycleLen]
    .map((d) => `<text x="${Math.min(W - 6, Math.max(6, x(d))).toFixed(1)}" y="${H - 4}" text-anchor="middle">${d}</text>`).join('');
  let marker = '';
  if (dayOf) {
    const d = ((dayOf - 1) % cycleLen) + 1, mx = x(d).toFixed(1);
    marker = `<line x1="${mx}" x2="${mx}" y1="${top - 8}" y2="${bottom}" stroke="var(--text)" stroke-width="2" stroke-dasharray="3 4" opacity=".7"/>
      ${HORMONES.filter((h) => show.has(h.key)).map((h) => `<circle cx="${mx}" cy="${y(h.level(d, ov)).toFixed(1)}" r="4.5" fill="${h.colour}" stroke="var(--sheet)" stroke-width="2"/>`).join('')}`;
  }
  return `<svg class="hgraph" viewBox="0 -2 ${W} ${H + 2}" preserveAspectRatio="none" role="img" aria-label="Typical hormone levels through a ${cycleLen}-day cycle">
    ${bands}${phases(cycleLen, periodLen).map((p) => `<rect x="${(x(p.from - 0.5) + 1).toFixed(1)}" y="${bottom + 1}" width="${Math.max(2, x(p.to + 0.5) - x(p.from - 0.5) - 2).toFixed(1)}" height="5" rx="2.5" fill="${p.colour}"/>`).join('')}${lines}${marker}<g class="ht">${ticks}</g></svg>`;
}

// The whole section. `pick` is the hormone that's been tapped (or null for all).
export function hormoneSection({ cycleLen, periodLen, dayOf }, pick = null) {
  const now = phaseOn(dayOf, cycleLen, periodLen);
  const show = new Set(pick ? [pick] : HORMONES.map((h) => h.key));
  const chosen = HORMONES.find((h) => h.key === pick);
  const d = dayOf ? ((dayOf - 1) % cycleLen) + 1 : null;
  const todayPct = d ? ((d - 1) / (cycleLen - 1)) * 100 : null;
  const food = now ? FOODS[now.key] : null, move = now ? MOVE[now.key] : null;
  return `<div class="section-label">Your hormones${now ? ' this phase' : ''}</div>
    <div class="card hcard">
      ${now ? `<div class="row between"><div><div class="muted small" style="font-weight:700">Day ${d} · typical pattern</div><div class="h2" style="color:${now.colour}">${now.name} phase</div></div>
        <span class="chip" style="background:color-mix(in srgb,${now.colour} 18%,transparent);color:${now.colour}">${icon2(now.key)}</span></div>` : '<div class="h2">How hormones move in a cycle</div>'}
      <div class="hwrap mt12">${todayPct != null ? `<span class="htoday" style="left:${todayPct.toFixed(1)}%">Today</span>` : ''}${graph(cycleLen, periodLen, dayOf, show)}</div>
      <div class="phasekey">${phases(cycleLen, periodLen).map((p) => `<span><i style="background:${p.colour}"></i>${p.name}</span>`).join('')}</div>
      <div class="hkeys mt12">${HORMONES.map((h) => `<button class="hkey ${pick === h.key ? 'on' : ''} ${pick && pick !== h.key ? 'dim' : ''}" data-act="hpick" data-h="${h.key}" style="--c:${h.colour}"><i></i>${h.name}</button>`).join('')}</div>
      <p class="lead mt12" style="font-size:13.5px">${esc(chosen ? chosen.what : now ? PHASE_TEXT[now.key] : 'Log a period and Wellnest will show where you are on this graph.')}</p>
      <p class="muted small mt8" style="line-height:1.45">${icon('spark')} A general pattern for a ${cycleLen}-day cycle, not your own measured levels. Everyone is a little different, and the pill or a hormonal IUD changes this pattern.</p>
    </div>
    ${food ? `<div class="section-label">Foods that may help now</div>
    <div class="card"><p class="lead" style="font-size:13.5px">${esc(food.why)}</p>
      <div class="foods mt12">${food.items.map(([e, n, w]) => `<div class="food"><span class="em">${e}</span><b>${esc(n)}</b><small>${esc(w)}</small></div>`).join('')}</div>
      <p class="muted small mt12">Ideas, not a diet plan. Eat what suits you.</p></div>` : ''}
    ${move ? `<div class="section-label">Energy and exercise</div>
    <div class="card"><div class="row between"><div><div class="muted small" style="font-weight:700">Typical energy now</div><div class="h2">${move.word}</div></div>
      <div class="energy" aria-label="Energy ${move.energy} out of 5">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= move.energy ? 'on' : ''}" style="height:${8 + n * 5}px"></i>`).join('')}</div></div>
      <p class="lead mt8" style="font-size:13.5px">${esc(move.why)}</p>
      <div class="moves mt12">${move.items.map(([e, n]) => `<div class="move"><span class="em">${e}</span><b>${esc(n)}</b></div>`).join('')}</div>
      <p class="muted small mt12">Go by how you actually feel. Some days won't match the pattern.</p></div>` : ''}`;
}

const icon2 = (k) => ({ menstrual: '🌙 Rest', follicular: '🌱 Build', ovulation: '☀️ Peak', luteal: '🍂 Wind down' }[k]);
