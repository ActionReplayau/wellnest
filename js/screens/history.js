// History: one person's symptoms, sleep, medicines and weight over time
import { route, frame } from '../app.js';
import { esc, icon, avatar, on, today, addDays, fmtDay, avg, hoursText, loadingHtml, round1, sevClass, daysBetween } from '../util.js';
import { state, member, subject, rows, dueTimes, isAdultPrivate } from '../store.js';
import { lineChart, barChart } from '../charts.js';
import { stepRows, stepChart, goalOf, fmtSteps } from '../steps.js';

let range = 14;
let personId = null;

export async function loadRange(pid, from, to) {
  const [symptoms, checks, sleep, meds, doses, weights, period, endo, pressure, steps] = await Promise.all([
    rows('symptoms', (q) => q.eq('member_id', pid).lte('started_on', to).or(`ended_on.is.null,ended_on.gte.${from}`).order('started_on')),
    rows('symptom_checks', (q) => q.eq('member_id', pid).gte('day', from).lte('day', to).order('day')),
    rows('sleep_logs', (q) => q.eq('member_id', pid).gte('night_of', from).lte('night_of', to).order('night_of')),
    rows('medications', (q) => q.eq('member_id', pid).order('created_at')),
    rows('medication_doses', (q) => q.eq('member_id', pid).gte('day', from).lte('day', to)),
    rows('weight_logs', (q) => q.eq('member_id', pid).gte('day', from).lte('day', to).order('day')),
    rows('period_days', (q) => q.eq('member_id', pid).gte('day', from).lte('day', to).order('day')),
    rows('endo_logs', (q) => q.eq('member_id', pid).gte('day', from).lte('day', to).order('day')),
    rows('eye_pressure', (q) => q.eq('member_id', pid).lte('measured_on', to).order('measured_on')),
    member(pid)?.steps_on ? stepRows(pid, from, to) : [],
  ]);
  return { symptoms, checks, sleep, meds, doses, weights, period, endo, pressure, steps };
}

export const dayList = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

export function symptomStatus(sym, checks, to) {
  const list = checks.filter((c) => c.symptom_id === sym.id);
  if (sym.ended_on && sym.ended_on <= to) return ['Gone', 'gone'];
  if (list.length < 2) return ['New', 'same'];
  const a = list[list.length - 2].severity, b = list[list.length - 1].severity;
  if (list[list.length - 1].trend === 'worse' || b > a) return ['Getting worse', 'worse'];
  if (list[list.length - 1].trend === 'better' || b < a) return ['Easing', 'better'];
  return ['Steady', 'same'];
}

route('history', async (el, _a, alive) => {
  const p = member(personId) || subject();
  personId = p.id;
  const to = today(), from = addDays(to, -(range - 1));
  const head = `<div class="on-hero"><div class="h1">History</div>
    <div class="logfor">${state.members.map((m) => `<button data-act="person" data-id="${m.id}" aria-label="${esc(m.display_name)}">${avatar(m, 40, m.id === p.id ? 'sel' : '')}</button>`).join('')}</div>
    <div class="row between mt8"><div class="h2">${esc(p.display_name)}</div></div></div>
    <div class="seg mt16">${[[14, '2 weeks'], [30, 'Month'], [90, '3 months']].map(([n, l]) => `<button data-act="range" data-n="${n}" class="${range === n ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  el.innerHTML = frame({ heroH: 250, tabs: 'history', body: head + loadingHtml });
  const handlers = {
    person: (b) => { personId = b.dataset.id; redo(); },
    range: (b) => { range = +b.dataset.n; redo(); },
  };
  const d = await loadRange(p.id, from, to);
  if (!alive()) return;
  const days = dayList(from, to);
  const parts = [];

  // symptoms
  const syms = d.symptoms;
  if (syms.length) {
    parts.push('<div class="section-label">Symptoms</div>');
    for (const s of syms) {
      const [word, cls] = symptomStatus(s, d.checks, to);
      const vals = new Map(d.checks.filter((c) => c.symptom_id === s.id && c.severity != null).map((c) => [c.day, c.severity]));
      const latest = [...vals.values()].pop();
      parts.push(`<div class="card"><div class="row between"><div><div class="h2">${esc(s.name)}</div>
        <div class="muted small">${esc(s.body_area || '')}${s.body_area ? ' · ' : ''}Started ${fmtDay(s.started_on)}${s.ended_on ? ` · gone ${fmtDay(s.ended_on)}` : ''}</div></div>
        <span class="stat ${cls}">${esc(word)}</span></div>
        ${lineChart(days, vals, { max: 10, ticks: 2 })}
        ${latest != null ? `<div class="muted small">Latest <span class="sev ${sevClass(latest)}">${latest}/10</span></div>` : ''}</div>`);
    }
  }

  // sleep
  if (d.sleep.length) {
    const vals = new Map(d.sleep.map((x) => [x.night_of, +x.hours]));
    const q = d.sleep.filter((x) => x.quality).map((x) => x.quality);
    const sleepDays = range > 14 ? days : days.slice(-7);
    parts.push(`<div class="section-label">Sleep</div><div class="card"><div class="row between"><div class="h2">Sleep</div>
      <span class="muted small" style="font-weight:700">Average ${hoursText(avg([...vals.values()]))}</span></div>
      ${barChart(sleepDays, vals, { goal: 8 })}
      ${q.length ? `<div class="muted small">Sleep quality ${round1(avg(q))}/5 on average · ${q.filter((x) => x <= 2).length} poor night${q.filter((x) => x <= 2).length === 1 ? '' : 's'}</div>` : ''}</div>`);
  }

  // medicines
  const meds = d.meds.filter((m) => m.schedule !== 'as_needed' && (m.active || d.doses.some((x) => x.medication_id === m.id)));
  const prn = d.meds.filter((m) => m.schedule === 'as_needed');
  if (meds.length || prn.some((m) => d.doses.some((x) => x.medication_id === m.id))) {
    const week = days.slice(-7);
    let due = 0, taken = 0;
    const rowsHtml = meds.map((m) => `<div class="nm">${esc(m.name)}</div>${week.map((day) => {
      const times = dueTimes({ ...m, active: true }, day);
      if (!times.length) return '<i class="d" style="opacity:.25;background:var(--track)"></i>';
      const got = times.filter((tm) => d.doses.some((x) => x.medication_id === m.id && x.day === day && x.scheduled_time === tm)).length;
      due += times.length; taken += got;
      return `<i class="d ${got === times.length ? 'y' : 'n'}" title="${got}/${times.length}"></i>`;
    }).join('')}`).join('');
    const prnHtml = prn.map((m) => { const n = d.doses.filter((x) => x.medication_id === m.id).length; return n ? `<div class="muted small mt8">${esc(m.name)}: used ${n} time${n > 1 ? 's' : ''} (when needed)</div>` : ''; }).join('');
    parts.push(`<div class="section-label">Medications</div><div class="card"><div class="row between"><div class="h2">This week</div>
      ${due ? `<span class="muted small" style="font-weight:700">${Math.round((taken / due) * 100)}% taken</span>` : ''}</div>
      ${meds.length ? `<div class="medgrid"><div></div>${week.map((x) => `<div class="hd">${esc(new Date(x + 'T12:00').toLocaleDateString('en-AU', { weekday: 'narrow' }))}</div>`).join('')}${rowsHtml}</div>` : ''}${prnHtml}</div>`);
  }

  // weight
  if (d.weights.length) {
    const vals = new Map(d.weights.map((w) => [w.day, +w.kg]));
    const v = [...vals.values()];
    parts.push(`<div class="section-label">Weight</div><div class="card"><div class="row between"><div class="h2">Weight</div>
      <span class="muted small" style="font-weight:700">${v[v.length - 1]} kg</span></div>
      ${lineChart(days, vals, { min: Math.floor(Math.min(...v) - 2), max: Math.ceil(Math.max(...v) + 2), unit: '' })}</div>`);
  }

  // steps
  if (d.steps.length) {
    const goal = goalOf(p);
    const hit = d.steps.filter((x) => x.steps >= goal).length;
    const av = Math.round(avg(d.steps.map((x) => x.steps)));
    parts.push(`<div class="section-label">Steps</div><div class="card"><div class="row between"><div class="h2">Steps</div>
      <span class="muted small" style="font-weight:700">Average ${fmtSteps(av)} a day</span></div>
      ${stepChart(days, d.steps, goal)}
      <div class="muted small mt8" style="font-weight:700">Goal of ${fmtSteps(goal)} reached on ${hit} of ${d.steps.length} day${d.steps.length === 1 ? '' : 's'}</div></div>`);
  }

  // period
  if (d.period.some((x) => x.flow && x.flow !== 'none')) {
    const n = d.period.filter((x) => ['light', 'medium', 'heavy'].includes(x.flow)).length;
    parts.push(`<div class="section-label">Period</div><a class="card" href="#/${p.id === state.me.id ? 'period' : 'history'}" style="display:block"><div class="h2">Period</div>
      <div class="muted small mt4">${n} day${n === 1 ? '' : 's'} of bleeding in this time</div></a>`);
  }

  // endo
  if (d.endo.length) {
    const vals = new Map(d.endo.filter((x) => x.pelvic_pain != null).map((x) => [x.day, x.pelvic_pain]));
    parts.push(`<div class="section-label">Endo</div><div class="card"><div class="h2">Pelvic pain</div>${lineChart(days, vals, { max: 10, ticks: 2 })}</div>`);
  }

  if (!parts.length) {
    parts.push(`<div class="card mt16 empty">${p.id !== state.me.id && isAdultPrivate(p)
      ? `${icon('lock')}<br>${esc(p.display_name)} is 16 or over, so you'll only see what they choose to share.`
      : 'Nothing logged in this time yet.'}</div>`);
  }

  el.innerHTML = frame({ heroH: 250, tabs: 'history', body: head + parts.join('') });
  on(el, handlers);
});

const redo = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
