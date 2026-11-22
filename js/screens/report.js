// Doctor report: a tidy summary for one person and a date range
import { route, frame } from '../app.js';
import { esc, icon, avatar, on, toast, today, addDays, fmtDay, daysBetween, avg, hoursText, round1, avgClock, fmtClock, loadingHtml, ageOn } from '../util.js';
import { state, member, subject, dueTimes, isAdultPrivate } from '../store.js';
import { loadRange, dayList } from './history.js';
import { cycleStats } from '../cycle.js';

let personId = null;
let preset = 21;
let custom = null;

const SEV_WORD = (n) => (n <= 3 ? 'mild' : n <= 6 ? 'moderate' : 'severe');
const range2 = (a, b) => (a === b ? fmtDay(a) : `${fmtDay(a)} to ${fmtDay(b)}`);

export function buildReport(p, from, to, d) {
  const days = dayList(from, to);
  const out = [];
  const age = ageOn(p.birthday, to);

  // symptoms
  const syms = d.symptoms.map((s) => {
    const cs = d.checks.filter((c) => c.symptom_id === s.id && c.severity != null);
    const worst = cs.length ? Math.max(...cs.map((c) => c.severity)) : null;
    const first = s.started_on < from ? `ongoing since ${fmtDay(s.started_on)}` : `started ${fmtDay(s.started_on)}`;
    let trend = '';
    if (s.ended_on && s.ended_on <= to) trend = `Gone ${fmtDay(s.ended_on)}.`;
    else if (cs.length >= 2) {
      const recent = cs.slice(-3);
      const a = recent[0].severity, b = recent[recent.length - 1].severity;
      trend = b > a ? `Getting worse in the last ${daysBetween(recent[0].day, recent[recent.length - 1].day) || 1} days.` : b < a ? 'Easing lately.' : 'Steady lately.';
    }
    const length = daysBetween(s.started_on, s.ended_on && s.ended_on <= to ? s.ended_on : to) + 1;
    const where = s.body_area ? ` (${esc(s.body_area.toLowerCase())})` : '';
    return `<li><b>${esc(s.name)}</b>${where}, ${first}${length > 1 ? `, ${length} days` : ''}.${worst != null ? ` Worst ${worst}/10 (${SEV_WORD(worst)}).` : ''} ${trend}${s.note ? ` Note: “${esc(s.note)}”.` : ''}</li>`;
  });
  out.push(`<h4>Symptoms</h4>${syms.length ? `<ul>${syms.join('')}</ul>` : '<p>No symptoms logged.</p>'}`);

  // medicines
  const medLines = [];
  for (const m of d.meds) {
    const doses = d.doses.filter((x) => x.medication_id === m.id);
    if (m.schedule === 'as_needed') {
      if (!doses.length) continue;
      const night = doses.filter((x) => { const h = new Date(x.taken_at).getHours(); return h >= 19 || h < 6; }).length;
      medLines.push(`<li><b>${esc(m.name)}</b>${m.dose ? ` ${esc(m.dose)}` : ''}, as needed: used ${doses.length} time${doses.length > 1 ? 's' : ''}${night > doses.length / 2 ? ' (mostly at night)' : ''}.</li>`);
      continue;
    }
    let due = 0;
    for (const day of days) if (day >= m.created_at.slice(0, 10)) due += dueTimes({ ...m, active: true }, day).length;
    if (!due && !doses.length) continue;
    const eye = m.form === 'eye_drop' && m.eye ? ` (${m.eye === 'both' ? 'both eyes' : `${m.eye} eye`})` : '';
    medLines.push(`<li><b>${esc(m.name)}</b>${m.dose ? ` ${esc(m.dose)}` : ''}${eye}: ${doses.length} of ${due} doses ticked as taken${due ? ` (${Math.round((Math.min(doses.length, due) / due) * 100)}%)` : ''}.${m.active ? '' : ' Stopped.'}</li>`);
  }
  if (medLines.length) out.push(`<h4>Medications</h4><ul>${medLines.join('')}</ul>`);

  // sleep
  if (d.sleep.length) {
    const hrs = d.sleep.map((x) => +x.hours);
    const poor = d.sleep.filter((x) => x.quality && x.quality <= 2).length;
    out.push(`<h4>Sleep</h4><p>Average ${hoursText(avg(hrs))} a night over ${d.sleep.length} night${d.sleep.length > 1 ? 's' : ''} logged (shortest ${hoursText(Math.min(...hrs))}).${(() => { const b = avgClock(d.sleep.map((x) => x.bed_time)), w = avgClock(d.sleep.map((x) => x.wake_time), 0); return b && w ? ` Usually asleep by ${fmtClock(b)} and up at ${fmtClock(w)}.` : ''; })()}${poor ? ` ${poor} poor night${poor > 1 ? 's' : ''}.` : ''}</p>`);
  }

  // weight
  if (d.weights.length) {
    const a = d.weights[0], b = d.weights[d.weights.length - 1];
    const ch = round1(b.kg - a.kg);
    out.push(`<h4>Weight</h4><p>${b.kg} kg on ${fmtDay(b.day)}${d.weights.length > 1 ? ` (${ch > 0 ? '+' : ''}${ch} kg since ${fmtDay(a.day)})` : ''}.${p.height_cm ? ` Height ${p.height_cm} cm, BMI ${round1(b.kg / (p.height_cm / 100) ** 2)}.` : ''}</p>`);
  }

  // period
  if (d.period.length) {
    const st = cycleStats(d.periodAll || d.period, to);
    const inRange = st.periods.filter((x) => x.end >= from && x.start <= to);
    if (inRange.length) {
      out.push(`<h4>Periods</h4><p>${inRange.map((x) => `${range2(x.start, x.end)} (${x.days} day${x.days > 1 ? 's' : ''})`).join('; ')}.${st.enough ? ` Usual cycle about ${st.cycleLen} days (±${st.spread}), period about ${st.periodLen} days.` : ''}</p>`);
    }
  }

  // endo
  if (d.endo.length) {
    const pain = d.endo.filter((x) => x.pelvic_pain != null).map((x) => x.pelvic_pain);
    const counts = {};
    d.endo.forEach((x) => (x.noticed || []).forEach((n) => { counts[n] = (counts[n] || 0) + 1; }));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k.toLowerCase()} (${v} days)`);
    const stopped = d.endo.filter((x) => x.impact === 'had_to_stop').length;
    out.push(`<h4>Endometriosis symptoms</h4><p>Logged on ${d.endo.length} days. Average pelvic pain ${round1(avg(pain))}/10, worst ${pain.length ? Math.max(...pain) : '–'}/10.${top.length ? ` Most common: ${top.join(', ')}.` : ''}${stopped ? ` Had to stop what they were doing on ${stopped} day${stopped > 1 ? 's' : ''}.` : ''}</p>`);
  }

  // eye pressure
  const ep = d.pressure.filter((x) => x.measured_on >= addDays(from, -366));
  if (ep.length) {
    out.push(`<h4>Eye pressure</h4><ul>${ep.slice(-4).map((x) => `<li>${fmtDay(x.measured_on, { day: 'numeric', month: 'short', year: 'numeric' })}: left ${x.left_mmhg ?? '–'}, right ${x.right_mmhg ?? '–'} mmHg${x.target_mmhg ? ` (target ${x.target_mmhg})` : ''}</li>`).join('')}</ul>`);
  }

  const byOther = [...d.checks, ...d.sleep, ...d.doses].filter((x) => x.logged_by && x.logged_by !== p.id).length;
  return `<div class="paper" id="paper">
    <div class="row between"><div><div class="pname">Health summary · ${esc(p.display_name)}${age != null ? `, ${age}` : ''}</div>
      <div class="pdate">${fmtDay(from, { day: 'numeric', month: 'long' })} to ${fmtDay(to, { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
      <img src="img/icon-192.png" alt="" width="40" height="40" style="border-radius:11px"></div>
    ${out.join('')}
    <p style="margin-top:14px;font-size:11px;color:#8a86a6">Made with Wellnest on ${fmtDay(today(), { day: 'numeric', month: 'long', year: 'numeric' })}.${byOther ? ` ${byOther} entr${byOther > 1 ? 'ies were' : 'y was'} noted by a parent.` : ''} Severity is self-rated from 1 (barely there) to 10 (worst ever).</p>
  </div>`;
}

route('report', async (el, _a, alive) => {
  const p = member(personId) || subject();
  personId = p.id;
  const to = custom?.to || today();
  const from = custom?.from || addDays(to, -(preset - 1));
  const head = `<div class="on-hero"><div class="h1">Doctor report</div><p class="lead mt4">A tidy summary to show the GP</p>
    <div class="logfor">${state.members.map((m) => `<button data-act="person" data-id="${m.id}" aria-label="${esc(m.display_name)}">${avatar(m, 40, m.id === p.id ? 'sel' : '')}</button>`).join('')}</div></div>
    <div class="seg mt16">${[[14, '2 weeks'], [21, '3 weeks'], [30, 'Month'], [90, '3 months']].map(([n, l]) => `<button data-act="preset" data-n="${n}" class="${!custom && preset === n ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="row mt12 gap8"><input class="input" type="date" id="from" value="${from}" max="${today()}"><span class="unit">to</span><input class="input" type="date" id="to" value="${to}" max="${today()}"></div>`;
  el.innerHTML = frame({ heroH: 260, tabs: 'report', body: head + loadingHtml });
  const d = await loadRange(p.id, from, to);
  const { rows } = await import('../store.js');
  d.periodAll = await rows('period_days', (q) => q.eq('member_id', p.id).lte('day', to).gte('day', addDays(to, -400)));
  if (!alive()) return;
  const nothing = !d.symptoms.length && !d.sleep.length && !d.doses.length && !d.weights.length && !d.period.length && !d.endo.length;
  el.innerHTML = frame({ heroH: 260, tabs: 'report', body: `${head}
    ${nothing && p.id !== state.me.id && isAdultPrivate(p) ? `<div class="card mt16 empty">${icon('lock')}<br>${esc(p.display_name)} is 16 or over. The report only includes what they've shared. They can make a full report on their own login.</div>` : ''}
    ${buildReport(p, from, to, d)}
    <div class="row gap8 mt16"><button class="btn" data-act="print">${icon('printer')} Print or save PDF</button>
    <button class="btn ghost" data-act="share" style="width:auto;padding:0 18px">${icon('share')}</button></div>` });
  const redo = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  el.querySelector('#from').addEventListener('change', (e) => { custom = { from: e.target.value, to: el.querySelector('#to').value }; redo(); });
  el.querySelector('#to').addEventListener('change', (e) => { custom = { from: el.querySelector('#from').value, to: e.target.value }; redo(); });
  on(el, {
    person: (b) => { personId = b.dataset.id; redo(); },
    preset: (b) => { preset = +b.dataset.n; custom = null; redo(); },
    print: () => window.print(),
    share: async () => {
      const text = el.querySelector('#paper').innerText;
      try {
        if (navigator.share) await navigator.share({ title: `Health summary · ${p.display_name}`, text });
        else { await navigator.clipboard.writeText(text); toast('Copied. Paste it into an email or message.'); }
      } catch { /* cancelled */ }
    },
  });
});
