// Period maths: finding periods, cycle length, predictions and phases
import { addDays, daysBetween, avg, today } from './util.js';

const BLEED = new Set(['light', 'medium', 'heavy']);

// period_days rows (any order) -> [{start, end, days}]
export function findPeriods(rowsIn) {
  const days = rowsIn.filter((r) => BLEED.has(r.flow)).map((r) => r.day).sort();
  const periods = [];
  for (const d of days) {
    const last = periods[periods.length - 1];
    if (last && daysBetween(last.end, d) <= 2) { last.end = d; last.days++; } else periods.push({ start: d, end: d, days: 1 });
  }
  return periods;
}

const sd = (a) => { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) ** 2))); };

// Works out averages from the last 6 cycles
export function cycleStats(rowsIn, on = today()) {
  const periods = findPeriods(rowsIn);
  const cycles = [];
  for (let i = 1; i < periods.length; i++) {
    const len = daysBetween(periods[i - 1].start, periods[i].start);
    if (len >= 15 && len <= 60) cycles.push({ start: periods[i - 1].start, length: len, bleed: periods[i - 1].days });
  }
  const recent = cycles.slice(-6);
  const cycleLen = recent.length ? Math.round(avg(recent.map((c) => c.length))) : 28;
  const finished = periods.filter((p) => daysBetween(p.end, on) > 2);
  const periodLen = finished.length ? Math.max(2, Math.round(avg(finished.slice(-6).map((p) => p.days)))) : 5;
  const spread = recent.length >= 2 ? Math.max(1, Math.round(sd(recent.map((c) => c.length)))) : 3;
  const last = periods[periods.length - 1] || null;
  let next = null, dayOf = null;
  if (last) {
    next = addDays(last.start, cycleLen);
    while (next < on && daysBetween(last.start, on) < 120) next = addDays(next, cycleLen);
    dayOf = daysBetween(last.start, on) + 1;
    if (dayOf > cycleLen + 30) dayOf = null; // too long ago to guess
  }
  const regular = recent.length >= 3 ? (spread <= 4 ? 'Regular' : 'Varies a bit') : 'Still learning';
  return { periods, cycles, recent, cycleLen, periodLen, spread, last, next, dayOf, regular, learnedFrom: recent.length, enough: recent.length >= 2 };
}

// Phase boundaries for a cycle of a given length
export function phases(cycleLen, periodLen) {
  const ov = Math.max(periodLen + 4, cycleLen - 14);
  return [
    { key: 'menstrual', name: 'Menstrual', from: 1, to: periodLen, colour: '#EC4899', note: 'Energy is often lower. Rest and warmth can help.' },
    { key: 'follicular', name: 'Follicular', from: periodLen + 1, to: ov - 2, colour: '#A78BFA', note: 'Energy often builds through this part of the cycle.' },
    { key: 'ovulation', name: 'Ovulation', from: ov - 1, to: ov + 3, colour: '#F59E0B', note: 'Some people notice a twinge or more energy around now.' },
    { key: 'luteal', name: 'Luteal', from: ov + 4, to: cycleLen, colour: '#38BDF8', note: 'Bloating, tiredness or sore breasts are common later in this phase.' },
  ];
}
export function phaseOn(day, cycleLen, periodLen) {
  if (!day) return null;
  const d = ((day - 1) % cycleLen) + 1;
  return phases(cycleLen, periodLen).find((p) => d >= p.from && d <= p.to) || phases(cycleLen, periodLen)[3];
}

// Endo without periods: estimate a cycle from the daily pain pattern.
// Tries every length from 21 to 35 days and picks the one where pain lines up best.
export function estimateFromPain(endoRows, on = today()) {
  const map = new Map(endoRows.filter((r) => r.pelvic_pain != null).map((r) => [r.day, r.pelvic_pain]));
  if (map.size < 30) return null;
  const days = [...map.keys()].sort();
  const first = days[0], span = daysBetween(first, on) + 1;
  const series = Array.from({ length: span }, (_, i) => map.get(addDays(first, i)) ?? null);
  const mean = avg(series.filter((v) => v != null));
  let best = null;
  for (let L = 21; L <= 35; L++) {
    let num = 0, n = 0;
    for (let i = 0; i + L < series.length; i++) {
      const a = series[i], b = series[i + L];
      if (a == null || b == null) continue;
      num += (a - mean) * (b - mean); n++;
    }
    if (n < 10) continue;
    const score = num / n;
    if (!best || score > best.score) best = { L, score };
  }
  if (!best || best.score <= 0) return null;
  // find the flare "start": the offset with highest average pain over 3 days
  const L = best.L;
  let bestOff = 0, bestAvg = -1;
  for (let off = 0; off < L; off++) {
    const vals = [];
    for (let i = off; i < series.length; i += L) for (let k = 0; k < 3; k++) if (series[i + k] != null) vals.push(series[i + k]);
    const a = avg(vals);
    if (a > bestAvg) { bestAvg = a; bestOff = off; }
  }
  let flare = addDays(first, bestOff);
  while (addDays(flare, L) <= on) flare = addDays(flare, L);
  const nextFlare = addDays(flare, L);
  // treat the flare as the start of the menstrual-like part of the cycle
  const dayOf = daysBetween(flare, on) + 1;
  return { cycleLen: L, lastFlare: flare, nextFlare, dayOf, confidence: best.score };
}
