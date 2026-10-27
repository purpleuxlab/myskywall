// my little sky wall
// Memories (including the photo itself, as a Blob) are kept in IndexedDB,
// which holds far more than localStorage. Export a backup now and then.

// ---------- storage ----------
const DB_NAME = 'my-little-sky-wall';
const STORE = 'skies';

const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function inStore(mode, action) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const db = {
  all: () => inStore('readonly', s => s.getAll()),
  put: sky => inStore('readwrite', s => s.put(sky)),
  putMany: list => inStore('readwrite', s => { list.forEach(sky => s.put(sky)); }),
  remove: id => inStore('readwrite', s => s.delete(id)),
};

// ---------- constants ----------
const MOODS = {
  plain: '#ECE7FA',
  golden: '#F8E2A6',
  peach: '#FBD2C0',
  pink: '#F6D0DE',
  lavender: '#DCD2F6',
  cloudy: '#E3E1E8',
  dramatic: '#F2B4A6',
};
const HEART_PATH = 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';
const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART_PATH}"/></svg>`;

// little white line doodles, drawn on a 24×24 grid
const DOODLES = {
  hearts: '<path d="M7.4 4.2a2.6 2.6 0 0 0-3.7 0 2.6 2.6 0 0 0 0 3.7L7.4 11.6l3.7-3.7a2.6 2.6 0 0 0-3.7-3.7Z"/><path d="M16 11.4a3.4 3.4 0 0 0-4.8 0 3.4 3.4 0 0 0 0 4.8l4.8 4.8 4.8-4.8a3.4 3.4 0 0 0-4.8-4.8Z"/>',
  waves: '<path d="M1 13c2.5-3.5 5.5-3.5 8 0s5.5 3.5 8 0 4-2.5 6-1"/><path d="M7 18c2-2.4 4-2.4 6 0s4 2.4 6 0"/>',
  sparkles: '<path d="M8 2c.6 3.2 1.6 4.2 4.6 4.8C9.6 7.4 8.6 8.4 8 11.6 7.4 8.4 6.4 7.4 3.4 6.8 6.4 6.2 7.4 5.2 8 2Z"/><path d="M17 12c.4 2 1 2.6 2.8 3-1.8.4-2.4 1-2.8 3-.4-2-1-2.6-2.8-3 1.8-.4 2.4-1 2.8-3Z"/>',
  birds: '<path d="M2 9c2-2.2 4-2.2 5 0 1-2.2 3-2.2 5 0"/><path d="M13 14.5c1.4-1.5 2.8-1.5 3.6 0 .8-1.5 2.2-1.5 3.6 0"/>',
  rays: '<path d="M3 13 6.5 16"/><path d="M9 5.5l1.2 4.2"/><path d="M17 3.5l-1.2 4.4"/><path d="M22 9.5l-3.4 2.6"/>',
  shell: '<path d="M12 21 3.2 11.4C4.8 5.6 19.2 5.6 20.8 11.4Z"/><path d="M12 21 7.6 8"/><path d="M12 21V7"/><path d="M12 21l4.4-13"/><path d="M10.4 21h3.2"/>',
};
// which doodles go on which corners; each card gets one set
const DOODLE_SETS = [
  [['tl', 'hearts'], ['br', 'waves']],
  [['tr', 'rays'], ['br', 'shell']],
  [['tl', 'sparkles'], ['tr', 'birds']],
  [['tr', 'birds'], ['br', 'waves']],
  [['tl', 'hearts'], ['tr', 'rays']],
  [['tl', 'sparkles'], ['br', 'shell']],
];

// ---------- wobbly hand-drawn frames ----------
// A rounded rectangle (superellipse) with smooth noise on its edge, so each
// frame looks sketched by hand. Points live in a 0–100 box.
function seededRandom(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
function wobblePoints(seed, amp = 1.5) {
  const rnd = seededRandom(seed * 97 + 13);
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const N = 72, n = 10, pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const wob = amp * (0.55 * Math.sin(3 * t + ph[0]) + 0.3 * Math.sin(7 * t + ph[1]) + 0.18 * Math.sin(13 * t + ph[2]));
    pts.push([
      50 + Math.sign(c) * Math.abs(c) ** (2 / n) * (49 + wob * 0.55), // frames are wide, so wobble less across
      50 + Math.sign(s) * Math.abs(s) ** (2 / n) * (48 + wob * 1.25),
    ]);
  }
  return pts;
}
// closed Catmull-Rom curve through the points, as an SVG path
function smoothPath(pts, scale = 1) {
  const p = i => pts[(i + pts.length) % pts.length];
  const f = v => +(v * scale).toFixed(4);
  let d = `M${f(p(0)[0])} ${f(p(0)[1])}`;
  for (let i = 0; i < pts.length; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} `
      + `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}
const FRAME_VARIANTS = 6;
const framePaths = Array.from({ length: FRAME_VARIANTS }, (_, i) => wobblePoints(i + 1));
document.getElementById('clipDefs').innerHTML = framePaths
  .map((pts, i) => `<clipPath id="wob${i}" clipPathUnits="objectBoundingBox"><path d="${smoothPath(pts, 0.01)}"/></clipPath>`)
  .join('');

// ---------- state ----------
let skies = [];
let filter = 'all';
let firstRender = true;
let justAddedId = null;
const photoUrls = new Map(); // id -> { blob, url }

const $ = sel => document.querySelector(sel);
const wall = $('#wall');

// ---------- helpers ----------
const pad = n => String(n).padStart(2, '0');
function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function shortDate(iso) {
  const d = parseIso(iso);
  const opts = { day: '2-digit', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-GB', opts).toLowerCase();
}
function longDate(iso) {
  return parseIso(iso)
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .toLowerCase();
}
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function hash(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
function displayTitle(sky) {
  if (sky.title) return sky.title;
  return sky.location ? `somewhere in ${sky.location}` : `a little ${sky.type}`;
}
function photoUrl(sky) {
  const cached = photoUrls.get(sky.id);
  if (cached && cached.blob === sky.photo) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(sky.photo);
  photoUrls.set(sky.id, { blob: sky.photo, url });
  return url;
}
function forgetPhoto(id) {
  const cached = photoUrls.get(id);
  if (cached) URL.revokeObjectURL(cached.url);
  photoUrls.delete(id);
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- rendering ----------
function sortSkies() {
  skies.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}
function visibleSkies() {
  if (filter === 'all') return skies;
  if (filter === 'fav') return skies.filter(s => s.fav);
  return skies.filter(s => s.type === filter);
}
function render() {
  const rises = skies.filter(s => s.type === 'sunrise').length;
  const sets = skies.length - rises;
  $('#stats').textContent = `${rises} ${rises === 1 ? 'sunrise' : 'sunrises'} · ${sets} ${sets === 1 ? 'sunset' : 'sunsets'} · ${skies.length} kept`;
  $('#randomBtn').disabled = skies.length === 0;

  const list = visibleSkies();
  setBackdrop(list[0] || skies[0]);
  wall.replaceChildren();
  wall.classList.toggle('first-draw', firstRender);
  if (!list.length) {
    const box = document.createElement('div');
    box.className = 'frames single';
    box.append(emptyCard());
    wall.append(box);
  } else {
    // one labelled group per month
    const months = new Map();
    list.forEach(sky => {
      const key = sky.date.slice(0, 7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(sky);
    });
    let index = 0;
    months.forEach((group, key) => {
      wall.append(monthLabel(key, group.length));
      const box = document.createElement('div');
      box.className = 'frames';
      group.forEach(sky => box.append(makeCard(sky, index++)));
      wall.append(box);
    });
  }
  firstRender = false;
  justAddedId = null;
}

// the page background is the latest sky, blurred
let backdropId = null;
function setBackdrop(sky) {
  const el = $('#backdrop');
  if (!sky) { backdropId = null; el.style.backgroundImage = ''; return; }
  if (sky.id === backdropId && el.style.backgroundImage) return;
  backdropId = sky.id;
  el.style.backgroundImage = `url("${photoUrl(sky)}")`;
}

// photo + wobbly clip + sketched outline + doodles; shared by cards and the full view
function frameParts(seed, doodles = true) {
  const v = seed % FRAME_VARIANTS;
  const outline = smoothPath(framePaths[v]);
  const set = DOODLE_SETS[seed % DOODLE_SETS.length];
  return {
    clip: `url(#wob${v})`,
    html: `<svg class="sketch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="${outline}"/></svg>`
      + (doodles ? set.map(([corner, name]) =>
        `<span class="doodle ${corner}" aria-hidden="true"><svg viewBox="0 0 24 24">${DOODLES[name]}</svg></span>`).join('') : ''),
  };
}

function monthLabel(key, count) {
  const el = document.createElement('h2');
  el.className = 'month';
  const name = parseIso(`${key}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toLowerCase();
  el.innerHTML = '<span></span><small></small>';
  el.querySelector('span').textContent = name;
  el.querySelector('small').textContent = `${count} ${count === 1 ? 'sky' : 'skies'}`;
  return el;
}

function paletteEl(colors, className) {
  const el = document.createElement('span');
  el.className = className;
  (colors || []).forEach(c => {
    const dot = document.createElement('i');
    dot.style.background = c;
    dot.title = c;
    el.append(dot);
  });
  return el;
}

function makeCard(sky, index) {
  const seed = hash(sky.id);
  const frame = frameParts(seed);
  const el = document.createElement('article');
  el.className = 'sky-card' + (sky.id === justAddedId ? ' is-new' : '');
  el.dataset.id = sky.id;
  el.style.setProperty('--delay', `${Math.min(index * 0.08, 0.8)}s`);
  el.innerHTML = `
    <button class="sky-open" type="button">
      <span class="shot"><img loading="lazy" decoding="async"></span>
      ${frame.html}
      <span class="words"></span>
      <span class="when"></span>
    </button>
    <button class="heart" type="button">${HEART_SVG}</button>`;

  const title = displayTitle(sky);
  const shot = el.querySelector('.shot');
  shot.style.clipPath = frame.clip;
  const img = el.querySelector('img');
  img.src = photoUrl(sky);
  img.alt = `${sky.type}: ${title}`;
  const words = el.querySelector('.words');
  words.textContent = `${title} ♡`;
  words.style.setProperty('--wx', `${10 + (seed % 5) * 3}%`);
  words.style.setProperty('--wy', `${30 + (seed % 4) * 5}%`);
  el.querySelector('.when').textContent =
    [shortDate(sky.date), sky.type, sky.title ? sky.location : ''].filter(Boolean).join(' · ');
  el.querySelector('.sky-open').addEventListener('click', () => openView(sky.id));

  const heart = el.querySelector('.heart');
  heart.setAttribute('aria-pressed', String(!!sky.fav));
  heart.setAttribute('aria-label', sky.fav ? `Remove "${title}" from favourites` : `Favourite "${title}"`);
  heart.addEventListener('click', () => toggleFav(sky.id, true));
  return el;
}

function emptyCard() {
  const messages = {
    all: 'your wall is waiting for its first sky.',
    sunrise: 'no sunrises yet. one early morning, maybe?',
    sunset: 'no sunsets yet. the next golden hour is yours.',
    fav: 'no favourites yet. tap a heart on a sky you love.',
  };
  const frame = frameParts(2);
  const el = document.createElement('article');
  el.className = 'sky-card empty';
  el.innerHTML = `
    <div class="sky-open">
      <span class="shot"><span class="msg"></span></span>
      ${frame.html}
    </div>`;
  el.querySelector('.shot').style.clipPath = frame.clip;
  el.querySelector('.msg').textContent = `${messages[filter]} ♡`;
  const types = filter === 'all' ? ['sunrise', 'sunset'] : filter === 'fav' ? [] : [filter];
  if (types.length) {
    const row = document.createElement('span');
    row.className = 'add-row';
    types.forEach(type => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'glass-btn';
      btn.textContent = `+ ${type}`;
      btn.addEventListener('click', () => openForm(null, type));
      row.append(btn);
    });
    el.querySelector('.shot').append(row);
  }
  return el;
}

// ---------- filters ----------
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('is-active', c === chip);
      c.setAttribute('aria-pressed', String(c === chip));
    });
    render();
  });
});

// ---------- favourites ----------
async function toggleFav(id, fromWall) {
  const sky = skies.find(s => s.id === id);
  if (!sky) return;
  sky.fav = !sky.fav;
  await db.put(sky);
  render();
  if (fromWall) {
    const heart = wall.querySelector(`[data-id="${CSS.escape(id)}"] .heart`);
    if (heart) heart.focus();
  }
  if ($('#viewDialog').open) fillView(sky);
}

// ---------- add / edit form ----------
const formDialog = $('#formDialog');
const form = $('#skyForm');
const photoInput = $('#photoInput');
const dropzone = $('#dropzone');
const preview = $('#photoPreview');
const photoError = $('#photoError');

$('#moodList').innerHTML = Object.entries(MOODS)
  .map(([name, color]) =>
    `<label class="mood" style="--c:${color}"><input type="radio" name="mood" value="${name}"><i></i>${name}</label>`)
  .join('');

let editingId = null;
let pendingPhoto = null;
let previewUrl = null;
let touched = { date: false, type: false };

// ownsUrl: the src is an object URL made just for the preview, so revoke it later
function setPreview(src, ownsUrl = false) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = ownsUrl ? src : null;
  if (!src) {
    preview.hidden = true;
    preview.removeAttribute('src');
    dropzone.classList.remove('has-photo');
    $('#dropHint').firstChild.textContent = 'choose a photo';
    return;
  }
  preview.src = src;
  preview.hidden = false;
  dropzone.classList.add('has-photo');
  $('#dropHint').firstChild.textContent = 'change photo';
}

function showPhotoError(msg) {
  photoError.textContent = msg;
  photoError.hidden = !msg;
}

function usePhoto(file) {
  if (!file || !file.type.startsWith('image/')) {
    showPhotoError('that file doesn’t look like an image.');
    return;
  }
  showPhotoError('');
  pendingPhoto = file;
  setPreview(URL.createObjectURL(file), true);

  // guess date + sunrise/sunset from the file, unless already chosen
  if (file.lastModified && !editingId) {
    const taken = new Date(file.lastModified);
    if (!touched.date) form.date.value = todayIso(taken);
    if (!touched.type) form.type.value = taken.getHours() < 12 ? 'sunrise' : 'sunset';
    syncFormTitle();
  }
}

function syncFormTitle() {
  const type = form.type.value || 'sky';
  $('#formTitle').textContent = `${editingId ? 'edit this' : 'add a'} ${type}`;
}

preview.addEventListener('error', () => {
  if (preview.hidden) return;
  showPhotoError('this browser can’t show that format. try a jpg or png (iphone heic photos need converting).');
});

photoInput.addEventListener('change', () => usePhoto(photoInput.files[0]));
['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, () => dropzone.classList.add('is-over')));
['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, () => dropzone.classList.remove('is-over')));
document.addEventListener('paste', e => {
  if (!formDialog.open) return;
  const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
  if (file) { e.preventDefault(); usePhoto(file); }
});
form.date.addEventListener('input', () => { touched.date = true; });
form.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => {
  touched.type = true;
  syncFormTitle();
}));

// type: 'sunrise' | 'sunset' when opened from one of the add buttons
function openForm(id = null, type = null) {
  editingId = id;
  pendingPhoto = null;
  touched = { date: false, type: false };
  form.reset();
  photoInput.value = '';
  showPhotoError('');

  const sky = id && skies.find(s => s.id === id);
  if (sky) {
    form.type.value = sky.type;
    form.date.value = sky.date;
    form.title.value = sky.title || '';
    form.location.value = sky.location || '';
    form.note.value = sky.note || '';
    form.mood.value = sky.mood || 'plain';
    form.fav.checked = !!sky.fav;
    setPreview(photoUrl(sky));
  } else {
    setPreview(null);
    form.type.value = type || (new Date().getHours() < 12 ? 'sunrise' : 'sunset');
    touched.type = !!type;
    form.date.value = todayIso();
    form.mood.value = 'plain';
  }
  syncFormTitle();
  formDialog.showModal();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const existing = editingId && skies.find(s => s.id === editingId);
  if (!pendingPhoto && !existing) {
    showPhotoError('pick a photo of the sky first.');
    photoInput.focus();
    return;
  }
  if (!form.date.value) {
    form.date.focus();
    return;
  }

  const sky = existing || { id: newId(), createdAt: Date.now() };
  sky.type = form.type.value || 'sunset';
  sky.date = form.date.value;
  sky.title = form.title.value.trim();
  sky.location = form.location.value.trim();
  sky.note = form.note.value.trim();
  sky.mood = form.mood.value === 'plain' ? '' : form.mood.value;
  sky.fav = form.fav.checked;
  if (pendingPhoto) {
    sky.photo = pendingPhoto;
    sky.palette = await skyPalette(pendingPhoto);
  }

  try {
    await db.put(sky);
    keepStorage();
  } catch (err) {
    console.error(err);
    toast('couldn’t save that sky. is browser storage full or blocked?');
    return;
  }
  if (!existing) {
    skies.push(sky);
    justAddedId = sky.id;
  }
  sortSkies();
  formDialog.close();
  render();
  if ($('#viewDialog').open) fillView(sky);
  toast(existing ? 'sky updated ♡' : 'saved to your sky wall ♡');
});

formDialog.addEventListener('close', () => setPreview(null));

// ---------- view / edit / delete ----------
const viewDialog = $('#viewDialog');
let viewingId = null;

function fillView(sky) {
  viewingId = sky.id;
  const frame = frameParts(hash(sky.id));
  const fig = $('#viewFrame');
  fig.innerHTML = `<span class="shot"><img></span>${frame.html}`;
  fig.querySelector('.shot').style.clipPath = frame.clip;
  const img = fig.querySelector('img');
  img.src = photoUrl(sky);
  img.alt = `${sky.type}: ${displayTitle(sky)}`;
  $('#viewType').textContent = `${sky.type === 'sunrise' ? '☀ sunrise' : '☾ sunset'} · ${longDate(sky.date)}`;
  $('#viewTitle').textContent = displayTitle(sky);
  $('#viewMeta').textContent = [sky.location, sky.mood && `${sky.mood} sky`].filter(Boolean).join(' · ');
  $('#viewNote').textContent = sky.note ? `“${sky.note}”` : '';
  $('#viewPalette').replaceChildren(...paletteEl(sky.palette, '').children);
  $('#viewFav').textContent = sky.fav ? '♥ kept' : '♡ keep this one';
  $('#viewFav').setAttribute('aria-pressed', String(!!sky.fav));
}

function openView(id) {
  const sky = skies.find(s => s.id === id);
  if (!sky) return;
  fillView(sky);
  if (!viewDialog.open) viewDialog.showModal();
}

$('#viewFav').addEventListener('click', () => toggleFav(viewingId, false));
$('#viewEdit').addEventListener('click', () => openForm(viewingId));
$('#viewDelete').addEventListener('click', async () => {
  const sky = skies.find(s => s.id === viewingId);
  if (!sky) return;
  if (!confirm(`delete "${displayTitle(sky)}" from your wall?\nthis can't be undone.`)) return;
  await db.remove(sky.id);
  skies = skies.filter(s => s.id !== sky.id);
  forgetPhoto(sky.id);
  viewDialog.close();
  render();
  toast('sky removed');
});

// close buttons + click on the backdrop
document.querySelectorAll('dialog').forEach(dlg => {
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
});

// ---------- header actions ----------
document.querySelectorAll('[data-add]').forEach(btn =>
  btn.addEventListener('click', () => openForm(null, btn.dataset.add)));
$('#randomBtn').addEventListener('click', () => {
  if (!skies.length) return;
  let pick = skies[Math.floor(Math.random() * skies.length)];
  if (skies.length > 1 && pick.id === viewingId) {
    pick = skies.filter(s => s.id !== viewingId)[Math.floor(Math.random() * (skies.length - 1))];
  }
  openView(pick.id);
});

// ---------- backup ----------
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const type = head.match(/^data:([^;]+)/)[1];
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

$('#exportBtn').addEventListener('click', async () => {
  if (!skies.length) { toast('nothing to back up yet'); return; }
  toast('packing up your skies…');
  const out = await Promise.all(skies.map(async s => ({ ...s, photo: await blobToDataUrl(s.photo) })));
  const file = new Blob(
    [JSON.stringify({ app: 'my-little-sky-wall', version: 1, exportedAt: new Date().toISOString(), skies: out })],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = `sky-wall-backup-${todayIso()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`backed up ${skies.length} ${skies.length === 1 ? 'sky' : 'skies'}`);
});

$('#importInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.skies)) throw new Error('no skies in file');
    const incoming = data.skies
      .filter(s => s && typeof s.id === 'string'
        && (s.type === 'sunrise' || s.type === 'sunset')
        && /^\d{4}-\d{2}-\d{2}$/.test(s.date)
        && typeof s.photo === 'string' && s.photo.startsWith('data:image/'))
      .map(s => ({
        id: s.id,
        createdAt: Number(s.createdAt) || Date.now(),
        type: s.type,
        date: s.date,
        title: String(s.title || '').slice(0, 60),
        location: String(s.location || '').slice(0, 60),
        note: String(s.note || '').slice(0, 140),
        mood: MOODS[s.mood] ? s.mood : '',
        fav: !!s.fav,
        palette: Array.isArray(s.palette) && s.palette.every(c => /^#[0-9a-f]{6}$/i.test(c)) ? s.palette.slice(0, 5) : null,
        photo: dataUrlToBlob(s.photo),
      }));
    if (!incoming.length) throw new Error('no valid skies');
    await db.putMany(incoming);
    skies = await db.all();
    sortSkies();
    render();
    toast(`restored ${incoming.length} ${incoming.length === 1 ? 'sky' : 'skies'}`);
  } catch (err) {
    console.error(err);
    toast('that doesn’t look like a sky wall backup');
  }
});

// ---------- app: offline, install, durable storage ----------
// Ask the browser not to clear our storage when the device runs low on space.
async function keepStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (e) {}
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('offline mode unavailable', err));
}

let installPrompt = null;
const installBtn = $('#installBtn');
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  toast('sky wall is on your home screen ✿');
});

// ---------- sky palette ----------
// Average the photo in 5 horizontal bands, top to bottom: the sky's own gradient.
async function skyPalette(blob) {
  try {
    const size = 30;
    const bmp = await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    const { data } = ctx.getImageData(0, 0, size, size);
    const bands = 5, bandH = size / bands, out = [];
    for (let b = 0; b < bands; b++) {
      let r = 0, g = 0, bl = 0, n = 0;
      for (let y = b * bandH; y < (b + 1) * bandH; y++) {
        for (let x = 5; x < size - 5; x++) {
          const i = (y * size + x) * 4;
          r += data[i]; g += data[i + 1]; bl += data[i + 2]; n++;
        }
      }
      out.push('#' + [r, g, bl].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join(''));
    }
    return out;
  } catch (e) {
    return null; // e.g. a format the browser can't decode
  }
}

// older skies saved before palettes existed get one now
async function backfillPalettes() {
  const missing = skies.filter(s => s.palette === undefined);
  if (!missing.length) return;
  for (const sky of missing) {
    sky.palette = await skyPalette(sky.photo);
    await db.put(sky);
  }
  render();
}

// ---------- live sky ----------
// Sunrise / sunset for a date and place (the standard NOAA / SunCalc equations).
function sunTimes(date, lat, lng) {
  const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545;
  const d = date.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const lw = rad * -lng, phi = rad * lat;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = rad * (357.5291 + 0.98560028 * ds);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(rad * 23.4397));
  const noon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const cosW = (Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW < -1 || cosW > 1) return null; // polar day or night
  const w = Math.acos(cosW);
  const set = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const rise = noon - (set - noon);
  const fromJ = j => new Date((j + 0.5 - J1970) * dayMs);
  return { rise: fromJ(rise), set: fromJ(set) };
}

const PUNE = { lat: 18.5204, lng: 73.8567, name: 'pune' };
function getPlace() {
  try { return JSON.parse(localStorage.getItem('sky-place')) || PUNE; } catch (e) { return PUNE; }
}

const fmtTime = d => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
function fmtIn(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

const MIN = 60000;
function updateSky() {
  const place = getPlace();
  const now = new Date();
  const at = offsetDays => {
    const d = new Date(now); d.setDate(d.getDate() + offsetDays); d.setHours(12, 0, 0, 0);
    return sunTimes(d, place.lat, place.lng);
  };
  const today = at(0);
  if (!today) return; // polar regions: leave the sky as it is

  const { rise, set } = today;
  let line;
  if (now < rise) {
    line = rise - now <= 45 * MIN
      ? `the sky is waking up, sunrise in ${fmtIn(rise - now)}`
      : `sunrise in ${fmtIn(rise - now)}`;
  } else if (now < set) {
    if (now - rise <= 60 * MIN) line = 'the sun just rose ☀';
    else if (set - now <= 60 * MIN) line = `golden hour, sunset in ${fmtIn(set - now)} ✧`;
    else line = `sunset in ${fmtIn(set - now)}`;
  } else {
    const nextRise = at(1).rise;
    line = now - set <= 45 * MIN
      ? 'the sun just set, look up ♡'
      : `goodnight, sun. sunrise in ${fmtIn(nextRise - now)}`;
  }

  $('#todayLine').textContent = line;
  $('#todayRise').textContent = `☀ ${fmtTime(rise)}`;
  $('#todaySet').textContent = `☾ ${fmtTime(set)}`;
  $('#todayPlace').textContent = place.name;
}

$('#locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('this device can’t share its location'); return; }
  toast('finding your sky…');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const place = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'your spot' };
      try { localStorage.setItem('sky-place', JSON.stringify(place)); } catch (e) {}
      updateSky();
      toast('sky times set for where you are');
    },
    () => toast('couldn’t get your location, staying with pune'),
    { timeout: 10000, maximumAge: 3600000 },
  );
});

updateSky();
setInterval(updateSky, MIN);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateSky(); });

// quick-add bar appears once the sky's add buttons have scrolled up out of view
new IntersectionObserver(([entry]) => {
  $('#quickAdd').classList.toggle('show', !entry.isIntersecting && entry.boundingClientRect.top < 0);
}).observe($('#addRow'));

// ---------- start ----------
db.all()
  .then(list => { skies = list; sortSkies(); render(); if (list.length) keepStorage(); backfillPalettes(); })
  .catch(err => {
    console.error(err);
    render();
    toast('this browser is blocking storage, so skies won’t be saved');
  });
