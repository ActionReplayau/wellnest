// Settings, my trackers, privacy, medicines, family setup
import { route, frame, backBar, go, applyLook, switchPerson } from '../app.js';
import { esc, icon, avatar, toast, on, sheet, confirmBox, COLOURS, today, ageOn, fmtClock, fmtDay } from '../util.js';
import { state, member, amParent, ageOf, isAdultPrivate, rows, insert, update, updateMember, addPerson, setPin, removeMember, saveDevice, device } from '../store.js';

const redo = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const toggle = (onv, act, extra = '') => `<button class="toggle ${onv ? 'on' : ''}" data-act="${act}" ${extra} aria-pressed="${onv}"></button>`;

// =====================================================================
// Settings
// =====================================================================
route('settings', (el) => {
  const me = state.me;
  const a = ageOf(me);
  el.innerHTML = frame({ heroH: 260, body: `${backBar('', 'today')}
    <div class="on-hero"><div class="row">${avatar(me, 64)}<div class="grow"><div class="h1">${esc(me.display_name)}</div>
      <div class="lead">${me.role === 'parent' ? 'Parent' : 'Child'}${a != null ? ` · ${a}` : ''}${me.height_cm ? ` · ${me.height_cm} cm` : ''}</div></div>
      <a class="chip glass-chip" href="#/profile">${icon('edit')} Edit</a></div></div>

    <div class="section-label" style="margin-top:90px">Look</div>
    <div class="card"><div class="row gap8">${[['glow', 'Glow', '#0B0A1A', '#7C3AED'], ['daylight', 'Daylight', '#F4F2FB', '#8B5CF6'], ['auto', 'Automatic', 'linear-gradient(90deg,#0B0A1A 50%,#F4F2FB 50%)', '#C026D3']].map(([k, l, bg, c]) =>
      `<button class="look ${me.look === k ? 'on' : ''}" data-act="look" data-k="${k}"><div class="mini" style="background:${bg}"><i style="background:${c};width:60%"></i><i style="background:${c};opacity:.45"></i></div>${l}</button>`).join('')}</div>
      <p class="muted small mt8">Automatic follows your phone's light or dark setting.</p></div>

    <div class="section-label">Me</div>
    <div class="card">
      <button class="list-row" data-act="pin"><div class="icon-tile t-violet">${icon('lock')}</div><div class="grow"><b>Change my PIN</b></div><span class="chev">${icon('right')}</span></button>
      <a class="list-row" href="#/trackers"><div class="icon-tile t-pink">${icon('spark')}</div><div class="grow"><b>My trackers</b><span>Weight, steps, period, endo, eyes</span></div><span class="chev">${icon('right')}</span></a>
      <a class="list-row" href="#/meds"><div class="icon-tile t-indigo">${icon('pill')}</div><div class="grow"><b>My medications</b><span>Add, change or stop</span></div><span class="chev">${icon('right')}</span></a>
      ${isAdultPrivate(me) ? `<a class="list-row" href="#/privacy"><div class="icon-tile t-green">${icon('shield')}</div><div class="grow"><b>Privacy</b><span>What your family can see</span></div><span class="chev">${icon('right')}</span></a>` : ''}
      <a class="list-row" href="#/import"><div class="icon-tile t-teal">${icon('upload')}</div><div class="grow"><b>Import from iPhone Health</b><span>Periods, sleep, weight and steps</span></div><span class="chev">${icon('right')}</span></a>
      <button class="list-row" data-act="reminder"><div class="icon-tile t-amber">${icon('bell')}</div><div class="grow"><b>Daily reminder</b><span>${me.reminder_on && me.reminder_time ? `On · ${fmtClock(me.reminder_time)}` : 'Off'}</span></div><span class="chev">${icon('right')}</span></button>
    </div>

    ${amParent() ? `<div class="section-label">Parents only</div>
    <div class="card">
      <a class="list-row" href="#/manage"><div class="icon-tile t-rose">${icon('users')}</div><div class="grow"><b>Manage family</b><span>Add, edit or remove people</span></div><span class="chev">${icon('right')}</span></a>
      <a class="list-row" href="#/manage"><div class="icon-tile t-amber">${icon('lock')}</div><div class="grow"><b>Reset someone's PIN</b><span>For when they forget it</span></div><span class="chev">${icon('right')}</span></a>
    </div>` : ''}

    <button class="btn ghost mt24" data-act="switch">${icon('logout')} Switch person</button>
    <p class="muted small center mt16">Wellnest · ${esc(state.family?.name || '')}</p>` });
  on(el, {
    look: async (b) => { try { await updateMember(me.id, { look: b.dataset.k }); applyLook(); saveDevice({ ...(device() || {}), look: b.dataset.k }); redo(); } catch (e) { toast(e.message); } },
    pin: () => pinSheet(me),
    reminder: () => reminderSheet(),
    switch: () => switchPerson(),
  });
});

// change a PIN (mine, or a parent resetting someone's)
export function pinSheet(m) {
  const mine = m.id === state.me.id;
  const sh = sheet(`<div class="sheet-head"><div class="h2">${mine ? 'Change my PIN' : `New PIN for ${esc(m.display_name)}`}</div><button class="xbtn" data-close>${icon('x')}</button></div>
    <label class="field"><span>New 6-digit PIN</span><input class="input" id="p1" inputmode="numeric" maxlength="6" type="password" autocomplete="new-password"></label>
    <label class="field"><span>Type it again</span><input class="input" id="p2" inputmode="numeric" maxlength="6" type="password" autocomplete="new-password"></label>
    <div class="err mt12" id="err"></div><button class="btn mt8" id="save">Save PIN</button>`);
  const $ = (q) => sh.el.querySelector(q);
  $('#save').addEventListener('click', async () => {
    const p1 = $('#p1').value, p2 = $('#p2').value;
    if (!/^\d{6}$/.test(p1)) { $('#err').textContent = 'The PIN must be exactly 6 numbers.'; return; }
    if (p1 !== p2) { $('#err').textContent = 'The two PINs don\'t match.'; return; }
    $('#save').disabled = true;
    try { await setPin(m.id, p1); sh.close(); toast(mine ? 'PIN changed' : `${m.display_name}'s PIN changed`); } catch (e) { $('#err').textContent = e.message; $('#save').disabled = false; }
  });
}

// daily reminder: saved to the profile, and added to the phone's calendar as a daily alert
function reminderSheet() {
  const me = state.me;
  const sh = sheet(`<div class="sheet-head"><div class="h2">Daily reminder</div><button class="xbtn" data-close>${icon('x')}</button></div>
    <p class="lead mt4">Pick a time. Wellnest adds a repeating reminder to your phone's calendar, so it works even when the app is closed.</p>
    <label class="field"><span>Time</span><input class="input" type="time" id="tm" value="${(me.reminder_time || '20:00').slice(0, 5)}"></label>
    <button class="btn mt20" id="add">${icon('cal')} Add to my calendar</button>
    ${me.reminder_on ? `<button class="btn ghost mt12" id="off">Turn off</button>` : ''}
    <p class="muted small mt12">To remove it later, delete "Wellnest check-in" from your calendar.</p>`);
  const $ = (q) => sh.el.querySelector(q);
  $('#add').addEventListener('click', async () => {
    const tm = $('#tm').value || '20:00';
    try { await updateMember(me.id, { reminder_on: true, reminder_time: tm }); } catch (e) { toast(e.message); return; }
    const [h, m] = tm.split(':');
    const d = today().replace(/-/g, '');
    const url = `${location.origin}${location.pathname}`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wellnest//EN', 'BEGIN:VEVENT', `UID:wellnest-${me.id}@wellnest`,
      `DTSTAMP:${d}T000000`, `DTSTART:${d}T${h}${m}00`, `DURATION:PT5M`, 'RRULE:FREQ=DAILY', 'SUMMARY:Wellnest check-in',
      `DESCRIPTION:Time for your daily check-in. ${url}`, `URL:${url}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Wellnest check-in', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wellnest-reminder.ics'; document.body.appendChild(a); a.click(); a.remove();
    sh.close(); toast(`Reminder set for ${fmtClock(tm + ':00')}. Tap "Add" in your calendar.`); redo();
  });
  $('#off')?.addEventListener('click', async () => {
    try { await updateMember(me.id, { reminder_on: false }); sh.close(); toast('Reminder off. Delete it from your calendar too.'); redo(); } catch (e) { toast(e.message); }
  });
}

// =====================================================================
// Profile
// =====================================================================
route('profile', (el) => personForm(el, state.me, 'settings'));
route('person', (el, id) => { const m = member(id); if (!m) return go('manage'); personForm(el, m, 'manage'); });

function personForm(el, m, back) {
  let colour = m.colour || 'violet';
  const parent = amParent();
  el.innerHTML = frame({ heroH: 200, body: `${backBar(m.id === state.me.id ? 'My details' : esc(m.display_name), back)}
    <form class="card" style="margin-top:56px" id="f">
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(m.display_name)}" required></label>
      <label class="field"><span>Birthday${parent ? '' : ' (a parent can change this)'}</span><input class="input" type="date" name="birthday" value="${m.birthday}" max="${today()}" ${parent ? '' : 'disabled'}></label>
      <label class="field"><span>Height (optional)</span><div class="inline-input"><input class="input" name="height" type="number" inputmode="decimal" step="0.5" value="${m.height_cm ?? ''}"><span class="unit">cm</span></div></label>
      ${parent && m.id !== state.me.id ? `<div class="field"><span>Role</span><div class="seg"><button type="button" data-act="role" data-r="parent" class="${m.role === 'parent' ? 'on' : ''}">Parent</button><button type="button" data-act="role" data-r="child" class="${m.role === 'child' ? 'on' : ''}">Child</button></div></div>` : ''}
      <div class="field"><span>Colour</span><div class="colours" id="cols">${COLOURS.map((c) => `<div data-c="${c}" class="av c-${c} ${c === colour ? 'sel' : ''}" style="--s:40px">${esc(m.display_name.charAt(0))}</div>`).join('')}</div></div>
      <div class="err mt12" id="err"></div>
      <button class="btn mt8" type="submit">Save</button>
    </form>
    ${parent && m.id !== state.me.id ? `<button class="btn ghost mt12" data-act="invite">${icon('share')} Send Wellnest to ${esc(m.display_name)}</button>
      <button class="btn ghost mt12" data-act="pin">${icon('lock')} Reset ${esc(m.display_name)}'s PIN</button>
      <button class="btn ghost mt12" data-act="del" style="color:#FB7185">${icon('trash')} Remove from family</button>` : ''}` });
  let role = m.role;
  el.querySelector('#cols').addEventListener('click', (e) => {
    const a = e.target.closest('[data-c]'); if (!a) return; colour = a.dataset.c;
    el.querySelectorAll('#cols .av').forEach((x) => x.classList.toggle('sel', x === a));
  });
  el.querySelector('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const fields = { display_name: f.get('name').trim(), height_cm: f.get('height') ? +f.get('height') : null, colour };
    if (parent) { if (f.get('birthday')) fields.birthday = f.get('birthday'); fields.role = role; }
    try { await updateMember(m.id, fields); toast('Saved'); go(back); } catch (ex) { el.querySelector('#err').textContent = ex.message; }
  });
  on(el, {
    role: (b) => { role = b.dataset.r; el.querySelectorAll('[data-act=role]').forEach((x) => x.classList.toggle('on', x === b)); },
    pin: () => pinSheet(m),
    invite: () => inviteSheet(m),
    del: async () => {
      if (!(await confirmBox(`Remove ${m.display_name}?`, `This deletes ${m.display_name}'s profile and every entry they've logged. It can't be undone.`, 'Remove and delete', true))) return;
      try { await removeMember(m.id); toast(`${m.display_name} removed`); go('manage'); } catch (ex) { toast(ex.message); }
    },
  });
}

// =====================================================================
// Manage family (parents)
// =====================================================================
route('manage', (el) => {
  if (!amParent()) return go('settings');
  el.innerHTML = frame({ heroH: 200, body: `${backBar('Manage family', 'settings')}
    <div class="card" style="margin-top:56px">${state.members.map((m) => `<a class="list-row" href="#/person/${m.id}">${avatar(m, 42)}<div class="grow"><b>${esc(m.display_name)}</b>
      <span>${m.role === 'parent' ? 'Parent' : 'Child'}${ageOf(m) != null ? ` · ${ageOf(m)}` : ''}${isAdultPrivate(m) && m.role === 'child' ? ' · private (16+)' : ''}</span></div><span class="chev">${icon('right')}</span></a>`).join('')}</div>
    <a class="btn mt16" href="#/add-person">${icon('plus')} Add a family member</a>` });
});

// =====================================================================
// Add a person (parents): step 1 details, step 2 PIN
// =====================================================================
route('add-person', (el) => {
  if (!amParent()) return go('settings');
  const used = new Set(state.members.map((m) => m.colour));
  let colour = COLOURS.find((c) => !used.has(c)) || 'violet';
  let role = 'child';
  el.innerHTML = frame({ heroH: 220, body: `${backBar('', 'family')}
    <div class="on-hero"><div class="eyebrow">Family · Step 1 of 2</div><div class="h1 mt4">Add a person</div></div>
    <form class="card" style="margin-top:30px" id="f">
      <label class="field"><span>Name</span><input class="input" name="name" required autocomplete="off"></label>
      <label class="field"><span>Birthday</span><input class="input" type="date" name="birthday" required max="${today()}"></label>
      <div id="agenote"></div>
      <label class="field"><span>Height (optional)</span><div class="inline-input"><input class="input" name="height" type="number" inputmode="decimal" step="0.5"><span class="unit">cm</span></div></label>
      <div class="field"><span>Role</span><div class="seg"><button type="button" data-act="role" data-r="parent">Parent</button><button type="button" data-act="role" data-r="child" class="on">Child</button></div></div>
      <div class="field"><span>Colour</span><div class="colours" id="cols">${COLOURS.map((c) => `<div data-c="${c}" class="av c-${c} ${c === colour ? 'sel' : ''}" style="--s:40px"></div>`).join('')}</div></div>
      <div class="err mt12" id="err"></div>
      <button class="btn mt8" type="submit">Next: set their PIN</button>
    </form>` });
  const note = () => {
    const f = el.querySelector('#f'); const b = f.birthday.value; const n = f.name.value.trim() || 'They';
    const a = ageOn(b);
    el.querySelector('#agenote').innerHTML = b ? `<div class="pill-note mt8">${a < 16 ? `${esc(n)} is ${a}, so <b>parents can see</b> their entries. That changes on their 16th birthday.` : `${esc(n)} is ${a}, so their entries are <b>private</b> unless they tap Share.`}</div>` : '';
  };
  el.querySelector('#f').birthday.addEventListener('change', note);
  el.querySelector('#f').name.addEventListener('input', note);
  el.querySelector('#cols').addEventListener('click', (e) => {
    const a = e.target.closest('[data-c]'); if (!a) return; colour = a.dataset.c;
    el.querySelectorAll('#cols .av').forEach((x) => x.classList.toggle('sel', x === a));
  });
  on(el, { role: (b) => { role = b.dataset.r; el.querySelectorAll('[data-act=role]').forEach((x) => x.classList.toggle('on', x === b)); } });
  el.querySelector('#f').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get('name').trim();
    if (state.members.some((m) => m.display_name.toLowerCase() === name.toLowerCase())) { el.querySelector('#err').textContent = 'Someone in the family already has that name. Try adding an initial.'; return; }
    const person = { name, birthday: f.get('birthday'), height_cm: f.get('height') ? +f.get('height') : null, role, colour };
    const sh = sheet(`<div class="eyebrow muted">Step 2 of 2</div><div class="sheet-head"><div class="h2">Set ${esc(name)}'s PIN</div><button class="xbtn" data-close>${icon('x')}</button></div>
      <p class="lead mt4">6 numbers ${esc(name)} will remember. They can change it later.</p>
      <label class="field"><span>PIN</span><input class="input" id="p1" inputmode="numeric" maxlength="6" type="password" autocomplete="new-password"></label>
      <label class="field"><span>Type it again</span><input class="input" id="p2" inputmode="numeric" maxlength="6" type="password" autocomplete="new-password"></label>
      <div class="err mt12" id="err2"></div><button class="btn mt8" id="go">Add ${esc(name)}</button>`);
    const $ = (q) => sh.el.querySelector(q);
    $('#go').addEventListener('click', async () => {
      const p1 = $('#p1').value;
      if (!/^\d{6}$/.test(p1)) { $('#err2').textContent = 'The PIN must be exactly 6 numbers.'; return; }
      if (p1 !== $('#p2').value) { $('#err2').textContent = 'The two PINs don\'t match.'; return; }
      $('#go').disabled = true; $('#go').textContent = 'Adding…';
      try { const id = await addPerson({ ...person, pin: p1 }); sh.close(); toast(`${name} added 🎉`); go('manage'); setTimeout(() => inviteSheet(member(id), true), 300); } catch (ex) { $('#err2').textContent = ex.message; $('#go').disabled = false; $('#go').textContent = `Add ${name}`; }
    });
  });
});

// =====================================================================
// My trackers
// =====================================================================
route('trackers', (el) => {
  const me = state.me;
  const t = (k, tile, ic, name, sub) => `<div class="trk"><div class="icon-tile ${tile}">${icon(ic)}</div><div class="grow"><b>${name}</b><span>${sub}</span></div>${toggle(me[k], 'flip', `data-k="${k}"`)}</div>`;
  el.innerHTML = frame({ heroH: 230, body: `${backBar('', 'settings')}
    <div class="on-hero"><div class="eyebrow">${esc(me.display_name)} · settings</div><div class="h1 mt4">My trackers</div><p class="lead mt4">Turn on what's useful.${isAdultPrivate(me) ? ' Private unless you share.' : ''}</p></div>
    <div class="card mt16"><div class="trk"><div class="icon-tile t-violet">${icon('check')}</div><div class="grow"><b>Symptoms, meds, sleep</b><span>Everyone has these</span></div><span class="chip">Always on</span></div>
      <div class="section-label" style="margin:14px 0 2px">Extras</div>
      ${t('weight_on', 't-teal', 'scale', 'Weight', 'Weekly, with height and age')}
      ${t('steps_on', 't-green', 'steps', 'Steps', 'Daily step goal, from Apple Watch or typed in')}
      ${t('period_on', 't-pink', 'flower', 'Period tracker', 'Flow, predictions, cycle phases')}
      ${t('eyes_on', 't-indigo', 'eye', 'Glaucoma & eye drops', 'Drops per eye, pressure, warnings')}
      ${t('endo_on', 't-rose', 'pulse', 'Endo tracker', 'Pelvic pain, flares and patterns')}
      ${me.period_on || me.endo_on ? `<div class="sub mt8"><div class="bold" style="font-size:14px">Anything we should know?</div>
        <div class="chips mt8"><button class="chip ${!me.uterus_removed && !me.ovaries_removed ? 'sel' : ''}" data-act="body" data-v="normal">Periods as normal</button>
        <button class="chip ${me.uterus_removed ? 'sel' : ''}" data-act="body" data-v="uterus">Uterus removed</button>
        <button class="chip ${me.ovaries_removed ? 'sel' : ''}" data-act="body" data-v="ovaries">Ovaries removed</button></div>
        ${me.uterus_removed ? '<p class="muted small mt8">We\'ll hide period flow and estimate your cycle from symptoms instead.</p>' : ''}</div>` : ''}
    </div>
    ${me.eyes_on ? '<a class="btn ghost mt16" href="#/meds">Add your eye drops in My medications</a>' : ''}` });
  on(el, {
    flip: async (b) => { const k = b.dataset.k; try { await updateMember(me.id, { [k]: !me[k] }); redo(); } catch (e) { toast(k === 'steps_on' && /steps|column|schema/i.test(e.message) ? 'Steps needs the database update first (wellnest-update-4)' : e.message); } },
    body: async (b) => {
      const v = b.dataset.v;
      const fields = v === 'normal' ? { uterus_removed: false, ovaries_removed: false } : v === 'uterus' ? { uterus_removed: !me.uterus_removed } : { ovaries_removed: !me.ovaries_removed };
      try { await updateMember(me.id, fields); redo(); } catch (e) { toast(e.message); }
    },
  });
});

// =====================================================================
// Privacy (16+)
// =====================================================================
const AREAS = [['symptoms', 'Symptoms'], ['meds', 'Medications'], ['sleep', 'Sleep'], ['weight', 'Weight'], ['steps', 'Steps'], ['period', 'Period'], ['endo', 'Endo tracker'], ['eyes', 'Eye care']];
const TABLES = { symptoms: ['symptoms', 'symptom_checks'], meds: ['medications', 'medication_doses'], sleep: ['sleep_logs'], weight: ['weight_logs'], steps: ['step_logs'], period: ['period_days'], endo: ['endo_logs'], eyes: ['eye_pressure'] };
route('privacy', (el) => {
  const me = state.me;
  el.innerHTML = frame({ heroH: 250, body: `${backBar('', 'settings')}
    <div class="on-hero"><div class="row">${avatar(me, 56)}<div><div class="h1">${esc(me.display_name)}</div><div class="lead">${ageOf(me)}${me.height_cm ? ` · ${me.height_cm} cm` : ''}</div></div></div></div>
    <div class="card mt24"><div class="row"><div class="icon-tile t-green">${icon('shield')}</div><div class="grow"><div class="h2">Your entries are private</div>
      <div class="muted small mt4" style="font-size:13px">You're 16 or over, so ${me.role === 'parent' ? 'the rest of the family' : 'Mum and Dad'} only see what you choose to share.</div></div></div></div>
    <div class="section-label">Share with family</div>
    <div class="card">${AREAS.map(([k, l]) => `<div class="trk"><div class="grow"><b>${l}</b><span>${me[`share_${k}`] ? 'Shared' : 'Only you'}</span></div>${toggle(me[`share_${k}`], 'share', `data-k="${k}"`)}</div>`).join('')}</div>
    <p class="muted small mt12" style="line-height:1.5">This is the starting setting for new entries. You can still switch Share on or off for any single entry. Turning one on here also shares your entries from the last 30 days; turning it off makes them all private.</p>` });
  on(el, {
    share: async (b) => {
      const k = b.dataset.k, v = !me[`share_${k}`];
      b.classList.toggle('on', v);
      try {
        await updateMember(me.id, { [`share_${k}`]: v });
        const { sb } = await import('../store.js');
        for (const table of TABLES[k]) {
          let q = sb.from(table).update({ shared: v }).eq('member_id', me.id);
          if (v) {
            const col = { symptoms: 'started_on', medications: 'created_at', sleep_logs: 'night_of', eye_pressure: 'measured_on' }[table] || 'day';
            const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
            if (table !== 'medications') q = q.gte(col, since);
          }
          const { error } = await q; if (error) throw error;
        }
        toast(v ? 'Shared with family' : 'Now only you can see these'); redo();
      } catch (e) { toast(e.message); redo(); }
    },
  });
});

// =====================================================================
// My medications
// =====================================================================
const FORMS = [['tablet', 'Tablet'], ['capsule', 'Capsule'], ['eye_drop', 'Eye drop'], ['inhaler', 'Inhaler'], ['other', 'Other']];
const SCHED = [['daily', 'Every day'], ['some_days', 'Some days'], ['as_needed', 'Only when needed']];
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
route('meds', async (el, _a, alive) => {
  const s = (await import('../store.js')).subject();
  const list = await rows('medications', (q) => q.eq('member_id', s.id).order('created_at'));
  if (!alive()) return;
  const active = list.filter((m) => m.active), stopped = list.filter((m) => !m.active);
  const line = (m) => `<button class="list-row" data-act="edit" data-id="${m.id}"><div class="icon-tile ${m.form === 'eye_drop' ? 't-teal' : 't-violet'}">${icon(m.form === 'eye_drop' ? 'eye' : 'pill')}</div>
    <div class="grow"><b>${esc(m.name)}</b><span>${esc([m.dose, m.form === 'eye_drop' && m.eye ? `${m.eye === 'both' ? 'both eyes' : `${m.eye} eye`}` : null,
      m.schedule === 'as_needed' ? 'when needed' : m.schedule === 'some_days' ? (m.week_days || []).map((d) => WD[d]).join(' ') : 'every day',
      m.schedule !== 'as_needed' ? (m.times || []).map((x) => fmtClock(x)).join(' & ') : null].filter(Boolean).join(' · '))}</span></div><span class="chev">${icon('edit')}</span></button>`;
  el.innerHTML = frame({ heroH: 200, body: `${backBar('', 'today')}
    <div class="on-hero"><div class="eyebrow">${s.id === state.me.id ? '' : `For ${esc(s.display_name)}`}</div><div class="row between"><div class="h1">My medications</div>
      <button class="chip glass-chip" data-act="add">${icon('plus')} Add</button></div></div>
    <div class="card mt24">${active.length ? active.map(line).join('') : '<div class="empty">No regular medicines yet. Tap <b>Add</b>.</div>'}</div>
    ${stopped.length ? `<div class="section-label">Stopped</div><div class="card" style="opacity:.7">${stopped.map(line).join('')}</div>` : ''}` });
  on(el, {
    add: () => medSheet(s, null),
    edit: (b) => medSheet(s, list.find((m) => m.id === b.dataset.id)),
  });
});

function medSheet(s, m) {
  const st = {
    name: m?.name || '', dose: m?.dose || '', form: m?.form || 'tablet', eye: m?.eye || 'both', schedule: m?.schedule || 'daily',
    week_days: m?.week_days || [1, 2, 3, 4, 5], times: (m?.times || ['08:00:00']).map((x) => x.slice(0, 5)),
    shared: m ? m.shared : !isAdultPrivate(s) || s.share_meds,
  };
  const sh = sheet('<div id="mf"></div>');
  const box = sh.el.querySelector('#mf');
  const paint = () => {
    box.innerHTML = `<div class="sheet-head"><div class="h2">${m ? 'Edit medicine' : 'Add a medicine'}</div><button class="xbtn" data-x>${icon('x')}</button></div>
      <label class="field"><span>Name</span><input class="input" id="nm" value="${esc(st.name)}" placeholder="e.g. Vitamin D"></label>
      <label class="field"><span>Dose</span><input class="input" id="ds" value="${esc(st.dose)}" placeholder="e.g. 1 tablet, 1 drop"></label>
      <div class="field"><span>Type</span><div class="chips">${FORMS.map(([k, l]) => `<button class="chip ${st.form === k ? 'sel' : ''}" data-f="${k}">${l}</button>`).join('')}</div></div>
      ${st.form === 'eye_drop' ? `<div class="field"><span>Which eye?</span><div class="seg">${[['left', 'Left'], ['right', 'Right'], ['both', 'Both']].map(([k, l]) => `<button data-e="${k}" class="${st.eye === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
      <div class="field"><span>When</span><div class="chips">${SCHED.map(([k, l]) => `<button class="chip ${st.schedule === k ? 'sel' : ''}" data-s="${k}">${l}</button>`).join('')}</div></div>
      ${st.schedule === 'some_days' ? `<div class="chips mt8">${WD.map((d, i) => `<button class="chip ${st.week_days.includes(i) ? 'sel' : ''}" data-w="${i}" style="width:38px;justify-content:center">${d}</button>`).join('')}</div>` : ''}
      ${st.schedule !== 'as_needed' ? `<div class="field"><span>Times</span><div class="chips">${st.times.map((tm, i) => `<span class="chip"><input type="time" value="${tm}" data-t="${i}" style="background:none;border:0;font-weight:700;width:96px">${st.times.length > 1 ? `<button data-rm="${i}" aria-label="Remove time">${icon('x')}</button>` : ''}</span>`).join('')}
        <button class="chip" data-addt>${icon('plus')} Add time</button></div></div>` : ''}
      ${isAdultPrivate(s) ? `<div class="row between mt16"><div><b>Share with family</b><div class="muted small">Otherwise only you can see it</div></div><button class="toggle ${st.shared ? 'on' : ''}" data-sh></button></div>` : ''}
      <div class="err mt12" id="err"></div>
      <button class="btn mt8" data-save>Save</button>
      ${m ? `<button class="btn ghost mt12" data-stop>${m.active ? 'Stop taking this' : 'Start taking it again'}</button>` : ''}`;
  };
  paint();
  const grab = () => { st.name = box.querySelector('#nm').value; st.dose = box.querySelector('#ds').value; box.querySelectorAll('[data-t]').forEach((x) => { st.times[+x.dataset.t] = x.value; }); };
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    grab();
    if (b.dataset.x !== undefined) return sh.close();
    if (b.dataset.f) { st.form = b.dataset.f; if (st.form === 'eye_drop' && !st.dose) st.dose = '1 drop'; return paint(); }
    if (b.dataset.e) { st.eye = b.dataset.e; return paint(); }
    if (b.dataset.s) { st.schedule = b.dataset.s; return paint(); }
    if (b.dataset.w) { const w = +b.dataset.w; st.week_days = st.week_days.includes(w) ? st.week_days.filter((x) => x !== w) : [...st.week_days, w].sort(); return paint(); }
    if (b.dataset.rm) { st.times.splice(+b.dataset.rm, 1); return paint(); }
    if (b.dataset.addt !== undefined) { st.times.push('20:00'); return paint(); }
    if (b.dataset.sh !== undefined) { st.shared = !st.shared; return paint(); }
    if (b.dataset.stop !== undefined) {
      try { await update('medications', m.id, { active: !m.active }); sh.close(); toast(m.active ? `${m.name} stopped` : `${m.name} restarted`); redo(); } catch (er) { toast(er.message); }
      return;
    }
    if (b.dataset.save !== undefined) {
      if (!st.name.trim()) { box.querySelector('#err').textContent = 'Type the medicine\'s name.'; return; }
      const row = {
        name: st.name.trim(), dose: st.dose.trim() || null, form: st.form, eye: st.form === 'eye_drop' ? st.eye : null, schedule: st.schedule,
        week_days: st.schedule === 'some_days' ? st.week_days : null,
        times: st.schedule === 'as_needed' ? null : [...new Set(st.times.filter(Boolean))].sort().map((x) => `${x}:00`), shared: st.shared,
      };
      try {
        if (m) await update('medications', m.id, row); else await insert('medications', { ...row, member_id: s.id });
        if (st.form === 'eye_drop' && !s.eyes_on && s.id === state.me.id) await updateMember(s.id, { eyes_on: true });
        sh.close(); toast('Saved'); redo();
      } catch (er) { box.querySelector('#err').textContent = er.message; }
    }
  });
}

// =====================================================================
// Send Wellnest to a family member: a link that opens their setup screen ready to go
// =====================================================================
export function inviteSheet(m, justAdded = false) {
  if (!m) return;
  const familyEmail = state.family?.login_base || device()?.familyEmail || '';
  const code = btoa(unescape(encodeURIComponent(JSON.stringify({ e: familyEmail, n: m.display_name })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const link = `${location.origin}${location.pathname}#/setup/${code}`;
  const text = `Hi ${m.display_name}! Here's Wellnest, our family health check-in. Open this link on your phone and type the 6-digit PIN I gave you. Then tap Share and Add to Home Screen so it works like an app.`;
  const sh = sheet(`<div class="sheet-head"><div class="h2">${justAdded ? `${esc(m.display_name)} is added! ` : ''}Send Wellnest to ${esc(m.display_name)}</div><button class="xbtn" data-close>${icon('x')}</button></div>
    <p class="lead mt4">They'll get a link that opens Wellnest with their name already filled in. Tell them their PIN in person, so it's not in the message.</p>
    <div class="pill-note mt12" style="word-break:break-all">${esc(link)}</div>
    <button class="btn mt16" id="send">${icon('share')} Send</button>
    <button class="btn ghost mt12" id="copy">Copy link</button>`);
  sh.el.querySelector('#send').addEventListener('click', async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Wellnest', text, url: link }); sh.close(); }
      else { await navigator.clipboard.writeText(`${text}\n${link}`); toast('Copied. Paste it into a message.'); }
    } catch { /* cancelled */ }
  });
  sh.el.querySelector('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${text}\n${link}`); toast('Copied. Paste it into a message.'); } catch { toast('Couldn\'t copy. Press and hold the link to copy it.'); }
  });
}
