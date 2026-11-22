// Today: the daily check-in
import { route, frame, go } from '../app.js';
import {
  esc, icon, avatar, toast, on, sheet, confirmBox, today, addDays, daysBetween, fmtLong, fmtDay, greeting, sevClass, SEV_WORDS, sevColour,
  ring, loadingHtml, fmtClock, hoursText, round1,
} from '../util.js';
import {
  state, member, subject, loggable, amParent, isAdultPrivate, rows, insert, upsert, update, remove, shareDefault, dueTimes, updateMember,
} from '../store.js';
import { regionAt, suggestParts } from '../body.js';
import { stepRows, stepRing, stepChart, streakText, goalSheet, goalOf, fmtSteps, saveSteps, lastDays } from '../steps.js';

const TREND = {
  same: ['equal', 'Same'], better: ['down-arrow', 'Better'], worse: ['up-arrow', 'Worse'], gone: ['check', 'Gone'],
};
const TILE = ['t-rose', 't-amber', 't-violet', 't-teal', 't-pink', 't-indigo', 't-green'];
const symIcon = (name) => {
  const n = name.toLowerCase();
  if (/head|migraine/.test(n)) return 'zap';
  if (/cough|throat|cold|flu|nose/.test(n)) return 'pulse';
  if (/tired|sleep/.test(n)) return 'moon';
  if (/rash|itch|skin/.test(n)) return 'drop';
  return 'spark';
};
let view = null;   // 'list' or 'body', remembered per person
let side = 'front';

async function load(sid, t) {
  const [symptoms, meds, doses, sleep, weights, period, endo, steps] = await Promise.all([
    rows('symptoms', (q) => q.eq('member_id', sid).lte('started_on', t).or(`ended_on.is.null,ended_on.gte.${t}`).order('started_on')),
    rows('medications', (q) => q.eq('member_id', sid).eq('active', true).order('created_at')),
    rows('medication_doses', (q) => q.eq('member_id', sid).eq('day', t)),
    rows('sleep_logs', (q) => q.eq('member_id', sid).eq('night_of', t)),
    rows('weight_logs', (q) => q.eq('member_id', sid).gte('day', addDays(t, -60)).order('day')),
    rows('period_days', (q) => q.eq('member_id', sid).eq('day', t)),
    rows('endo_logs', (q) => q.eq('member_id', sid).eq('day', t)),
    member(sid)?.steps_on ? stepRows(sid, addDays(t, -6), t) : [],
  ]);
  const ids = symptoms.map((s) => s.id);
  const checks = ids.length ? await rows('symptom_checks', (q) => q.in('symptom_id', ids).order('day')) : [];
  return { symptoms, checks, meds, doses, sleep: sleep[0] || null, weights, period: period[0] || null, endo: endo[0] || null, steps };
}

// latest severity before (or on) a day
function sevBefore(checks, symptomId, day, inclusive = false) {
  const list = checks.filter((c) => c.symptom_id === symptomId && (inclusive ? c.day <= day : c.day < day));
  return list.length ? list[list.length - 1].severity : null;
}

route('today', async (el, _a, alive) => {
  const t = today();
  const s = subject();
  const me = state.me;
  view = view || s.symptom_view || 'list';
  el.innerHTML = frame({ heroH: 300, tabs: 'today', body: header(s, t) + loadingHtml });
  const d = await load(s.id, t);
  if (!alive()) return;
  draw(el, s, t, d);
});

function header(s, t) {
  const me = state.me;
  const [hi, emoji] = greeting();
  const others = loggable();
  return `<div class="on-hero">
    <div class="row between" style="align-items:flex-start">
      <div class="grow"><div class="eyebrow">${esc(fmtLong(t))}</div>
        <div class="h1 mt4">${s.id === me.id ? `${hi}, ${esc(me.display_name)} ${emoji}` : `Logging for ${esc(s.display_name)}`}</div></div>
      <a class="round-btn" href="#/settings" aria-label="Settings">${icon('gear')}</a>
    </div>
    ${others.length > 1 || amParent() ? `<div class="logfor"><span class="eyebrow" style="flex:none">Logging for</span>
      ${others.map((m) => `<button data-act="subject" data-id="${m.id}" aria-label="${esc(m.display_name)}">${avatar(m, 40, m.id === s.id ? 'sel' : '')}</button>`).join('')}
      ${amParent() ? `<a href="#/add-person" aria-label="Add a person">${'<div class="av add" style="--s:40px">' + icon('plus') + '</div>'}</a>` : ''}
    </div>` : ''}
  </div>`;
}

function progress(s, d, t) {
  const items = [];
  const activeSyms = d.symptoms.filter((x) => !x.ended_on || x.ended_on === t);
  items.push(['Symptoms', activeSyms.every((x) => d.checks.some((c) => c.symptom_id === x.id && c.day === t))]);
  const dueMeds = d.meds.filter((m) => m.form !== 'eye_drop');
  const due = dueMeds.flatMap((m) => dueTimes(m, t).map((tm) => [m, tm]));
  if (due.length) items.push(['Meds', due.every(([m, tm]) => d.doses.some((x) => x.medication_id === m.id && x.scheduled_time === tm))]);
  items.push(['Sleep', !!d.sleep]);
  if (s.weight_on) items.push(['Weight', d.weights.some((w) => daysBetween(w.day, t) < 7)]);
  if (s.steps_on) items.push(['Steps', d.steps.some((x) => x.day === t)]);
  if (s.period_on && !s.uterus_removed) items.push(['Period', !!d.period]);
  if (s.endo_on) items.push(['Endo', !!d.endo]);
  if (s.eyes_on) {
    const drops = d.meds.filter((m) => m.form === 'eye_drop').flatMap((m) => dueTimes(m, t).map((tm) => [m, tm]));
    if (drops.length) items.push(['Eye drops', drops.every(([m, tm]) => d.doses.some((x) => x.medication_id === m.id && x.scheduled_time === tm))]);
  }
  return items;
}

function draw(el, s, t, d) {
  const items = progress(s, d, t);
  const done = items.filter((i) => i[1]).length;
  const left = items.length - done;
  const title = left === 0 ? 'All done for today!' : done === 0 ? 'Let\'s check in' : left <= 2 ? 'Nearly there!' : 'Good start';
  const sub = left === 0 ? 'Thanks. See you tomorrow.' : `${left} quick thing${left > 1 ? 's' : ''} left today`;
  const adult = isAdultPrivate(s);
  el.innerHTML = frame({ heroH: 300, tabs: 'today', body: `${header(s, t)}
    <div class="card mt16"><div class="row" style="gap:18px">${ring(done, items.length)}
      <div class="grow"><div class="h2">${title}</div><div class="muted small mt4" style="font-size:14px">${sub}</div>
      <div class="chips mt8">${items.map(([n, ok]) => `<span class="chip" ${ok ? 'style="color:var(--better)"' : ''}>${ok ? icon('check') : ''}${n}</span>`).join('')}</div></div></div></div>

    <div class="seg mt16"><button data-act="view" data-v="list" class="${view === 'list' ? 'on' : ''}">${icon('list')} List</button>
      <button data-act="view" data-v="body" class="${view === 'body' ? 'on' : ''}">${icon('body')} Body</button></div>

    ${view === 'body' ? bodyView(d, t) : listView(s, d, t)}

    <button class="btn ghost mt12" data-act="add">${icon('plus')} Add a new symptom</button>

    ${medsCard(s, d, t)}
    ${sleepCard(s, d, adult)}
    ${s.weight_on ? weightCard(s, d, t, adult) : ''}
    ${s.steps_on ? stepsCard(s, d, t, adult) : ''}
    ${trackerCards(s, d)}
    <p class="center muted small mt16">${icon('check')} Everything saves as you go</p>
  ` });
  wire(el, s, t, d);
}

// ---------- symptoms: list ----------
function listView(s, d, t) {
  const active = d.symptoms;
  if (!active.length) return `<div class="card mt16 empty">No symptoms. Feeling good? 🎉<br>Tap <b>Add a new symptom</b> if something comes up.</div>`;
  const ongoing = active.filter((x) => x.started_on < t);
  const fresh = active.filter((x) => x.started_on === t);
  return `${ongoing.length ? '<div class="section-label">Still going from yesterday</div>' : ''}${ongoing.map((x, i) => symCard(s, x, d, t, i)).join('')}
    ${fresh.length ? '<div class="section-label">New today</div>' : ''}${fresh.map((x, i) => symCard(s, x, d, t, i + ongoing.length)).join('')}`;
}

function symCard(s, x, d, t, i) {
  const todays = d.checks.find((c) => c.symptom_id === x.id && c.day === t);
  const sev = todays?.severity ?? sevBefore(d.checks, x.id, t) ?? 5;
  const dayN = daysBetween(x.started_on, t) + 1;
  const isNew = x.started_on === t;
  const by = todays && todays.logged_by !== x.member_id ? member(todays.logged_by) : null;
  if (x.ended_on === t) {
    return `<div class="card sym-done"><div class="sym-head"><div class="icon-tile ${TILE[i % TILE.length]}">${icon(symIcon(x.name))}</div>
      <div class="grow"><div class="h2">${esc(x.name)}</div><div class="muted small">${esc(x.body_area || '')} · gone today</div></div>
      <button class="chip" data-act="undo-gone" data-id="${x.id}">Undo</button></div></div>`;
  }
  return `<div class="card"><div class="sym-head"><div class="icon-tile ${TILE[i % TILE.length]}">${icon(symIcon(x.name))}</div>
    <div class="grow"><div class="h2">${esc(x.name)}</div><div class="muted small" style="font-size:13.5px">${esc(x.body_area || 'No place set')} · ${isNew ? 'new today' : `day ${dayN}`}</div></div>
    <button class="sev ${sevClass(sev)}" data-act="sev" data-id="${x.id}" aria-label="Change how bad">${sev}/10</button></div>
    ${isNew ? '' : `<div class="status-row">${Object.entries(TREND).map(([k, [ic, label]]) =>
      `<button class="sbtn ${k} ${todays?.trend === k ? 'on' : ''}" data-act="trend" data-id="${x.id}" data-t="${k}">${icon(ic)}${label}</button>`).join('')}</div>`}
    <div class="row between mt8" style="min-height:26px">
      <div class="by">${by ? `${avatar(by, 18)} Noted by ${esc(by.display_name)}` : x.note ? esc(x.note) : ''}</div>
      ${isAdultPrivate(s) ? shareChip('symptoms', x.id, x.shared) : ''}
      ${isNew ? `<button class="chip" data-act="trend" data-id="${x.id}" data-t="gone">${icon('check')} Gone</button>` : ''}
    </div></div>`;
}

export const shareChip = (table, id, shared) =>
  `<button class="sharechip ${shared ? 'on' : ''}" data-act="share" data-table="${table}" data-id="${id}">${icon(shared ? 'users' : 'lock')} ${shared ? 'Shared' : 'Only you'}</button>`;

// ---------- symptoms: body ----------
function bodyView(d, t) {
  const syms = d.symptoms.filter((x) => x.body_x != null && (x.body_side || 'front') === side && x.ended_on !== t);
  const H = 470, figW = 206, figH = 442, top = 10;
  const spots = syms.map((x) => {
    const sev = sevBefore(d.checks, x.id, t, true) ?? 5;
    return { x, sev, px: x.body_x, py: top + (x.body_y / 100) * figH };
  });
  const leftTags = spots.filter((p) => p.px < 50).sort((a, b) => a.py - b.py);
  const rightTags = spots.filter((p) => p.px >= 50).sort((a, b) => a.py - b.py);
  const place = (list) => { let last = -999; list.forEach((p) => { p.ty = Math.max(p.py - 30, last + 92); last = p.ty; }); };
  place(leftTags); place(rightTags);
  const tag = (p, leftSide) => `<button class="tag" data-act="sev" data-id="${p.x.id}" style="${leftSide ? 'left:0' : 'right:0'};top:${p.ty}px">
      <b>${esc(p.x.name)}</b><span>${esc(p.x.body_area || '')}</span><div class="sev ${sevClass(p.sev)}">${p.sev}/10</div></button>`;
  return `<div class="bodywrap" style="height:${Math.max(H, ...[...leftTags, ...rightTags].map((p) => p.ty + 100))}px">
    <div class="side-badge"><div data-act="side" data-s="front" class="${side === 'front' ? 'on' : ''}">Front</div><div data-act="side" data-s="back" class="${side === 'back' ? 'on' : ''}">Back</div></div>
    <div class="figure ${side}" data-act="tapbody"><div class="glow"></div><div class="fill"></div></div>
    <svg class="lines" id="lines"></svg>
    ${spots.map((p) => `<div class="spot ${sevClass(p.sev)}" style="left:calc(50% - 103px + ${(p.px / 100) * figW}px);top:${p.py}px"></div>`).join('')}
    ${leftTags.map((p) => tag(p, true)).join('')}${rightTags.map((p) => tag(p, false)).join('')}
  </div>
  <div class="bodyhint"><span class="chip">${icon('plus')} Tap the body to add a symptom</span></div>`;
}

function drawLines(el) {
  const wrap = el.querySelector('.bodywrap'); if (!wrap) return;
  const svg = wrap.querySelector('#lines'); const box = wrap.getBoundingClientRect();
  const spots = [...wrap.querySelectorAll('.spot')], tags = [...wrap.querySelectorAll('.tag')];
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = spots.map((sp, i) => {
    const tg = tags[i]; if (!tg) return '';
    const a = sp.getBoundingClientRect(), b = tg.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - box.left, y1 = a.top + a.height / 2 - box.top;
    const leftSide = b.left - box.left < box.width / 2;
    const x2 = leftSide ? b.right - box.left : b.left - box.left, y2 = b.top + b.height / 2 - box.top;
    const c = getComputedStyle(sp).getPropertyValue('--c') || '#A855F7';
    const mx = leftSide ? x2 + 14 : x2 - 14;
    return `<polyline points="${x1},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${c}" stroke-width="2" opacity=".9"/><circle cx="${x2}" cy="${y2}" r="4" fill="${c}"/>`;
  }).join('');
}

// ---------- meds ----------
function medsCard(s, d, t) {
  const meds = d.meds.filter((m) => m.form !== 'eye_drop');
  const due = meds.flatMap((m) => dueTimes(m, t).map((tm) => [m, tm]));
  const taken = due.filter(([m, tm]) => d.doses.some((x) => x.medication_id === m.id && x.scheduled_time === tm)).length;
  const asNeeded = meds.filter((m) => m.schedule === 'as_needed');
  return `<div class="section-label">Medications</div><div class="card">
    <div class="row between"><div class="row"><div class="icon-tile t-violet">${icon('pill')}</div><div><div class="h2">Medications</div>
      <div class="muted small">${due.length ? `${taken} of ${due.length} taken` : meds.length ? 'Only when needed' : 'None set up yet'}</div></div></div>
      <a class="linkbtn" href="#/meds">Edit</a></div>
    <div class="mt8">${due.map(([m, tm]) => {
      const dose = d.doses.find((x) => x.medication_id === m.id && x.scheduled_time === tm);
      return `<div class="medrow"><div class="grow"><b>${esc(m.name)}</b><span>${esc(m.dose || '')}${m.dose ? ' · ' : ''}${fmtClock(tm)}</span></div>
        <button class="takebtn ${dose ? 'on' : ''}" data-act="dose" data-id="${m.id}" data-tm="${tm}">${dose ? icon('check') + ' Taken' : 'Not yet'}</button></div>`;
    }).join('')}
    ${asNeeded.map((m) => {
      const n = d.doses.filter((x) => x.medication_id === m.id).length;
      return `<div class="medrow"><div class="grow"><b>${esc(m.name)}</b><span>${esc(m.dose || '')} · when needed${n ? ` · used ${n}× today` : ''}</span></div>
        <button class="takebtn" data-act="prn" data-id="${m.id}">${icon('plus')} Used now</button></div>`;
    }).join('')}
    ${!meds.length ? '<a class="btn ghost small mt8" href="#/meds">Add a regular medicine</a>' : ''}</div></div>`;
}

// ---------- sleep ----------
const FACES = ['😫', '😕', '😐', '🙂', '😄'];
const FACE_WORDS = ['Awful', 'Poor', 'OK', 'Good', 'Great'];
function sleepCard(s, d, adult) {
  const h = d.sleep?.hours ?? 7.5;
  return `<div class="section-label">Sleep</div><div class="card">
    <div class="row between"><div class="row"><div class="icon-tile t-indigo">${icon('moon')}</div><div><div class="h2">Last night</div>
      <div class="muted small">${d.sleep ? 'Saved' : 'Slide to how long you slept'}</div></div></div>
      ${adult && d.sleep ? shareChip('sleep_logs', d.sleep.id, d.sleep.shared) : ''}</div>
    <div class="row mt12" style="align-items:baseline"><div class="bigval" id="hrs">${hoursText(h).replace(/h /, '<small>h</small> ').replace(/m$/, '<small>m</small>')}</div></div>
    <input type="range" min="0" max="14" step="0.25" value="${h}" id="sleepRange" aria-label="Hours slept">
    <div class="row between muted small"><span>0h</span><span>7h</span><span>14h</span></div>
    <div class="mt12 bold" style="font-size:14px">How well?</div>
    <div class="faces">${FACES.map((f, i) => `<button data-act="quality" data-q="${i + 1}" class="${d.sleep?.quality === i + 1 ? 'on' : ''}" aria-label="${FACE_WORDS[i]}">${f}</button>`).join('')}</div>
  </div>`;
}

// ---------- weight ----------
function weightCard(s, d, t, adult) {
  const last = d.weights[d.weights.length - 1];
  const weekAgo = d.weights.filter((w) => daysBetween(w.day, t) >= 6).pop();
  const diff = last && weekAgo && last.id !== weekAgo.id ? round1(last.kg - weekAgo.kg) : null;
  const todays = d.weights.find((w) => w.day === t);
  return `<div class="section-label">Weight</div><div class="card">
    <div class="row between"><div class="row"><div class="icon-tile t-teal">${icon('scale')}</div><div><div class="h2">Weight</div>
      <div class="muted small">Weekly · optional${last ? ` · last ${fmtDay(last.day)}` : ''}</div></div></div>
      ${adult && todays ? shareChip('weight_logs', todays.id, todays.shared) : adult ? `<span class="sharechip">${icon(s.share_weight ? 'users' : 'lock')} ${s.share_weight ? 'Shared' : 'Only you'}</span>` : ''}</div>
    <div class="inline-input mt12"><input class="input" id="kg" type="number" inputmode="decimal" step="0.1" min="1" max="400" placeholder="${last ? last.kg : 'kg'}" value="${todays ? todays.kg : ''}" style="max-width:140px">
      <span class="unit">kg</span><button class="btn small" data-act="weight">Save</button></div>
    ${diff != null ? `<div class="muted small mt8" style="font-weight:700">${diff < 0 ? '▼' : diff > 0 ? '▲' : '='} ${Math.abs(diff)} kg this week</div>` : ''}
  </div>`;
}

// ---------- steps ----------
function stepsCard(s, d, t, adult) {
  const goal = goalOf(s);
  const todays = d.steps.find((x) => x.day === t);
  const n = todays?.steps ?? 0;
  const left = goal - n;
  const week = lastDays(7, t);
  const fromWatch = d.steps.some((x) => x.source === 'iphone');
  return `<div class="section-label">Steps</div><div class="card">
    <div class="row between"><div class="row"><div class="icon-tile t-green">${icon('steps')}</div><div><div class="h2">Steps</div>
      <div class="muted small">Goal ${fmtSteps(goal)} a day${todays?.source === 'iphone' ? ' · from Apple Watch' : ''}</div></div></div>
      ${adult && todays ? shareChip('step_logs', todays.id, todays.shared) : adult ? `<span class="sharechip">${icon(s.share_steps ? 'users' : 'lock')} ${s.share_steps ? 'Shared' : 'Only you'}</span>` : ''}</div>
    <div class="row mt16" style="gap:18px">${stepRing(n, goal)}
      <div class="grow"><div class="h2" style="font-size:19px">${!todays ? 'No steps yet today' : left <= 0 ? 'Goal reached! 🎉' : `${fmtSteps(left)} to go`}</div>
        <div class="muted small mt4" style="font-weight:700">${streakText(d.steps, goal, week)}</div>
        <button class="linkbtn mt4" data-act="goal">Change goal</button></div></div>
    ${stepChart(week, d.steps, goal)}
    <div class="inline-input mt12"><input class="input" id="stepsIn" type="number" inputmode="numeric" min="0" max="200000" step="1" placeholder="Steps today" value="${todays ? todays.steps : ''}" style="max-width:160px">
      <button class="btn small" data-act="steps">Save</button></div>
    ${s.id === state.me.id && !fromWatch ? `<a class="list-row mt8" href="#/steps-auto"><div class="grow"><b>Get steps from your Apple Watch</b><span>Set it up once, then they arrive by themselves</span></div><span class="chev">${icon('right')}</span></a>` : ''}
  </div>`;
}

// ---------- tracker shortcuts ----------
function trackerCards(s, d) {
  const cards = [];
  if (s.period_on && !s.uterus_removed) cards.push(['period', 't-pink', 'flower', 'Period tracker', d.period ? `Today: ${d.period.flow || 'logged'}` : 'Tap to log today']);
  if (s.endo_on) cards.push(['endo', 't-rose', 'pulse', 'Endo tracker', d.endo ? `Pelvic pain today: ${d.endo.pelvic_pain ?? '–'}/10` : 'Tap to log today']);
  if (s.eyes_on) cards.push(['eyes', 't-teal', 'eye', 'Eye care', 'Drops and eye pressure']);
  if (!cards.length) return '';
  return `<div class="section-label">My trackers</div><div class="card">${cards.map(([r, tile, ic, name, sub]) =>
    `<a class="list-row" href="#/${r}"><div class="icon-tile ${tile}">${icon(ic)}</div><div class="grow"><b>${name}</b><span>${esc(sub)}</span></div><span class="chev">${icon('right')}</span></a>`).join('')}</div>`;
}

// ---------- actions ----------
function wire(el, s, t, d) {
  const redraw = async () => { const nd = await load(s.id, t); draw(el, s, t, nd); };
  if (view === 'body') requestAnimationFrame(() => drawLines(el));

  const range = el.querySelector('#sleepRange');
  let sleepTimer;
  const saveSleep = async (fields) => {
    try {
      const row = await upsert('sleep_logs', {
        member_id: s.id, night_of: t, hours: d.sleep?.hours ?? 7.5, quality: d.sleep?.quality ?? null,
        shared: d.sleep?.shared ?? shareDefault(s, 'sleep'), ...fields,
      }, 'member_id,night_of');
      const first = !d.sleep; d.sleep = row;
      if (first) draw(el, s, t, d);
    } catch (e) { toast(e.message); }
  };
  range?.addEventListener('input', () => { el.querySelector('#hrs').innerHTML = hoursText(+range.value).replace(/h /, '<small>h</small> ').replace(/m$/, '<small>m</small>'); });
  range?.addEventListener('change', () => { clearTimeout(sleepTimer); sleepTimer = setTimeout(() => saveSleep({ hours: +range.value }), 150); });

  on(el, {
    subject: (b) => { state.subjectId = b.dataset.id; view = null; go('today'); },
    view: async (b) => {
      view = b.dataset.v; draw(el, s, t, d);
      if (s.id === state.me.id) updateMember(s.id, { symptom_view: view }).catch(() => {});
    },
    side: (b) => { side = b.dataset.s; draw(el, s, t, d); },
    tapbody: (fig, e) => {
      const r = fig.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
      addSymptom(s, t, { x, y, side, area: regionAt(x, y, side) }, redraw);
    },
    add: () => addSymptom(s, t, null, redraw),
    trend: async (b) => {
      const x = d.symptoms.find((y) => y.id === b.dataset.id);
      const k = b.dataset.t;
      const todays = d.checks.find((c) => c.symptom_id === x.id && c.day === t);
      const prev = sevBefore(d.checks, x.id, t) ?? todays?.severity ?? 5;
      const sev = k === 'better' ? Math.max(1, prev - 1) : k === 'worse' ? Math.min(10, prev + 1) : prev;
      try {
        await upsert('symptom_checks', { symptom_id: x.id, member_id: s.id, day: t, severity: x.started_on === t ? (todays?.severity ?? prev) : sev, trend: x.started_on === t && k !== 'gone' ? 'new' : k, shared: x.shared }, 'symptom_id,day');
        if (k === 'gone') await update('symptoms', x.id, { ended_on: t });
        else if (x.ended_on) await update('symptoms', x.id, { ended_on: null });
        if (k === 'gone') toast(`Great, ${x.name.toLowerCase()} is gone 🎉`);
        redraw();
      } catch (e) { toast(e.message); }
    },
    'undo-gone': async (b) => {
      const x = d.symptoms.find((y) => y.id === b.dataset.id);
      try {
        await update('symptoms', x.id, { ended_on: null });
        const c = d.checks.find((c2) => c2.symptom_id === x.id && c2.day === t);
        if (c) await remove('symptom_checks', c.id);
        redraw();
      } catch (e) { toast(e.message); }
    },
    sev: (b) => {
      const x = d.symptoms.find((y) => y.id === b.dataset.id);
      const todays = d.checks.find((c) => c.symptom_id === x.id && c.day === t);
      pickSeverity(x.name, todays?.severity ?? sevBefore(d.checks, x.id, t) ?? 5, async (n) => {
        await upsert('symptom_checks', { symptom_id: x.id, member_id: s.id, day: t, severity: n, trend: todays?.trend || (x.started_on === t ? 'new' : 'same'), shared: x.shared }, 'symptom_id,day');
        redraw();
      }, async () => {
        if (!(await confirmBox('Delete this symptom?', `${x.name} and its history will be removed.`, 'Delete', true))) return;
        await remove('symptoms', x.id); redraw();
      });
    },
    share: async (b) => {
      const table = b.dataset.table, id = b.dataset.id;
      const was = b.classList.contains('on');
      try {
        await update(table, id, { shared: !was });
        if (table === 'symptoms') {
          const ids = d.checks.filter((c) => c.symptom_id === id).map((c) => c.id);
          for (const cid of ids) await update('symptom_checks', cid, { shared: !was });
        }
        toast(!was ? 'Shared with the family' : 'Now only you can see this');
        redraw();
      } catch (e) { toast(e.message); }
    },
    dose: async (b) => {
      const m = d.meds.find((x) => x.id === b.dataset.id), tm = b.dataset.tm;
      const dose = d.doses.find((x) => x.medication_id === m.id && x.scheduled_time === tm);
      try {
        if (dose) await remove('medication_doses', dose.id);
        else await insert('medication_doses', { medication_id: m.id, member_id: s.id, day: t, scheduled_time: tm, shared: m.shared });
        redraw();
      } catch (e) { toast(e.message); }
    },
    prn: async (b) => {
      const m = d.meds.find((x) => x.id === b.dataset.id);
      try { await insert('medication_doses', { medication_id: m.id, member_id: s.id, day: t, scheduled_time: null, shared: m.shared }); toast(`${m.name} noted`); redraw(); } catch (e) { toast(e.message); }
    },
    quality: (b) => saveSleep({ quality: +b.dataset.q, hours: +range.value }).then(() => {
      el.querySelectorAll('.faces button').forEach((x) => x.classList.toggle('on', x === b));
    }),
    goal: () => goalSheet(s, redraw),
    steps: async () => {
      const v = el.querySelector('#stepsIn').value;
      const n = Math.round(+v);
      if (v === '' || !(n >= 0 && n <= 200000)) return toast('Type today\'s steps');
      try { await saveSteps(s, t, n, 'app', d.steps.find((x) => x.day === t)); toast('Steps saved'); redraw(); } catch (e) { toast(e.message); }
    },
    weight: async () => {
      const kg = parseFloat(el.querySelector('#kg').value);
      if (!(kg > 0 && kg < 400)) return toast('Type your weight in kg');
      try {
        await upsert('weight_logs', { member_id: s.id, day: t, kg, shared: shareDefault(s, 'weight') }, 'member_id,day');
        toast('Weight saved'); redraw();
      } catch (e) { toast(e.message); }
    },
  });
}

// ---------- severity picker ----------
export function pickSeverity(title, current, onSave, onDelete) {
  let n = current;
  const sh = sheet(`<div class="sheet-head"><div class="h2">How bad is ${esc(title.toLowerCase())}?</div><button class="xbtn" data-close>${icon('x')}</button></div>
    <div class="muted mt4" id="sevword" style="font-weight:700">${n} · ${SEV_WORDS[n]}</div>
    <div class="scale" id="scale">${Array.from({ length: 10 }, (_, i) => `<button data-n="${i + 1}" style="background:${sevColour(i + 1)}" class="${i + 1 === n ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
    <button class="btn mt20" data-save>Save</button>
    ${onDelete ? `<button class="btn ghost mt12" data-del>${icon('trash')} Delete this symptom</button>` : ''}`);
  sh.el.querySelector('#scale').addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]'); if (!b) return;
    n = +b.dataset.n; sh.el.querySelectorAll('#scale button').forEach((x) => x.classList.toggle('on', x === b));
    sh.el.querySelector('#sevword').textContent = `${n} · ${SEV_WORDS[n]}`;
  });
  sh.el.querySelector('[data-save]').addEventListener('click', async () => { try { await onSave(n); sh.close(); } catch (e) { toast(e.message); } });
  sh.el.querySelector('[data-del]')?.addEventListener('click', async () => { sh.close(); try { await onDelete(); } catch (e) { toast(e.message); } });
}

// ---------- add a new symptom ----------
const KINDS = ['Headache', 'Ache', 'Sharp pain', 'Sore', 'Stiff', 'Itchy', 'Rash', 'Swelling', 'Cough', 'Sore throat', 'Blocked nose', 'Feeling sick', 'Tummy ache', 'Tired', 'Dizzy'];
function addSymptom(s, t, spot, done) {
  let sev = 4, started = t, area = spot?.area || '';
  const adult = isAdultPrivate(s);
  let shared = shareDefault(s, 'symptoms') || !adult;
  const sh = sheet(`<div class="sheet-head"><div><div class="eyebrow muted">${s.id === state.me.id ? '' : `Logging for ${esc(s.display_name)}`}</div><div class="h2">New symptom</div></div><button class="xbtn" data-close>${icon('x')}</button></div>
    <label class="field"><span>What is it?</span><input class="input" id="nm" placeholder="e.g. Headache" autocomplete="off"></label>
    <div class="chips mt8" id="kinds">${KINDS.map((k) => `<button class="chip" data-k="${k}">${k}</button>`).join('')}</div>
    <label class="field"><span>Where${spot ? ` · ${spot.side} view` : ''}</span><input class="input" id="where" value="${esc(area)}" placeholder="e.g. Left knee" autocomplete="off"></label>
    <div class="suggest" id="sugg"></div>
    <div class="field"><span>How bad? <b id="sevw" style="color:var(--text)">${sev} · ${SEV_WORDS[sev]}</b></span>
      <div class="scale" id="scale">${Array.from({ length: 10 }, (_, i) => `<button data-n="${i + 1}" style="background:${sevColour(i + 1)}" class="${i + 1 === sev ? 'on' : ''}">${i + 1}</button>`).join('')}</div></div>
    <div class="field"><span>Started</span><div class="chips" id="when">
      <button class="chip sel" data-d="${t}">Today</button><button class="chip" data-d="${addDays(t, -1)}">Yesterday</button>
      <label class="chip" style="position:relative">${icon('cal')} <span id="pickedDay">Pick a day</span><input type="date" id="day" max="${t}" style="position:absolute;inset:0;opacity:0"></label></div></div>
    <label class="field"><span>Note (optional)</span><input class="input" id="note" placeholder="e.g. after gardening"></label>
    ${adult ? `<div class="row between mt16"><div><b>Share with family</b><div class="muted small">Otherwise only you can see it</div></div><button class="toggle ${shared ? 'on' : ''}" id="shr" aria-label="Share with family"></button></div>` : ''}
    <div class="err mt12" id="err"></div>
    <button class="btn mt8" id="save">Add symptom</button>`);
  const $ = (q) => sh.el.querySelector(q);
  const showSugg = () => {
    const list = suggestParts($('#where').value).filter((x) => x.toLowerCase() !== $('#where').value.toLowerCase());
    $('#sugg').innerHTML = list.map((x) => `<button class="chip" data-p="${esc(x)}">${esc(x)}</button>`).join('');
  };
  $('#where').addEventListener('input', showSugg);
  $('#sugg').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { $('#where').value = b.dataset.p; $('#sugg').innerHTML = ''; } });
  $('#kinds').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    $('#nm').value = b.dataset.k;
    sh.el.querySelectorAll('#kinds .chip').forEach((x) => x.classList.toggle('sel', x === b));
  });
  $('#scale').addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]'); if (!b) return;
    sev = +b.dataset.n; sh.el.querySelectorAll('#scale button').forEach((x) => x.classList.toggle('on', x === b));
    $('#sevw').textContent = `${sev} · ${SEV_WORDS[sev]}`;
  });
  $('#when').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    started = b.dataset.d; sh.el.querySelectorAll('#when .chip').forEach((x) => x.classList.toggle('sel', x === b));
    $('#pickedDay').textContent = 'Pick a day';
  });
  $('#day').addEventListener('change', (e) => {
    if (!e.target.value) return;
    started = e.target.value; sh.el.querySelectorAll('#when .chip').forEach((x) => x.classList.toggle('sel', x.contains(e.target)));
    $('#pickedDay').textContent = fmtDay(started);
  });
  $('#shr')?.addEventListener('click', (e) => { shared = !shared; e.currentTarget.classList.toggle('on', shared); });
  $('#save').addEventListener('click', async () => {
    const name = $('#nm').value.trim();
    if (!name) { $('#err').textContent = 'Say what it is, for example "Headache".'; return; }
    $('#save').disabled = true;
    try {
      const sym = await insert('symptoms', {
        member_id: s.id, name: name[0].toUpperCase() + name.slice(1), kind: name, body_area: $('#where').value.trim() || null,
        body_side: spot?.side || null, body_x: spot ? Math.round(spot.x * 100) / 100 : null, body_y: spot ? Math.round(spot.y * 100) / 100 : null,
        started_on: started, note: $('#note').value.trim() || null, shared,
      });
      await insert('symptom_checks', { symptom_id: sym.id, member_id: s.id, day: t, severity: sev, trend: 'new', shared });
      sh.close(); toast('Symptom added'); done();
    } catch (e) { $('#err').textContent = e.message; $('#save').disabled = false; }
  });
  setTimeout(() => (spot ? $('#nm') : $('#nm')).focus(), 250);
}
