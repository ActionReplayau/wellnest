// Steps tracker: shared bits used by Today, History, the report and the Apple Watch link
import { icon, sheet, toast, today, addDays } from './util.js';
import { rows, upsert, updateMember, shareDefault } from './store.js';
import { barChart } from './charts.js';

export const GOALS = [5000, 6000, 8000, 10000, 12000];
export const fmtSteps = (n) => (n == null ? '–' : Math.round(n).toLocaleString('en-AU'));
export const goalOf = (m) => m?.step_goal || 8000;

// Steps for one person between two days. Returns [] rather than failing, so the
// rest of a screen still works if the steps table isn't there yet.
export async function stepRows(memberId, from, to) {
  try { return await rows('step_logs', (q) => q.eq('member_id', memberId).gte('day', from).lte('day', to).order('day')); } catch { return []; }
}

// Pull a step count out of whatever text the iPhone Shortcut sends, e.g. "8,432", "8432 steps", "8432.0"
export function parseSteps(text) {
  const m = String(text ?? '').replace(/\s/g, '').match(/\d[\d,]*(\.\d+)?/);
  if (!m) return null;
  const n = Math.round(parseFloat(m[0].replace(/,/g, '')));
  return n >= 0 && n <= 200000 ? n : null;
}

// Save one day's steps (replaces whatever was there for that day)
export function saveSteps(m, day, steps, source = 'app', existing = null) {
  return upsert('step_logs', {
    member_id: m.id, day, steps, source, shared: existing?.shared ?? shareDefault(m, 'steps'),
  }, 'member_id,day');
}

// A ring that fills towards the goal
export function stepRing(steps, goal, size = 112) {
  const r = size / 2 - 9, c = 2 * Math.PI * r, f = Math.min((steps || 0) / goal, 1);
  return `<div class="ring" style="width:${size}px;height:${size}px;flex:none"><svg width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="11"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#gStep)" stroke-width="11" stroke-linecap="round" stroke-dasharray="${c * f} ${c}"/></svg>
    <div class="lbl"><b style="font-size:21px;line-height:1">${fmtSteps(steps || 0)}</b><small>of ${fmtSteps(goal)}</small></div></div>`;
}

// Bar chart of daily steps with the goal line; bars turn green on goal days
export function stepChart(days, list, goal, opts = {}) {
  const vals = new Map(list.map((x) => [x.day, x.steps]));
  const top = Math.max(goal * 1.25, ...list.map((x) => x.steps)) || goal;
  return barChart(days, vals, { max: top, goal, goalText: `${fmtSteps(goal)}`, hit: (v) => v >= goal, ...opts });
}

export function streakText(list, goal, days) {
  const hit = days.filter((d) => list.some((x) => x.day === d && x.steps >= goal)).length;
  return `Goal reached ${hit} of the last ${days.length} days`;
}

// Change someone's daily goal
export function goalSheet(m, done) {
  const cur = goalOf(m);
  const sh = sheet(`<div class="sheet-head"><div class="h2">Daily step goal</div><button class="xbtn" data-close>${icon('x')}</button></div>
    <p class="lead mt4">Pick one, or type your own.</p>
    <div class="chips mt12">${GOALS.map((g) => `<button class="chip ${g === cur ? 'sel' : ''}" data-g="${g}">${fmtSteps(g)}</button>`).join('')}</div>
    <div class="inline-input mt16"><input class="input" id="goal" type="number" inputmode="numeric" min="500" max="100000" step="500" value="${cur}" style="max-width:160px"><span class="unit">steps a day</span></div>
    <p class="muted small mt8">Around 7,000 to 10,000 a day is a good everyday goal for most adults. Kids often do more.</p>
    <button class="btn mt16" id="saveGoal">Save goal</button>`);
  const inp = sh.el.querySelector('#goal');
  sh.el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
    inp.value = b.dataset.g; sh.el.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('sel', x === b));
  }));
  sh.el.querySelector('#saveGoal').addEventListener('click', async () => {
    const g = Math.round(+inp.value);
    if (!(g >= 500 && g <= 100000)) return toast('Pick a goal between 500 and 100,000');
    try { await updateMember(m.id, { step_goal: g }); sh.close(); toast('Goal saved'); done && done(); } catch (e) { toast(e.message); }
  });
}

export const lastDays = (n, to = today()) => Array.from({ length: n }, (_, i) => addDays(to, i - n + 1));
