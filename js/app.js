// Wellnest: start-up, page switching, and the sign-in screens
import { esc, icon, avatar, toast, on, COLOURS, ageOn, today, fmtLong, loadingHtml } from './util.js';
import { sb, state, device, saveDevice, forgetDevice, signIn, signOut, loadFamily, createFamily, loginEmail, errText } from './store.js';

const app = document.getElementById('app');
const routes = {};
export function route(name, render) { routes[name] = render; }
export const go = (path) => { if (location.hash === '#/' + path) render(); else location.hash = '#/' + path; };

// ---------- look: Glow, Daylight or Automatic ----------
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
export function applyLook(look = state.me?.look || 'auto') {
  const dark = look === 'glow' || (look === 'auto' && darkQuery.matches);
  document.documentElement.classList.toggle('theme-glow', dark);
  document.documentElement.classList.toggle('theme-day', !dark);
  document.querySelector('meta[name=theme-color]').content = dark ? '#0B0A1A' : '#6D28D9';
}
darkQuery.addEventListener?.('change', () => applyLook());

// ---------- the page frame ----------
export function frame({ hero = '', heroH = 0, body = '', tabs = null, heroAttr = '' }) {
  const tabbar = tabs ? `<nav class="tabbar">${[
    ['today', 'sun', 'Today'], ['history', 'chart', 'History'], ['family', 'users', 'Family'], ['report', 'file', 'Report'],
  ].map(([r, ic, label]) => `<a class="tab ${tabs === r ? 'on' : ''}" href="#/${r}"><div class="ic">${icon(ic)}</div>${label}</a>`).join('')}</nav>` : '';
  return `${heroH ? `<div class="hero" ${heroAttr} style="--hero-h:${heroH}px"></div>` : ''}
    <div class="scr ${tabs ? '' : 'notabs'}">${hero}${body}</div>${tabbar}`;
}
export function backBar(title, to = 'today', onHero = true) {
  return `<div class="topbar ${onHero ? 'on-hero' : ''}"><a class="backbtn" href="#/${to}" aria-label="Back">${icon('left')}</a>
    ${title ? `<div class="h2">${esc(title)}</div>` : ''}</div>`;
}

let renderId = 0;
export async function render() {
  const id = ++renderId;
  const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  const signedIn = !!state.me;
  const open = ['welcome', 'setup', 'who', 'pin', 'create'];
  if (!signedIn && !open.includes(name)) return go(device()?.people?.length ? 'who' : 'welcome');
  if (signedIn && open.includes(name)) return go('today');
  const fn = routes[name] || routes.today;
  window.scrollTo(0, 0);
  app._acts = {};
  document.getElementById('layer').innerHTML = '';
  try {
    await fn(app, args[0] != null ? decodeURIComponent(args[0]) : undefined, () => id === renderId);
  } catch (e) {
    console.error(e);
    if (id === renderId) app.innerHTML = frame({ body: `<div class="card mt24"><div class="h2">Something went wrong</div><p class="lead mt8">${esc(e.message)}</p><a class="btn mt16" href="#/today">Back to Today</a></div>` });
  }
}
window.addEventListener('hashchange', render);

// ---------- Welcome (a phone that has never been set up) ----------
route('welcome', (el) => {
  el.innerHTML = frame({ heroH: 360, body: `
    <div class="on-hero center" style="padding-top:40px">
      <img src="img/icon-192.png" alt="" width="96" height="96" style="border-radius:26px;box-shadow:0 20px 40px -14px rgba(0,0,0,.6)">
      <div class="h1 mt16">Wellnest</div>
      <p class="lead mt8">Our family's daily health check-in</p>
    </div>
    <div class="card" style="margin-top:70px">
      <div class="h2">Set up this phone</div>
      <p class="lead mt4">Your family already uses Wellnest. Sign in once and this phone will remember everyone's names.</p>
      <a class="btn mt16" href="#/setup">Set up this phone</a>
    </div>
    <div class="card">
      <div class="h2">Starting fresh?</div>
      <p class="lead mt4">A parent creates the family the very first time.</p>
      <a class="btn ghost mt16" href="#/create">Create our family</a>
    </div>` });
});

// ---------- Set up this phone ----------
route('setup', (el, inv) => {
  const d = device() || {};
  let invite = {};
  try { if (inv) invite = JSON.parse(decodeURIComponent(escape(atob(inv.replace(/-/g, '+').replace(/_/g, '/'))))); } catch { invite = {}; }
  if (invite.e) d.familyEmail = invite.e;
  el.innerHTML = frame({ heroH: 250, body: `
    ${backBar('', 'welcome')}
    <div class="on-hero"><div class="h1">${invite.n ? `Hi ${esc(invite.n)}!` : 'Set up this phone'}</div><p class="lead mt8">${invite.n ? 'Type the 6-digit PIN you were given. Then add Wellnest to your home screen: tap Share, then Add to Home Screen.' : 'Use the family email that was used to create Wellnest, plus your own name and PIN.'}</p></div>
    <form class="card" style="margin-top:46px" id="f">
      <label class="field"><span>Family email</span><input class="input" name="email" type="email" autocomplete="email" required value="${esc(d.familyEmail || '')}"></label>
      <label class="field"><span>Your first name, as it was set up</span><input class="input" name="name" autocomplete="given-name" required value="${esc(invite.n || '')}"></label>
      <label class="field"><span>Your 6-digit PIN</span><input class="input" name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" type="password" required></label>
      <div class="err mt12" id="err"></div>
      <button class="btn mt8" type="submit">Sign in</button>
    </form>` });
  el.querySelector('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), err = el.querySelector('#err'), btn = e.target.querySelector('button');
    btn.disabled = true; err.textContent = '';
    try {
      const familyEmail = f.get('email').trim().toLowerCase();
      await signIn(loginEmail(familyEmail, f.get('name')), f.get('pin'));
      saveDevice({ ...(device() || {}), familyEmail });
      if (!(await loadFamily())) throw new Error('This login isn\'t part of a family yet.');
      applyLook(); go('today');
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });
});

// ---------- Create our family (first parent, first time) ----------
route('create', (el) => {
  let colour = 'violet';
  el.innerHTML = frame({ heroH: 250, body: `
    ${backBar('', 'welcome')}
    <div class="on-hero"><div class="h1">Create your family</div><p class="lead mt8">You'll be the first parent. You can add everyone else straight after.</p></div>
    <form class="card" style="margin-top:46px" id="f">
      <label class="field"><span>Family name</span><input class="input" name="family" placeholder="e.g. The Smiths" required></label>
      <label class="field"><span>Your email</span><input class="input" name="email" type="email" autocomplete="email" required>
        <small class="lead" style="display:block;margin:6px 4px 0;font-size:12.5px">Only used behind the scenes to make everyone's logins. Wellnest never emails you.</small></label>
      <label class="field"><span>Your first name</span><input class="input" name="name" autocomplete="given-name" required></label>
      <label class="field"><span>Your birthday</span><input class="input" name="birthday" type="date" required max="${today()}"></label>
      <div class="field"><span>Your colour</span><div class="colours" id="cols">${COLOURS.map((c) => avatar({ colour: c, display_name: ' ' }, 40, c === colour ? 'sel' : '').replace('class="av', `data-c="${c}" class="av`)).join('')}</div></div>
      <label class="field"><span>Choose a 6-digit PIN</span><input class="input" name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" type="password" required></label>
      <label class="field"><span>Type the PIN again</span><input class="input" name="pin2" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" type="password" required></label>
      <div class="err mt12" id="err"></div>
      <button class="btn mt8" type="submit">Create family</button>
    </form>` });
  el.querySelector('#cols').addEventListener('click', (e) => {
    const a = e.target.closest('[data-c]'); if (!a) return;
    colour = a.dataset.c;
    el.querySelectorAll('#cols .av').forEach((x) => x.classList.toggle('sel', x === a));
  });
  el.querySelector('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), err = el.querySelector('#err'), btn = e.target.querySelector('button[type=submit]');
    if (f.get('pin') !== f.get('pin2')) { err.textContent = 'The two PINs don\'t match.'; return; }
    btn.disabled = true; err.textContent = '';
    try {
      await createFamily({ familyName: f.get('family').trim(), familyEmail: f.get('email'), name: f.get('name').trim(), birthday: f.get('birthday'), pin: f.get('pin'), colour });
      saveDevice({ ...(device() || {}), familyEmail: f.get('email').trim().toLowerCase() });
      applyLook(); toast('Family created. Now add everyone else.'); go('add-person');
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });
});

// ---------- Who's checking in? ----------
route('who', (el) => {
  const d = device();
  if (!d?.people?.length) return go('welcome');
  const people = d.people;
  el.innerHTML = frame({ heroH: 330, body: `
    <div class="on-hero"><div class="row between"><div class="logo">${icon('pulse')}</div></div>
      <div class="eyebrow mt16">${esc(fmtLong(today()))}</div>
      <div class="h1 mt4">Who's checking in?</div>
      <p class="lead mt4">Tap your face to start today's check-in</p></div>
    <div class="who-grid">${people.map((p, i) => {
      const a = ageOn(p.birthday);
      const role = p.role === 'parent' ? 'Parent' : a != null ? String(a) : '';
      const last = people.length % 3 === 1 && i === people.length - 1 ? 'last' : '';
      return `<a class="who ${last}" href="#/pin/${p.id}">${avatar(p, 84)}<div class="nm">${esc(p.display_name)}</div><div class="rl">${esc(role)}</div></a>`;
    }).join('')}</div>
    <div class="center mt24"><span class="chip">${icon('lock')} Private to your family</span></div>
    <div class="center mt16"><button class="linkbtn" data-act="reset">Not your family? Set up this phone again</button></div>` });
  on(el, {
    reset: async () => {
      const { confirmBox } = await import('./util.js');
      if (await confirmBox('Set up this phone again?', 'This phone will forget the family list. No one\'s entries are deleted.', 'Forget this family')) { forgetDevice(); go('welcome'); }
    },
  });
});

// ---------- PIN ----------
route('pin', (el, id) => {
  const p = device()?.people?.find((x) => x.id === id);
  if (!p) return go('who');
  let pin = '';
  const keys = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ']];
  el.innerHTML = frame({ heroH: 0, body: `
    ${backBar('', 'who', false)}
    <div class="center" style="padding-top:6px">
      <div style="display:flex;justify-content:center">${avatar(p, 92)}</div>
      <div class="h1 mt16">Hi ${esc(p.display_name)}</div>
      <p class="lead mt4">Enter your 6-digit PIN</p>
      <div class="pin-dots" id="dots">${'<i></i>'.repeat(6)}</div>
      <div class="err mt12" id="err"></div>
      <div class="keypad" style="margin-top:14px">
        ${keys.map(([n, l]) => `<button class="key" data-k="${n}">${n}${l ? `<small>${l}</small>` : '<small>&nbsp;</small>'}</button>`).join('')}
        <div class="key blank"></div><button class="key" data-k="0">0<small>&nbsp;</small></button>
        <button class="key blank" data-k="del" aria-label="Delete">${icon('back')}</button>
      </div>
      <p class="lead mt24" style="font-size:13px">Forgot your PIN? Ask Mum or Dad.</p>
    </div>` });
  const dots = el.querySelector('#dots'), err = el.querySelector('#err');
  const paint = () => dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('f', i < pin.length));
  let busy = false;
  async function submit() {
    busy = true;
    try {
      const email = p.login_email || loginEmail(device().familyEmail, p.display_name);
      await signIn(email, pin);
      if (!(await loadFamily())) throw new Error('This login isn\'t part of a family.');
      applyLook(); go('today');
    } catch (ex) {
      err.textContent = ex.message; pin = ''; paint();
      dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
    }
    busy = false;
  }
  const press = (k) => {
    if (busy) return;
    err.textContent = '';
    if (k === 'del') pin = pin.slice(0, -1); else if (pin.length < 6) pin += k;
    paint();
    if (pin.length === 6) submit();
  };
  el.querySelector('.keypad').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  const keyHandler = (e) => {
    if (!location.hash.startsWith('#/pin')) return document.removeEventListener('keydown', keyHandler);
    if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del');
  };
  document.addEventListener('keydown', keyHandler);
});

// ---------- switching person ----------
export async function switchPerson() {
  await signOut();
  applyLook('auto');
  go('who');
}

// ---------- start ----------
async function start() {
  applyLook(device()?.look || 'auto');
  app.innerHTML = loadingHtml;
  await Promise.all([
    import('./screens/today.js'), import('./screens/history.js'), import('./screens/family.js'),
    import('./screens/report.js'), import('./screens/settings.js'), import('./screens/trackers.js'),
  ]);
  try { if (await sb.auth.getSession().then((r) => r.data.session)) await loadFamily(); } catch (e) { console.warn(e); }
  if (state.me) applyLook();
  render();
}
start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
