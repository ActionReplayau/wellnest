// Optional trackers: period, cycle, iPhone Health import, endo, eye care
import { route, frame, backBar, go } from '../app.js';
import {
  esc, icon, toast, on, sheet, today, addDays, daysBetween, fmtDay, dayName, avg, round1, loadingHtml, fmtClock, fmtTime, sevColour,
} from '../util.js';
import { state, subject, isAdultPrivate, rows, upsert, insert, remove, update, upsertMany, updateMember, shareDefault, dueTimes } from '../store.js';
import { cycleStats, phases, phaseOn, estimateFromPain } from '../cycle.js';

const redo = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const by = (s) => (s.id === state.me.id ? '' : `Logging for ${esc(s.display_name)} · `);
const toggleChip = (on2, label) => `<span class="chip ${on2 ? 'psel' : ''}">${label}</span>`;

// =====================================================================
// Period tracker
// =====================================================================
const FLOWS = [['none', 'None', 0], ['spotting', 'Spotting', 1], ['light', 'Light', 1], ['medium', 'Medium', 2], ['heavy', 'Heavy', 3]];
const EXTRAS = ['Cramps', 'Back ache', 'Tired', 'Bloating', 'Headache', 'Sore breasts', 'Acne', 'Feeling sick'];
let periodDay = null;

route('period', async (el, _a, alive) => {
  const s = subject(), t = today();
  if (s.uterus_removed && s.endo_on) return go('endo');
  const day = periodDay || t;
  el.innerHTML = frame({ heroH: 330, heroAttr: 'data-period-hero', body: backBar('', 'today') + loadingHtml });
  const all = await rows('period_days', (q) => q.eq('member_id', s.id).gte('day', addDays(t, -400)).order('day'));
  if (!alive()) return;
  const st = cycleStats(all, t);
  const row = all.find((r) => r.day === day);
  const inPeriod = st.last && daysBetween(st.last.end, t) <= 1 && st.last.end >= addDays(t, -1);
  const dayOf = st.dayOf;
  const ringPct = dayOf ? Math.min(dayOf / st.cycleLen, 1) : 0;
  const R = 56, C = 2 * Math.PI * R;
  // calendar: this week and next
  const start = addDays(t, -((new Date(t + 'T12:00').getDay() + 6) % 7) - 7);
  const cal = Array.from({ length: 21 }, (_, i) => addDays(start, i));
  const bleed = new Map(all.map((r) => [r.day, r.flow]));
  const predicted = new Set();
  if (st.next) for (let i = 0; i < st.periodLen; i++) predicted.add(addDays(st.next, i));
  const adult = isAdultPrivate(s);
  el.innerHTML = frame({ heroH: 330, heroAttr: 'data-period-hero', body: `${backBar('', 'today')}
    <div class="on-hero"><div class="eyebrow">${by(s)}${esc(s.display_name)}</div><div class="h1 mt4">Period tracker</div></div>
    <div class="card mt16"><div class="row" style="gap:18px">
      <div class="pring"><svg width="132" height="132" style="transform:rotate(-90deg)"><circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--track)" stroke-width="12"/>
        <circle cx="66" cy="66" r="${R}" fill="none" stroke="#EC4899" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C * ringPct} ${C}"/></svg>
        <div class="lbl">${dayOf ? `<span class="muted small" style="font-weight:700">Day</span><b style="font-size:34px;line-height:1">${dayOf}</b><span class="muted small" style="font-weight:700">of ${st.cycleLen}</span>` : '<span class="muted small center" style="font-weight:700;padding:0 18px">Log your first period</span>'}</div></div>
      <div class="grow">
        <div class="muted small" style="font-weight:700">${inPeriod ? 'Period' : 'Next one'}</div>
        <div class="h2">${inPeriod ? `Day ${daysBetween(st.last.start, t) + 1} of about ${st.periodLen}` : st.next ? `About ${fmtDay(st.next)}` : 'Not enough yet'}</div>
        ${!inPeriod && st.next ? `<div class="muted small">in ${daysBetween(t, st.next)} days · ±${st.spread}</div>` : ''}
        <div class="row between mt12"><span class="small" style="font-weight:700">On family screen</span><button class="toggle ${s.share_period ? 'on' : ''} purple" data-act="sharefam" aria-label="Show on family screen"></button></div>
      </div></div></div>

    <div class="section-label">${day === t ? 'Flow today' : `Flow on ${fmtDay(day)}`}</div>
    <div class="row gap8">${FLOWS.map(([k, l, n]) => `<button class="flow ${row?.flow === k ? 'on' : ''}" data-act="flow" data-f="${k}"><span>${n ? icon('drop').repeat(n) : icon('x')}</span>${l}</button>`).join('')}</div>
    <div class="section-label">Anything else?</div>
    <div class="chips">${EXTRAS.map((x) => `<button class="chip ${(row?.extras || []).includes(x) ? 'psel' : ''}" data-act="extra" data-x="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="row between mt12"><label class="chip" style="position:relative">${icon('cal')} ${day === t ? 'Log another day' : `Logging ${fmtDay(day)}`}<input type="date" id="pday" max="${t}" value="${day}" style="position:absolute;inset:0;opacity:0"></label>
      ${day !== t ? '<button class="linkbtn" data-act="backtoday">Back to today</button>' : ''}</div>

    <div class="section-label">These three weeks</div>
    <div class="card"><div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<b>${x}</b>`).join('')}
      ${cal.map((d) => { const f = bleed.get(d); const cls = ['light', 'medium', 'heavy'].includes(f) ? 'p' : f === 'spotting' ? 'sp' : predicted.has(d) && d > t ? 'p fut' : ''; return `<span class="${cls} ${d === t ? 'today' : ''}">${+d.slice(8)}</span>`; }).join('')}</div>
      <div class="legend"><span><i class="legend-dot" style="background:#EC4899"></i>Period</span><span><i class="legend-dot" style="border:2px dashed #F9A8D4"></i>Expected</span><span><i class="legend-dot" style="background:color-mix(in srgb,#EC4899 30%,transparent)"></i>Spotting</span></div></div>

    <a class="card" href="#/cycle" style="display:block"><div class="row"><div class="icon-tile t-pink">${icon('chart')}</div><div class="grow"><div class="h2">Your cycle</div><div class="muted small">Phases, averages and past cycles</div></div>${icon('right')}</div></a>
    ${s.id === state.me.id ? `<a class="card" href="#/import" style="display:block"><div class="row"><div class="icon-tile t-indigo">${icon('upload')}</div><div class="grow"><div class="h2">Import from iPhone Health</div><div class="muted small">Bring in your past periods</div></div>${icon('right')}</div></a>` : ''}
    ${adult ? `<p class="muted small center mt16">${icon('lock')} ${s.share_period ? 'Your family can see that you\'re on your period, not the details.' : 'Private to you.'}</p>` : ''}
  ` });
  el.querySelector('#pday').addEventListener('change', (e) => { if (e.target.value) { periodDay = e.target.value; redo(); } });
  const save = async (fields) => {
    try {
      await upsert('period_days', { member_id: s.id, day, flow: row?.flow ?? null, extras: row?.extras ?? [], shared: s.share_period, ...fields }, 'member_id,day');
      redo();
    } catch (e) { toast(e.message); }
  };
  on(el, {
    flow: (b) => save({ flow: row?.flow === b.dataset.f ? null : b.dataset.f }),
    extra: (b) => { const x = new Set(row?.extras || []); x.has(b.dataset.x) ? x.delete(b.dataset.x) : x.add(b.dataset.x); save({ extras: [...x] }); },
    backtoday: () => { periodDay = null; redo(); },
    sharefam: async () => {
      try {
        const v = !s.share_period;
        await updateMember(s.id, { share_period: v });
        const recent = all.filter((r) => r.day >= addDays(t, -60));
        for (const r of recent) await update('period_days', r.id, { shared: v });
        toast(v ? 'Shows on the family screen' : 'Now private'); redo();
      } catch (e) { toast(e.message); }
    },
  });
});

// =====================================================================
// Your cycle
// =====================================================================
route('cycle', async (el, _a, alive) => {
  const s = subject(), t = today();
  el.innerHTML = frame({ heroH: 230, heroAttr: 'data-period-hero', body: backBar('', 'period') + loadingHtml });
  const all = await rows('period_days', (q) => q.eq('member_id', s.id).gte('day', addDays(t, -800)).order('day'));
  if (!alive()) return;
  const st = cycleStats(all, t);
  const ph = phases(st.cycleLen, st.periodLen);
  const now = phaseOn(st.dayOf, st.cycleLen, st.periodLen);
  const R = 62, C = 2 * Math.PI * R;
  const arcs = ph.map((p) => {
    const a = (p.from - 1) / st.cycleLen, b = p.to / st.cycleLen;
    return `<circle cx="75" cy="75" r="${R}" fill="none" stroke="${p.colour}" stroke-width="12" stroke-dasharray="${C * (b - a) - 3} ${C}" stroke-dashoffset="${-C * a}" opacity="${now && now.key === p.key ? 1 : 0.45}"/>`;
  }).join('');
  const dotAngle = st.dayOf ? (((st.dayOf - 1) % st.cycleLen) / st.cycleLen) * 2 * Math.PI : null;
  const maxLen = Math.max(35, ...st.recent.map((c) => c.length));
  el.innerHTML = frame({ heroH: 230, heroAttr: 'data-period-hero', body: `${backBar('', 'period')}
    <div class="on-hero"><div class="eyebrow">${esc(s.display_name)} · ${st.learnedFrom ? `learned from ${st.learnedFrom} cycle${st.learnedFrom > 1 ? 's' : ''}` : 'still learning'}</div><div class="h1 mt4">Your cycle</div></div>
    <div class="card mt16"><div class="row" style="gap:16px">
      <div class="wheel"><svg width="150" height="150" style="transform:rotate(-90deg)">${arcs}
        ${dotAngle != null ? `<circle cx="${75 + R * Math.cos(dotAngle)}" cy="${75 + R * Math.sin(dotAngle)}" r="9" fill="#fff" stroke="${now?.colour}" stroke-width="4"/>` : ''}</svg>
        <div class="lbl">${st.dayOf ? `<span class="muted small" style="font-weight:700">Day</span><b style="font-size:32px;line-height:1">${st.dayOf}</b><span class="small" style="font-weight:800;color:${now?.colour}">${now?.name}</span>` : '<span class="muted small">–</span>'}</div></div>
      <div class="grow">${now ? `<div class="muted small" style="font-weight:700">You're in your</div><div class="h2">${now.name} phase</div><p class="lead mt4" style="font-size:13px">${esc(now.note)}</p>` : '<p class="lead">Log a period to see where you are in your cycle.</p>'}</div></div>
      <div class="phases">${ph.map((p) => `<div><i style="background:${p.colour}"></i>${p.name}<small>${p.from}–${p.to}</small></div>`).join('')}</div></div>
    <div class="row gap8 mt12">
      <div class="card mini"><div class="muted small" style="font-weight:700">Cycle</div><div class="big">${st.cycleLen}<span> days</span></div><div class="muted small">average</div></div>
      <div class="card mini"><div class="muted small" style="font-weight:700">Period</div><div class="big">${st.periodLen}<span> days</span></div><div class="muted small">average</div></div>
      <div class="card mini"><div class="muted small" style="font-weight:700">Next</div><div class="big">${st.next ? `${+st.next.slice(8)}<span> ${fmtDay(st.next, { month: 'short' })}</span>` : '–'}</div><div class="muted small">± ${st.spread} days</div></div></div>
    <div class="section-label">Past cycles · ${st.regular}</div>
    <div class="card">${st.recent.length ? `<div class="cycles">${st.recent.slice().reverse().map((c) => `<div class="r"><span class="m">${fmtDay(c.start, { month: 'short' })}</span>
      <div class="bar"><b style="width:${(c.bleed / maxLen) * 100}%"></b><u style="left:${(c.bleed / maxLen) * 100}%;width:${((c.length - c.bleed) / maxLen) * 100}%"></u></div><span class="n">${c.length}</span></div>`).join('')}</div>`
      : '<div class="empty">After two periods, your past cycles show here. You can also import them from iPhone Health.</div>'}</div>
    <p class="muted small mt16" style="line-height:1.5">Predictions are estimates from your own history, not medical advice and not contraception.</p>` });
});

// =====================================================================
// Import from iPhone Health
// =====================================================================
route('import', (el) => {
  const s = state.me;
  el.innerHTML = frame({ heroH: 230, heroAttr: 'data-period-hero', body: `${backBar('', s.period_on ? 'period' : 'settings')}
    <div class="on-hero"><div class="eyebrow">${esc(s.display_name)}</div><div class="h1 mt4">Bring in your history</div><p class="lead mt4">From the Health app on your iPhone</p></div>
    <div class="card mt16"><div class="steps">
      <div><b>1</b><span>Open <strong>Health</strong>, tap your picture at the top right</span></div>
      <div><b>2</b><span>Tap <strong>Export All Health Data</strong> and save it to Files</span></div>
      <div><b>3</b><span>Come back here and pick that file (<strong>export.zip</strong>)</span></div></div>
      <label class="btn mt16" style="position:relative">${icon('upload')} Choose export.zip<input type="file" id="file" accept=".zip,application/zip" style="position:absolute;inset:0;opacity:0"></label>
      <p class="muted small mt8">The file is read on this phone. Only the dates and numbers you pick below are saved.</p></div>
    <div id="result"></div>` });
  el.querySelector('#file').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const out = el.querySelector('#result');
    out.innerHTML = `<div class="card"><div class="h2">Reading your export…</div><div class="progress mt12"><b id="bar"></b></div><div class="muted small mt8" id="pct">0%</div></div>`;
    try {
      const found = await readHealthExport(file, (f) => { el.querySelector('#bar').style.width = `${Math.round(f * 100)}%`; el.querySelector('#pct').textContent = `${Math.round(f * 100)}%`; });
      const periods = cycleStats(found.period).periods;
      const sleepN = found.sleep.length, weightN = found.weight.length;
      const span = found.period.length ? `${fmtDay(found.period[0].day, { month: 'short', year: 'numeric' })} to ${fmtDay(found.period[found.period.length - 1].day, { month: 'short', year: 'numeric' })}` : '';
      out.innerHTML = `<div class="card"><div class="h2">Found ${periods.length} period${periods.length === 1 ? '' : 's'}${span ? ` · ${span}` : ''}</div>
        <div class="mt8">
          <label class="list-row"><input type="checkbox" id="cP" ${found.period.length ? 'checked' : 'disabled'}><div class="grow"><b><i class="hk" style="background:#EC4899"></i> Period dates & flow</b><span>${found.period.length} days</span></div></label>
          <label class="list-row"><input type="checkbox" id="cS" ${sleepN ? '' : 'disabled'}><div class="grow"><b><i class="hk" style="background:#6366F1"></i> Sleep</b><span>${sleepN} nights</span></div></label>
          <label class="list-row"><input type="checkbox" id="cW" ${weightN ? '' : 'disabled'}><div class="grow"><b><i class="hk" style="background:#2DD4BF"></i> Weight</b><span>${weightN} readings</span></div></label></div>
        <button class="btn mt16" id="go">Import</button>
        <p class="muted small center mt8">${icon('lock')} Stays private to you. Anything you've already logged in Wellnest is kept.</p></div>`;
      out.querySelector('#go').addEventListener('click', async (ev) => {
        ev.target.disabled = true; ev.target.textContent = 'Importing…';
        try {
          if (out.querySelector('#cP').checked) await upsertMany('period_days', found.period.map((r) => ({ ...r, member_id: s.id, source: 'iphone', shared: false })), 'member_id,day');
          if (out.querySelector('#cS').checked) await upsertMany('sleep_logs', found.sleep.map((r) => ({ ...r, member_id: s.id, source: 'iphone', shared: shareDefault(s, 'sleep') })), 'member_id,night_of');
          if (out.querySelector('#cW').checked) await upsertMany('weight_logs', found.weight.map((r) => ({ ...r, member_id: s.id, source: 'iphone', shared: shareDefault(s, 'weight') })), 'member_id,day');
          if (out.querySelector('#cP').checked && !s.period_on) await updateMember(s.id, { period_on: true });
          toast('Imported'); go(out.querySelector('#cP').checked ? 'cycle' : 'history');
        } catch (e2) { toast(e2.message); ev.target.disabled = false; ev.target.textContent = 'Import'; }
      });
    } catch (ex) {
      out.innerHTML = `<div class="card"><div class="h2">That didn't work</div><p class="lead mt8">${esc(ex.message)}</p></div>`;
    }
  });
});

// Reads export.zip -> export.xml as a stream, so very large exports work on a phone.
export async function readHealthExport(file, progress = () => {}) {
  const FF = window.fflate;
  const period = new Map(), sleepBySource = new Map(), weight = new Map();
  const dayOf = (s) => s.slice(0, 10);
  const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? m[1] : null; };
  const handle = (tag) => {
    const type = attr(tag, 'type');
    if (!type) return;
    if (type === 'HKCategoryTypeIdentifierMenstrualFlow') {
      const v = attr(tag, 'value') || '';
      const flow = /Heavy$/.test(v) ? 'heavy' : /Medium$/.test(v) || /Unspecified$/.test(v) ? 'medium' : /Light$/.test(v) ? 'light' : /None$/.test(v) ? 'none' : null;
      if (flow) { const d = dayOf(attr(tag, 'startDate')); const rank = { none: 0, light: 1, medium: 2, heavy: 3 }; if (!period.has(d) || rank[flow] > rank[period.get(d)]) period.set(d, flow); }
    } else if (type === 'HKCategoryTypeIdentifierIntermenstrualBleeding') {
      const d = dayOf(attr(tag, 'startDate')); if (!period.has(d)) period.set(d, 'spotting');
    } else if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      const v = attr(tag, 'value') || '';
      if (!/Asleep/.test(v)) return;
      const a = new Date(attr(tag, 'startDate').replace(' ', 'T').replace(/ ([+-]\d\d)(\d\d)$/, '$1:$2'));
      const b = new Date(attr(tag, 'endDate').replace(' ', 'T').replace(/ ([+-]\d\d)(\d\d)$/, '$1:$2'));
      const hrs = (b - a) / 3600000; if (!(hrs > 0 && hrs < 24)) return;
      const night = dayOf(attr(tag, 'endDate')), src = attr(tag, 'sourceName') || '?';
      const key = `${night}|${src}`; sleepBySource.set(key, (sleepBySource.get(key) || 0) + hrs);
    } else if (type === 'HKQuantityTypeIdentifierBodyMass') {
      let v = parseFloat(attr(tag, 'value')); const unit = attr(tag, 'unit');
      if (unit === 'lb') v *= 0.45359237; else if (unit === 'g') v /= 1000;
      if (v > 1 && v < 400) weight.set(dayOf(attr(tag, 'startDate')), Math.round(v * 10) / 10);
    }
  };
  await new Promise((resolve, reject) => {
    let found = false, buf = '', done = false;
    const dec = new TextDecoder();
    const unzip = new FF.Unzip((f) => {
      if (!/(^|\/)export\.xml$/.test(f.name)) return;
      found = true;
      f.ondata = (err, chunk, final) => {
        if (err) { reject(err); return; }
        buf += dec.decode(chunk, { stream: !final });
        let last = 0; const re = /<Record\s[^>]*>/g; let m;
        while ((m = re.exec(buf))) { handle(m[0]); last = re.lastIndex; }
        const cut = buf.lastIndexOf('<');
        buf = buf.slice(Math.max(last, cut >= last ? cut : buf.length));
        if (final) { done = true; resolve(); }
      };
      f.start();
    });
    unzip.register(FF.UnzipInflate);
    const reader = file.stream().getReader();
    let read = 0;
    (async () => {
      try {
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) { unzip.push(new Uint8Array(0), true); break; }
          read += value.length; progress(read / file.size);
          unzip.push(value);
          await new Promise((r) => setTimeout(r, 0));
        }
        setTimeout(() => { if (!found) reject(new Error('Couldn\'t find export.xml in that file. Make sure you picked export.zip from the Health app.')); else if (!done) resolve(); }, 50);
      } catch (e) { reject(e); }
    })();
  });
  const sleepByNight = new Map();
  for (const [key, h] of sleepBySource) { const n = key.split('|')[0]; sleepByNight.set(n, Math.max(sleepByNight.get(n) || 0, h)); }
  return {
    period: [...period].sort().map(([day, flow]) => ({ day, flow })),
    sleep: [...sleepByNight].sort().map(([night_of, hours]) => ({ night_of, hours: Math.round(hours * 4) / 4 })),
    weight: [...weight].sort().map(([day, kg]) => ({ day, kg })),
  };
}

// =====================================================================
// Endo tracker
// =====================================================================
const NOTICED = ['Pelvic pain', 'Lower back', 'Pain with sex', 'Painful poo', 'Painful wee', 'Bloating', 'Leg pain', 'Very tired', 'Sore breasts', 'Ovulation twinge', 'Feeling sick'];
const HELPED = ['Heat pack', 'Pain relief', 'Rest', 'Stretching', 'Warm bath'];
const IMPACT = [['barely', 'Barely'], ['slowed', 'Slowed me down'], ['had_to_stop', 'Had to stop']];
const PAIN_WORDS = ['None', 'Barely there', 'Mild', 'Mild', 'Annoying', 'Hard to ignore', 'Hard to ignore', 'Bad', 'Very bad', 'Awful', 'Worst ever'];
let endoDay = null;

route('endo', async (el, _a, alive) => {
  const s = subject(), t = today(), day = endoDay || t;
  el.innerHTML = frame({ heroH: 250, body: backBar('', 'today') + loadingHtml });
  const list = await rows('endo_logs', (q) => q.eq('member_id', s.id).eq('day', day));
  if (!alive()) return;
  const r = list[0] || {};
  const notes = [s.uterus_removed ? 'Uterus removed' : null, s.ovaries_removed ? 'ovaries removed' : s.uterus_removed ? 'ovaries kept' : null].filter(Boolean).join(' · ');
  el.innerHTML = frame({ heroH: 250, body: `${backBar('', 'today')}
    <div class="on-hero"><div class="eyebrow">${by(s)}${esc(s.display_name)}</div><div class="h1 mt4">Endo tracker</div>${notes ? `<p class="lead mt4">${esc(notes)}</p>` : ''}</div>
    <div class="card mt16"><div class="row between"><div class="h2">Pelvic pain ${day === t ? 'today' : `on ${fmtDay(day)}`}</div>
      <span class="sev ${r.pelvic_pain >= 7 ? 'hi' : r.pelvic_pain >= 4 ? 'mid' : 'lo'}">${r.pelvic_pain ?? '–'} · ${PAIN_WORDS[r.pelvic_pain ?? 0]}</span></div>
      <div class="scale scale11">${Array.from({ length: 11 }, (_, i) => `<button data-act="pain" data-n="${i}" style="background:${i ? sevColour(i) : '#64748B'}" class="${r.pelvic_pain === i ? 'on' : ''}">${i}</button>`).join('')}</div></div>
    <div class="section-label">What did you notice?</div>
    <div class="chips">${NOTICED.map((x) => `<button class="chip ${(r.noticed || []).includes(x) ? 'sel' : ''}" data-act="notice" data-x="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="section-label">How much did it affect ${day === t ? 'today' : 'that day'}?</div>
    <div class="seg">${IMPACT.map(([k, l]) => `<button data-act="impact" data-k="${k}" class="${r.impact === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="section-label">What helped?</div>
    <div class="chips">${HELPED.map((x) => `<button class="chip ${(r.helped || []).includes(x) ? 'sel' : ''}" data-act="help" data-x="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <label class="field"><span>Note (optional)</span><input class="input" id="note" value="${esc(r.note || '')}" placeholder="Anything else worth remembering"></label>
    <div class="row between mt12"><label class="chip" style="position:relative">${icon('cal')} ${day === t ? 'Log another day' : `Logging ${fmtDay(day)}`}<input type="date" id="eday" max="${t}" value="${day}" style="position:absolute;inset:0;opacity:0"></label>
      ${day !== t ? '<button class="linkbtn" data-act="backtoday">Back to today</button>' : ''}</div>
    <a class="card mt16" href="#/endo-patterns" style="display:block"><div class="row"><div class="icon-tile t-rose">${icon('chart')}</div><div class="grow"><div class="h2">Endo patterns</div><div class="muted small">Flares, estimated cycle and common symptoms</div></div>${icon('right')}</div></a>` });
  const save = async (fields) => {
    try {
      await upsert('endo_logs', { member_id: s.id, day, pelvic_pain: r.pelvic_pain ?? null, noticed: r.noticed || [], impact: r.impact || null, helped: r.helped || [], note: r.note || null, shared: r.shared ?? shareDefault(s, 'endo'), ...fields }, 'member_id,day');
      redo();
    } catch (e) { toast(e.message); }
  };
  const flip = (arr, x) => { const set = new Set(arr || []); set.has(x) ? set.delete(x) : set.add(x); return [...set]; };
  el.querySelector('#note').addEventListener('change', (e) => save({ note: e.target.value.trim() || null }));
  el.querySelector('#eday').addEventListener('change', (e) => { if (e.target.value) { endoDay = e.target.value; redo(); } });
  on(el, {
    pain: (b) => save({ pelvic_pain: +b.dataset.n }),
    notice: (b) => save({ noticed: flip(r.noticed, b.dataset.x) }),
    help: (b) => save({ helped: flip(r.helped, b.dataset.x) }),
    impact: (b) => save({ impact: b.dataset.k }),
    backtoday: () => { endoDay = null; redo(); },
  });
});

route('endo-patterns', async (el, _a, alive) => {
  const s = subject(), t = today();
  el.innerHTML = frame({ heroH: 230, body: backBar('', 'endo') + loadingHtml });
  const [list, per] = await Promise.all([
    rows('endo_logs', (q) => q.eq('member_id', s.id).gte('day', addDays(t, -180)).order('day')),
    rows('period_days', (q) => q.eq('member_id', s.id).gte('day', addDays(t, -400)).order('day')),
  ]);
  if (!alive()) return;
  const last90 = list.filter((r) => r.day > addDays(t, -90));
  const map = new Map(last90.map((r) => [r.day, r.pelvic_pain]));
  const days = Array.from({ length: 90 }, (_, i) => addDays(t, i - 89));
  const st = !s.uterus_removed ? cycleStats(per, t) : null;
  const est = st?.enough ? null : estimateFromPain(list, t);
  const counts = {};
  last90.forEach((r) => (r.noticed || []).forEach((n) => { counts[n] = (counts[n] || 0) + 1; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const months = [...new Set(days.map((d) => fmtDay(d, { month: 'short' })))];
  let headline, explain, phaseName = '–', next = '–';
  if (st?.enough) {
    headline = `Your cycle is about ${st.cycleLen} days`;
    explain = 'Worked out from your period tracker.';
    phaseName = phaseOn(st.dayOf, st.cycleLen, st.periodLen)?.name || '–';
    next = st.next ? fmtDay(st.next) : '–';
  } else if (est) {
    headline = `Pain flares about every ${est.cycleLen} days`;
    explain = s.uterus_removed && !s.ovaries_removed ? 'Your ovaries still run a cycle, so we estimate it from your pain pattern.' : 'Estimated from your pain pattern.';
    phaseName = phaseOn(est.dayOf, est.cycleLen, 5)?.name || '–';
    next = fmtDay(est.nextFlare);
  } else {
    headline = 'Still learning your pattern';
    explain = `Log pelvic pain most days. After about 6 weeks (${map.size} days so far) Wellnest can estimate your cycle.`;
  }
  el.innerHTML = frame({ heroH: 230, body: `${backBar('', 'endo')}
    <div class="on-hero"><div class="eyebrow">${esc(s.display_name)} · last 3 months</div><div class="h1 mt4">Endo patterns</div></div>
    <div class="card mt16"><div class="h2">${esc(headline)}</div><p class="lead mt4" style="font-size:13.5px">${esc(explain)}</p>
      <div class="row gap8 mt12">
        <div class="est">${st?.enough ? st.cycleLen : est ? `≈ ${est.cycleLen}` : '–'} days<small>Cycle</small></div>
        <div class="est">${esc(phaseName)}<small>Now (estimate)</small></div>
        <div class="est">${est || st?.enough ? '≈ ' : ''}${esc(next)}<small>${st?.enough ? 'Next period' : 'Next flare'}</small></div></div></div>
    <div class="section-label">Pelvic pain, day by day</div>
    <div class="card"><div class="row between muted small" style="font-weight:700">${months.map((m) => `<span>${m}</span>`).join('')}</div>
      <div class="heat">${days.map((d) => { const v = map.get(d); return `<i title="${fmtDay(d)}: ${v ?? 'not logged'}" style="background:${v == null ? 'var(--track)' : v === 0 ? '#64748B55' : sevColour(v)}"></i>`; }).join('')}</div>
      <div class="row between muted small mt8" style="font-weight:700"><span>Less</span><span>More</span></div></div>
    <div class="section-label">Most common · days out of 90</div>
    <div class="card">${top.length ? top.map(([k, v]) => `<div class="medrow"><div class="grow"><b>${esc(k)}</b><div class="progress mt4"><b style="width:${(v / 90) * 100}%"></b></div></div><span class="bold">${v}</span></div>`).join('') : '<div class="empty">Nothing yet</div>'}</div>
    <a class="btn mt16" href="#/report">${icon('file')} See it in the doctor report</a>` });
});

// =====================================================================
// Eye care (glaucoma)
// =====================================================================
const WAIT_MIN = 5;
let eyeTimer = null;

route('eyes', async (el, _a, alive) => {
  const s = subject(), t = today();
  clearInterval(eyeTimer);
  el.innerHTML = frame({ heroH: 250, heroAttr: 'data-eye-hero', body: backBar('', 'today') + loadingHtml });
  const [meds, doses, pressure] = await Promise.all([
    rows('medications', (q) => q.eq('member_id', s.id).eq('active', true).eq('form', 'eye_drop').order('created_at')),
    rows('medication_doses', (q) => q.eq('member_id', s.id).eq('day', t)),
    rows('eye_pressure', (q) => q.eq('member_id', s.id).order('measured_on')),
  ]);
  if (!alive()) return;
  const slots = meds.flatMap((m) => dueTimes(m, t).map((tm) => ({ m, tm, dose: doses.find((x) => x.medication_id === m.id && x.scheduled_time === tm) })))
    .sort((a, b) => a.tm.localeCompare(b.tm));
  const done = slots.filter((x) => x.dose).length;
  const nextSlot = slots.find((x) => !x.dose);
  const lastTaken = doses.filter((x) => meds.some((m) => m.id === x.medication_id)).map((x) => new Date(x.taken_at)).sort((a, b) => b - a)[0];
  const eyes = (eye) => `<div class="eyes"><i class="${eye === 'left' || eye === 'both' ? 'on' : ''}">L</i><i class="${eye === 'right' || eye === 'both' ? 'on' : ''}">R</i></div>`;
  const latest = pressure[pressure.length - 1];
  const target = latest?.target_mmhg;
  // pressure chart: both eyes
  const W = 320, H = 130, P = 26;
  const vals = pressure.flatMap((x) => [x.left_mmhg, x.right_mmhg]).filter((v) => v != null).map(Number);
  const lo = Math.min(10, ...vals) - 2, hi = Math.max(24, ...vals, target || 0) + 2;
  const px = (i) => P + (pressure.length === 1 ? (W - 2 * P) / 2 : (i / (pressure.length - 1)) * (W - 2 * P));
  const py = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (H - 32);
  const poly = (k, c) => { const pts = pressure.map((x, i) => (x[k] != null ? `${px(i)},${py(+x[k])}` : null)).filter(Boolean); return pts.length ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>${pts.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3.5" fill="${c}"/>`).join('')}` : ''; };
  const chart = pressure.length ? `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}">
      ${target ? `<line x1="${P}" x2="${W - P}" y1="${py(target)}" y2="${py(target)}" stroke="#F43F5E" stroke-dasharray="4 4"/><text class="axis" x="${W - P}" y="${py(target) - 4}" text-anchor="end">target ${target}</text>` : ''}
      ${poly('left_mmhg', '#38BDF8')}${poly('right_mmhg', '#A78BFA')}
      ${pressure.map((x, i) => (pressure.length <= 6 || i % Math.ceil(pressure.length / 6) === 0 ? `<text class="axis" x="${px(i)}" y="${H - 6}" text-anchor="middle">${fmtDay(x.measured_on, { month: 'short' })}</text>` : '')).join('')}</svg></div>
      <div class="legend"><span><i class="legend-dot" style="background:#38BDF8"></i>Left</span><span><i class="legend-dot" style="background:#A78BFA"></i>Right</span></div>` : '';
  el.innerHTML = frame({ heroH: 250, heroAttr: 'data-eye-hero', body: `${backBar('', 'today')}
    <div class="on-hero"><div class="eyebrow">${by(s)}${esc(s.display_name)} · glaucoma</div><div class="h1 mt4">Eye care</div></div>
    <div class="card mt16"><div class="row between"><div><div class="h2">${slots.length ? `${done} of ${slots.length} drops today` : 'No eye drops set up'}</div>
      ${nextSlot ? `<div class="muted small">Next: ${fmtClock(nextSlot.tm)}</div>` : slots.length ? '<div class="muted small" style="color:var(--better)">All done for today</div>' : ''}</div>
      <a class="linkbtn" href="#/meds">${slots.length ? 'Edit' : 'Add drops'}</a></div>
      ${slots.map((x) => `<div class="drop">${eyes(x.m.eye)}<div class="grow"><b>${esc(x.m.name)}</b><span>${x.m.eye === 'both' ? 'Both eyes' : x.m.eye === 'left' ? 'Left eye' : x.m.eye === 'right' ? 'Right eye' : ''} · ${fmtClock(x.tm)}</span></div>
        <button class="takebtn ${x.dose ? 'on' : ''}" data-act="drop" data-id="${x.m.id}" data-tm="${x.tm}">${x.dose ? `${icon('check')} ${fmtTime(x.dose.taken_at)}` : 'Not yet'}</button></div>`).join('')}
      <div id="wait"></div></div>
    <div class="section-label">Eye pressure</div>
    <div class="card"><div class="row between"><div class="h2">Eye pressure</div><button class="chip" data-act="addp">${icon('plus')} Add reading</button></div>
      ${chart || '<div class="empty">Add the readings from your eye doctor to see the trend.</div>'}
      ${latest ? `<div class="muted small mt8" style="font-weight:700">Latest ${fmtDay(latest.measured_on, { day: 'numeric', month: 'short', year: 'numeric' })}: L ${latest.left_mmhg ?? '–'} · R ${latest.right_mmhg ?? '–'}${target ? ` · target ${target}` : ''}</div>` : ''}
      ${pressure.length ? `<button class="linkbtn mt8" data-act="plist">See all readings</button>` : ''}</div>
    <div class="warn mt16">${icon('zap')}<div>Sudden eye pain, halos round lights, blurred vision, or headache with vomiting? <b>Get help now.</b> Call 000 or go to Emergency.</div></div>` });
  const waitBox = el.querySelector('#wait');
  const tick = () => {
    if (!location.hash.startsWith('#/eyes')) return clearInterval(eyeTimer);
    if (!lastTaken || !nextSlot) { waitBox.innerHTML = ''; return; }
    const left = WAIT_MIN * 60000 - (Date.now() - lastTaken);
    if (left <= 0) { waitBox.innerHTML = ''; clearInterval(eyeTimer); return; }
    const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
    const f = 1 - left / (WAIT_MIN * 60000);
    waitBox.innerHTML = `<div class="waitbar mt12"><svg class="wring" viewBox="0 0 40 40" style="transform:rotate(-90deg)"><circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="4"/>
      <circle cx="20" cy="20" r="16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="${100.5 * f} 100.5"/></svg>
      <div><b>Wait ${m}:${String(sec).padStart(2, '0')} before the next drop</b><span>So the first one can soak in</span></div></div>`;
  };
  tick(); eyeTimer = setInterval(tick, 1000);
  on(el, {
    drop: async (b) => {
      const slot = slots.find((x) => x.m.id === b.dataset.id && x.tm === b.dataset.tm);
      try {
        if (slot.dose) await remove('medication_doses', slot.dose.id);
        else await insert('medication_doses', { medication_id: slot.m.id, member_id: s.id, day: t, scheduled_time: slot.tm, shared: slot.m.shared });
        redo();
      } catch (e) { toast(e.message); }
    },
    addp: () => pressureSheet(s, target),
    plist: () => {
      const sh = sheet(`<div class="sheet-head"><div class="h2">All readings</div><button class="xbtn" data-close>${icon('x')}</button></div>
        ${pressure.slice().reverse().map((x) => `<div class="medrow"><div class="grow"><b>${fmtDay(x.measured_on, { day: 'numeric', month: 'short', year: 'numeric' })}</b><span>Left ${x.left_mmhg ?? '–'} · Right ${x.right_mmhg ?? '–'}${x.target_mmhg ? ` · target ${x.target_mmhg}` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</span></div>
          <button class="xbtn" data-del="${x.id}" aria-label="Delete">${icon('trash')}</button></div>`).join('')}`);
      sh.el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-del]'); if (!b) return;
        try { await remove('eye_pressure', b.dataset.del); sh.close(); redo(); } catch (er) { toast(er.message); }
      });
    },
  });
});

function pressureSheet(s, target) {
  const sh = sheet(`<div class="sheet-head"><div class="h2">Add an eye pressure reading</div><button class="xbtn" data-close>${icon('x')}</button></div>
    <label class="field"><span>Date</span><input class="input" type="date" id="d" value="${today()}" max="${today()}"></label>
    <div class="row gap8"><label class="field grow"><span>Left (mmHg)</span><input class="input" id="l" type="number" inputmode="decimal" step="0.5"></label>
      <label class="field grow"><span>Right (mmHg)</span><input class="input" id="r" type="number" inputmode="decimal" step="0.5"></label></div>
    <label class="field"><span>Target from your eye doctor (optional)</span><input class="input" id="tg" type="number" inputmode="decimal" step="0.5" value="${target ?? ''}"></label>
    <label class="field"><span>Note (optional)</span><input class="input" id="n"></label>
    <button class="btn mt20" id="save">Save reading</button>`);
  const $ = (q) => sh.el.querySelector(q);
  $('#save').addEventListener('click', async () => {
    const num = (v) => (v === '' ? null : +v);
    if ($('#l').value === '' && $('#r').value === '') return toast('Type at least one reading');
    try {
      await insert('eye_pressure', { member_id: s.id, measured_on: $('#d').value, left_mmhg: num($('#l').value), right_mmhg: num($('#r').value), target_mmhg: num($('#tg').value), note: $('#n').value.trim() || null, shared: shareDefault(s, 'eyes') });
      sh.close(); toast('Reading saved'); redo();
    } catch (e) { toast(e.message); }
  });
}
