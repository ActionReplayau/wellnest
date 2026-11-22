// Period data as a spreadsheet file (.csv): saving a copy out of Wellnest,
// and reading one back in (from Wellnest, Lively or most other period apps).
import { iso, addDays, daysBetween } from './util.js';

const FLOW_WORDS = { heavy: 'heavy', high: 'heavy', medium: 'medium', moderate: 'medium', normal: 'medium', light: 'light', low: 'light', spotting: 'spotting', spot: 'spotting', none: 'none', no: 'none' };
const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function periodCsv(rowsIn) {
  const lines = [['Date', 'Flow', 'Other symptoms'].join(',')];
  for (const r of rowsIn) if (r.flow || (r.extras || []).length) lines.push([r.day, r.flow || '', (r.extras || []).join('; ')].map(cell).join(','));
  return lines.join('\r\n') + '\r\n';
}

// Hands the file to the phone: on iPhone this opens the Share sheet ("Save to Files", Mail, AirDrop).
export async function saveFile(name, text, type = 'text/csv') {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

function parseRows(text) {
  const first = text.split(/\r?\n/)[0], count = (ch) => first.split(ch).length;
  const sep = [',', ';', '\t'].reduce((a, b) => (count(b) > count(a) ? b : a));
  const out = []; let row = [], v = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { v += '"'; i++; } else if (c === '"') q = false; else v += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(v.trim()); v = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(v.trim()); out.push(row); row = []; v = ''; }
    else v += c;
  }
  if (v || row.length) { row.push(v.trim()); out.push(row); }
  return out.filter((r) => r.some((x) => x));
}

// Understands 2026-11-22, 22/11/2026 (Australian order), 11/22/2026 and "22 Nov 2026".
export function readDate(s) {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(new Date(+m[1], m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let [a, b, y] = [+m[1], +m[2], +m[3]]; if (y < 100) y += 2000;
    const [d, mo] = b > 12 ? [b, a] : [a, b];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return iso(new Date(y, mo - 1, d));
  }
  const t = Date.parse(s);
  return Number.isNaN(t) || !/[a-z]/i.test(s) ? null : iso(new Date(t));
}

// Returns [{day, flow, extras}] or throws a friendly message.
export function readPeriodCsv(text) {
  const all = parseRows(text.replace(/^﻿/, ''));
  if (all.length < 2) throw new Error('That file looks empty.');
  const head = all[0].map((h) => h.toLowerCase());
  const col = (...words) => head.findIndex((h) => words.some((w) => h.includes(w)));
  let dateC = col('date', 'day');
  const startC = col('start'), endC = col('end');
  const flowC = col('flow', 'bleed', 'intensity', 'menstru');
  const extraC = col('symptom', 'other', 'note');
  let body = all.slice(1);
  if (dateC < 0 && startC < 0) { // no headings: find the first column full of dates
    body = all; dateC = all[0].findIndex((v) => readDate(v));
    if (dateC < 0) throw new Error('Couldn\'t find any dates in that file.');
  }
  const found = new Map(), rank = { none: 0, spotting: 1, light: 2, medium: 3, heavy: 4 };
  const add = (day, flow, extras) => {
    const old = found.get(day);
    if (!old || rank[flow] > rank[old.flow]) found.set(day, { day, flow, extras: extras.length ? extras : old?.extras || [] });
  };
  for (const r of body) {
    const raw = (flowC >= 0 ? r[flowC] || '' : '').toLowerCase().trim();
    const flow = raw ? FLOW_WORDS[raw.split(/\W/)[0]] || 'medium' : 'medium';
    const extras = extraC >= 0 && r[extraC] ? r[extraC].split(/;\s*/).filter(Boolean) : [];
    if (startC >= 0 && (dateC < 0 || dateC === startC)) { // one row per period: start and end dates
      const a = readDate(r[startC]); if (!a) continue;
      const b = endC >= 0 ? readDate(r[endC]) : null;
      const n = b && b >= a ? Math.min(daysBetween(a, b), 14) : 4;
      for (let i = 0; i <= n; i++) add(addDays(a, i), flow, i ? [] : extras);
    } else {
      const d = readDate(r[dateC]); if (d) add(d, flow, extras);
    }
  }
  const list = [...found.values()].filter((x) => x.day <= iso(new Date())).sort((x, y) => (x.day < y.day ? -1 : 1));
  if (!list.length) throw new Error('Couldn\'t find any period dates in that file.');
  return list;
}
