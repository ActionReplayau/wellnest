// Body map: turning a tap into a body-part name, and matching typed names

// x, y are percentages of the figure (0-100). side is 'front' or 'back'.
// On the front view the person's left is on the viewer's right.
export function regionAt(x, y, side = 'front') {
  const front = side === 'front';
  const lr = (x > 50) === front ? 'Left' : 'Right';
  const mid = Math.abs(x - 50) < 6;
  const torso = x >= 29 && x <= 71;
  if (y < 12.5) {
    if (!front) return 'Back of head';
    if (y < 4) return 'Top of head';
    if (y < 8) return mid ? 'Forehead' : `${lr} temple`;
    return mid ? 'Face' : `${lr} jaw`;
  }
  if (y < 17) return front ? 'Throat' : 'Neck';
  // arms: outside the torso
  const armOut = y < 33 ? (x < 30 || x > 70) : !torso;
  if (armOut && y < 57) {
    if (y < 25) return `${lr} shoulder`;
    if (y < 36) return `${lr} upper arm`;
    if (y < 41) return `${lr} elbow`;
    if (y < 48) return `${lr} forearm`;
    if (y < 51.5) return `${lr} wrist`;
    return `${lr} hand`;
  }
  if (y < 22) return front ? (mid ? 'Upper chest' : `${lr} collarbone`) : (mid ? 'Upper back' : `${lr} shoulder blade`);
  if (y < 32) {
    if (!front) return mid ? 'Upper back' : `${lr} shoulder blade`;
    return mid ? 'Chest' : (Math.abs(x - 50) < 17 ? `${lr} breast` : `${lr} ribs`);
  }
  if (y < 42) return front ? (y < 37 ? 'Upper stomach' : 'Stomach') : 'Middle back';
  if (y < 51) {
    if (Math.abs(x - 50) > 15) return `${lr} hip`;
    return front ? 'Lower stomach' : 'Lower back';
  }
  if (y < 57.5) {
    if (Math.abs(x - 50) > 16) return `${lr} hip`;
    return front ? 'Pelvis' : `${lr} buttock`;
  }
  if (y < 70) return front ? `${lr} thigh` : `Back of ${lr.toLowerCase()} thigh`;
  if (y < 76) return front ? `${lr} knee` : `Back of ${lr.toLowerCase()} knee`;
  if (y < 90) return front ? `${lr} shin` : `${lr} calf`;
  if (y < 94) return `${lr} ankle`;
  return front ? `${lr} foot` : `${lr} heel`;
}

const PARTS = ['Head', 'Top of head', 'Forehead', 'Temple', 'Face', 'Eye', 'Ear', 'Nose', 'Mouth', 'Teeth', 'Jaw', 'Throat', 'Neck',
  'Shoulder', 'Upper arm', 'Elbow', 'Forearm', 'Wrist', 'Hand', 'Fingers', 'Thumb', 'Chest', 'Upper chest', 'Breast', 'Ribs', 'Collarbone',
  'Upper stomach', 'Stomach', 'Lower stomach', 'Pelvis', 'Groin', 'Hip', 'Upper back', 'Shoulder blade', 'Middle back', 'Lower back', 'Buttock',
  'Thigh', 'Knee', 'Shin', 'Calf', 'Ankle', 'Foot', 'Heel', 'Toes', 'Skin', 'Whole body'];
const SIDED = new Set(['Temple', 'Eye', 'Ear', 'Jaw', 'Shoulder', 'Upper arm', 'Elbow', 'Forearm', 'Wrist', 'Hand', 'Fingers', 'Thumb', 'Breast', 'Ribs', 'Collarbone', 'Shoulder blade', 'Hip', 'Buttock', 'Thigh', 'Knee', 'Shin', 'Calf', 'Ankle', 'Foot', 'Heel', 'Toes']);

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// How far a typed word is from a word in a name (prefix matches count as close)
function wordScore(t, w) {
  if (w.startsWith(t)) return 0;
  const d = lev(t, w.slice(0, Math.max(t.length, 3)));
  return d <= (t.length > 4 ? 2 : 1) ? d : 9;
}
const SIDE_WORDS = { left: 'Left', lef: 'Left', let: 'Left', lft: 'Left', l: 'Left', right: 'Right', rigt: 'Right', rite: 'Right', righ: 'Right', rght: 'Right', r: 'Right' };
// "let breast" -> ["Left breast", ...]
export function suggestParts(text, limit = 4) {
  let words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  let side = null;
  const sideIdx = words.findIndex((w) => SIDE_WORDS[w] || (w.length >= 3 && (lev(w, 'left') <= 1 || lev(w, 'right') <= 1)));
  if (sideIdx >= 0 && words.length > 1) {
    const w = words[sideIdx];
    side = SIDE_WORDS[w] || (lev(w, 'left') <= 1 ? 'Left' : 'Right');
    words = words.filter((_, i) => i !== sideIdx);
  }
  const scored = PARTS.map((name) => {
    const nw = name.toLowerCase().split(' ');
    let total = 0;
    for (const t of words) {
      const best = Math.min(...nw.map((w) => wordScore(t, w)));
      if (best >= 9) return null;
      total += best;
    }
    return { name, score: total + (nw.length - words.length) * 0.3 };
  }).filter(Boolean).sort((a, b) => a.score - b.score);
  const named = (n) => (side && SIDED.has(n) ? `${side} ${n.toLowerCase()}` : n);
  const out = [...new Set(scored.map((x) => named(x.name)))];
  if (!side && words.length) {
    // nothing typed about a side: offer the sided versions too
    const first = scored[0]?.name;
    if (first && SIDED.has(first)) out.splice(1, 0, `Left ${first.toLowerCase()}`, `Right ${first.toLowerCase()}`);
  }
  return out.slice(0, limit);
}
