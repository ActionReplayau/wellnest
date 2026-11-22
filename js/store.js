// Everything that talks to the database lives here.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { slug, ageOn, today } from './util.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'wellnest-auth' },
});

// ---------- what this phone remembers (no health data) ----------
const DEVICE_KEY = 'wellnest-device';
export function device() {
  try { return JSON.parse(localStorage.getItem(DEVICE_KEY)) || null; } catch { return null; }
}
export function saveDevice(d) {
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch { /* private mode */ }
}
export function forgetDevice() {
  try { localStorage.removeItem(DEVICE_KEY); } catch { /* ignore */ }
}

// ---------- app state ----------
export const state = {
  me: null,          // my members row
  members: [],       // everyone in my family
  family: null,
  subjectId: null,   // who "Logging for" points at
};
export const member = (id) => state.members.find((m) => m.id === id);
export const ageOf = (m) => ageOn(m?.birthday);
export const isAdultPrivate = (m) => (ageOf(m) ?? 0) >= 16;
export const amParent = () => state.me?.role === 'parent';
// people I can log for: me, and my children under 16
export const loggable = () => state.members.filter((m) => m.id === state.me.id || (amParent() && m.role === 'child' && (ageOf(m) ?? 99) < 16));
export const subject = () => member(state.subjectId) || state.me;

// The hidden login address for a person: familyemail with a +tag, e.g. sam+wellnest.mia@mail.com
export function loginEmail(familyEmail, name) {
  const [local, domain] = familyEmail.trim().toLowerCase().split('@');
  return `${local.split('+')[0]}+wellnest.${slug(name)}@${domain}`;
}
const pinAsPassword = (pin) => `${pin}`; // Supabase needs 6+ characters; PINs are 6 digits

function friendly(error) {
  const m = (error?.message || String(error || '')).toLowerCase();
  if (m.includes('invalid login')) return 'That PIN doesn\'t match. Try again.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Someone with that name is already set up.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many tries. Wait a few minutes and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'No internet connection. Check your Wi-Fi or data.';
  if (m.includes('email') && m.includes('invalid')) return 'That email address doesn\'t look right.';
  return error?.message || 'Something went wrong. Please try again.';
}
export const errText = friendly;

// ---------- signing in ----------
export async function signIn(email, pin) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pinAsPassword(pin) });
  if (error) throw new Error(friendly(error));
  return data.user;
}
export async function signOut() { await sb.auth.signOut(); state.me = null; state.members = []; state.subjectId = null; state.family = null; }
export async function currentUserId() {
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id || null;
}

// Load my family into state and refresh this phone's list of faces
export async function loadFamily() {
  const uid = await currentUserId();
  if (!uid) return false;
  const { data: members, error } = await sb.from('members').select('*').order('created_at');
  if (error) throw new Error(friendly(error));
  const me = members.find((m) => m.id === uid);
  if (!me) return false;
  const { data: fam } = await sb.from('families').select('*').single();
  if (state.me?.id !== me.id) state.subjectId = me.id;
  state.me = me; state.members = members; state.family = fam;
  if (!state.subjectId || !member(state.subjectId)) state.subjectId = me.id;
  const d = device() || {};
  saveDevice({
    familyEmail: fam?.login_base || d.familyEmail,
    familyName: fam?.name,
    people: members.map((m) => ({ id: m.id, display_name: m.display_name, colour: m.colour, role: m.role, birthday: m.birthday, login_email: m.login_email })),
  });
  return true;
}

// First time ever: make the family with me as a parent
export async function createFamily({ familyName, familyEmail, name, birthday, pin, colour }) {
  const email = loginEmail(familyEmail, name);
  const { data, error } = await sb.auth.signUp({ email, password: pinAsPassword(pin) });
  if (error) throw new Error(friendly(error));
  if (!data.session) throw new Error('Supabase is still asking for email confirmation. Turn off "Confirm email" in Supabase, then try again.');
  const { error: e2 } = await sb.rpc('create_family', { p_family_name: familyName, p_display_name: name, p_birthday: birthday });
  if (e2) throw new Error(friendly(e2));
  const fam = await sb.from('families').select('id').single();
  await sb.from('families').update({ login_base: familyEmail.trim().toLowerCase() }).eq('id', fam.data.id);
  await sb.from('members').update({ login_email: email, colour, share_symptoms: false }).eq('id', data.user.id);
  await loadFamily();
}

// A parent adds someone. Uses a second, forgetful connection so the parent stays signed in.
export async function addPerson({ name, birthday, height_cm, role, colour, pin }) {
  const familyEmail = state.family?.login_base || device()?.familyEmail;
  if (!familyEmail) throw new Error('Family email is missing. Sign out and set up this phone again.');
  let email = loginEmail(familyEmail, name);
  const taken = new Set(state.members.map((m) => m.login_email));
  for (let n = 2; taken.has(email); n++) email = loginEmail(familyEmail, name + n);
  const temp = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'wellnest-temp' },
  });
  const { data, error } = await temp.auth.signUp({ email, password: pinAsPassword(pin) });
  if (error) throw new Error(friendly(error));
  const id = data.user?.id;
  if (!id || !data.session) throw new Error('Supabase is still asking for email confirmation. Turn off "Confirm email" in Supabase, then try again.');
  await temp.auth.signOut().catch(() => {});
  const under16 = (ageOn(birthday) ?? 99) < 16;
  const row = {
    id, family_id: state.me.family_id, display_name: name, role, birthday,
    height_cm: height_cm || null, colour, login_email: email,
    share_symptoms: under16, share_meds: under16, share_sleep: under16,
  };
  const { error: e2 } = await sb.from('members').insert(row);
  if (e2) throw new Error(friendly(e2));
  await loadFamily();
  return id;
}

export async function setPin(memberId, pin) {
  if (memberId === state.me.id) {
    const { error } = await sb.auth.updateUser({ password: pinAsPassword(pin) });
    if (error) throw new Error(friendly(error));
    return;
  }
  const { error } = await sb.rpc('set_pin', { p_member: memberId, p_new_pin: pin });
  if (error) throw new Error(friendly(error));
}

export async function updateMember(id, fields) {
  const { error } = await sb.from('members').update(fields).eq('id', id);
  if (error) throw new Error(friendly(error));
  Object.assign(member(id) || {}, fields);
  if (id === state.me.id) Object.assign(state.me, fields);
}

export async function removeMember(id) {
  const { error } = await sb.from('members').delete().eq('id', id);
  if (error) throw new Error(friendly(error));
  await loadFamily();
}

// ---------- generic table helpers ----------
export async function rows(table, build = (q) => q) {
  const { data, error } = await build(sb.from(table).select('*'));
  if (error) throw new Error(friendly(error));
  return data || [];
}
export async function insert(table, row) {
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) throw new Error(friendly(error));
  return data;
}
export async function upsert(table, row, onConflict) {
  const { data, error } = await sb.from(table).upsert(row, { onConflict }).select().single();
  if (error) throw new Error(friendly(error));
  return data;
}
// Until the bed/wake time database update is run, save sleep without the times rather than failing
const noSleepTimes = (m) => /bed_time|wake_time/.test(m || '');
const stripTimes = ({ bed_time, wake_time, ...rest }) => rest;
export async function upsertSleep(row) {
  try { return await upsert('sleep_logs', row, 'member_id,night_of'); } catch (e) {
    if (!noSleepTimes(e.message)) throw e;
    return upsert('sleep_logs', stripTimes(row), 'member_id,night_of');
  }
}
export async function upsertSleepMany(list) {
  try { return await upsertMany('sleep_logs', list, 'member_id,night_of'); } catch (e) {
    if (!noSleepTimes(e.message)) throw e;
    return upsertMany('sleep_logs', list.map(stripTimes), 'member_id,night_of');
  }
}
export async function upsertMany(table, list, onConflict) {
  for (let i = 0; i < list.length; i += 500) {
    const { error } = await sb.from(table).upsert(list.slice(i, i + 500), { onConflict, ignoreDuplicates: true });
    if (error) throw new Error(friendly(error));
  }
}
export async function update(table, id, fields) {
  const { data, error } = await sb.from(table).update(fields).eq('id', id).select().single();
  if (error) throw new Error(friendly(error));
  return data;
}
export async function remove(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw new Error(friendly(error));
}

// The Share switch default for a new entry
export function shareDefault(m, area) {
  return !!m?.[`share_${area}`];
}

// ---------- shared loaders ----------
// Medicines due on a given day for one person
export function dueTimes(med, day = today()) {
  if (!med.active) return [];
  if (med.schedule === 'as_needed') return [];
  if (med.schedule === 'some_days') {
    const wd = new Date(day + 'T12:00').getDay();
    if (!(med.week_days || []).includes(wd)) return [];
  }
  return med.times?.length ? med.times : ['08:00:00'];
}
