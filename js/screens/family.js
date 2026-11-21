// Family: everyone today at a glance
import { route, frame, go } from '../app.js';
import { esc, icon, avatar, on, today, addDays, fmtLong, fmtTime, loadingHtml, sevClass, ring } from '../util.js';
import { sb, state, amParent, ageOf, isAdultPrivate, rows } from '../store.js';
import { symptomStatus } from './history.js';

route('family', async (el, _a, alive) => {
  const t = today();
  const head = (n, total, waiting) => `<div class="on-hero"><div class="eyebrow">${esc(fmtLong(t))}</div><div class="h1 mt4">The family today</div></div>
    <div class="card mt16"><div class="row" style="gap:18px">${ring(n, total)}
      <div class="grow"><div class="h2">${n} of ${total} checked in</div>
      <div class="muted small mt4" style="font-size:14px">${waiting.length ? `${waiting.map((m) => esc(m.display_name)).join(' and ').replace(/ and (?=.* and )/g, ', ')} still to go` : 'Everyone\'s done 🎉'}</div></div></div></div>`;
  el.innerHTML = frame({ heroH: 230, tabs: 'family', body: `<div class="on-hero"><div class="h1">The family today</div></div>${loadingHtml}` });
  const ids = state.members.map((m) => m.id);
  const [checkins, symptoms, checks, period] = await Promise.all([
    sb.rpc('family_checkins', { p_day: t }).then((r) => r.data || []),
    rows('symptoms', (q) => q.in('member_id', ids).lte('started_on', t).or(`ended_on.is.null,ended_on.gte.${t}`)),
    rows('symptom_checks', (q) => q.in('member_id', ids).gte('day', addDays(t, -30)).order('day')),
    rows('period_days', (q) => q.in('member_id', ids).eq('day', t)),
  ]);
  if (!alive()) return;
  const lastAt = new Map(checkins.map((c) => [c.member_id, c.last_at]));
  const cards = state.members.map((m) => {
    const at = lastAt.get(m.id);
    const syms = symptoms.filter((s) => s.member_id === m.id && s.ended_on !== t);
    const pd = period.find((p) => p.member_id === m.id && ['light', 'medium', 'heavy', 'spotting'].includes(p.flow));
    const priv = isAdultPrivate(m) && m.id !== state.me.id;
    const loggedByOther = checks.find((c) => c.member_id === m.id && c.day === t && c.logged_by !== m.id);
    const stats = syms.slice(0, 3).map((s) => {
      const list = checks.filter((c) => c.symptom_id === s.id);
      const sev = list.length ? list[list.length - 1].severity : null;
      const [, cls] = symptomStatus(s, checks, t);
      return `<span class="stat ${cls}">${esc(s.name)}${sev != null ? ` ${sev}` : ''}</span>`;
    });
    if (syms.length > 3) stats.push(`<span class="stat same">+${syms.length - 3} more</span>`);
    if (pd) stats.push(`<span class="stat period">${icon('drop')} Period</span>`);
    let body;
    if (!at) {
      body = `<span class="stat wait">Not yet</span>`;
      if (amParent() && m.role === 'child' && (ageOf(m) ?? 99) < 16) body += `<button class="chip mt8" data-act="logfor" data-id="${m.id}">Log for ${esc(m.display_name)}</button>`;
      if (stats.length) body = stats.join('') + body;
    } else if (stats.length) {
      body = stats.join('');
    } else if (priv) {
      body = `<span class="stat priv">${icon('lock')} Private</span><div class="muted small mt4">16+ · only shows what they share</div>`;
    } else {
      body = `<span class="stat good">${icon('check')} All good</span>`;
    }
    const sub = at ? (loggedByOther && !priv ? `by ${esc(state.members.find((x) => x.id === loggedByOther.logged_by)?.display_name || '')} · ${fmtTime(at)}` : fmtTime(at)) : '';
    return `<div class="card"><div class="row">${avatar(m, 46, priv ? '' : '')}<div class="grow"><div class="h2" style="font-size:16px">${esc(m.display_name)}</div>
      <div class="muted small">${sub || (m.role === 'parent' ? 'Parent' : `${ageOf(m) ?? ''}`)}</div></div></div>
      <div class="fam-body">${body}</div></div>`;
  });
  const done = state.members.filter((m) => lastAt.has(m.id));
  const waiting = state.members.filter((m) => !lastAt.has(m.id));
  el.innerHTML = frame({ heroH: 230, tabs: 'family', body: `${head(done.length, state.members.length, waiting)}
    <div class="fam mt16">${cards.join('')}</div>
    ${amParent() ? `<a class="btn ghost mt16" href="#/add-person">${icon('plus')} Add a family member</a>` : ''}` });
  on(el, { logfor: (b) => { state.subjectId = b.dataset.id; go('today'); } });
});
