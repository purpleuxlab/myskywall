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
const TILTS = [-3, 2, -1.5, 2.5, -2, 1.5, -2.5, 1];
const STRING_SVG = '<svg class="string" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M-1 6 Q50 34 101 6"/></svg>';
const sag = t => 6 + 56 * t * (1 - t); // y of the string path above at fraction t

const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

const BURST = (() => {
  const pts = [];
  for (let i = 0; i < 28; i++) {
    const r = i % 2 ? 25 : 31;
    const a = (Math.PI * 2 * i) / 28;
    pts.push(`${(32 + r * Math.cos(a)).toFixed(1)} ${(32 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
})();
function stickerSvg(type) {
  const arrow = type === 'sunrise' ? 'M32 25V14M27.5 18.5 32 14l4.5 4.5' : 'M32 14v11M27.5 20.5 32 25l4.5-4.5';
  return `<svg viewBox="0 0 64 64"><path class="burst" d="${BURST}"/>
    <path class="sun" d="M23 42a9 9 0 0 1 18 0Z"/>
    <path class="glyph" d="M18 42h28M${arrow.slice(1)}"/></svg>`;
}

// ---------- state ----------
let skies = [];
let filter = 'all';
let columns = 0;
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
function columnCount() {
  const w = wall.clientWidth;
  return w >= 860 ? 3 : w >= 520 ? 2 : 1;
}

function render() {
  columns = columnCount();
  $('#statSunrise').textContent = skies.filter(s => s.type === 'sunrise').length;
  $('#statSunset').textContent = skies.filter(s => s.type === 'sunset').length;
  $('#statTotal').textContent = skies.length;
  $('#randomBtn').disabled = skies.length === 0;

  const list = visibleSkies();
  wall.replaceChildren();
  if (!list.length) {
    wall.append(makeLine([emptyCard()], 1));
  } else {
    // one labelled group per month, each hung on its own strings
    const months = new Map();
    list.forEach(sky => {
      const key = sky.date.slice(0, 7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(sky);
    });
    months.forEach((group, key) => {
      wall.append(monthLabel(key, group.length));
      for (let i = 0; i < group.length; i += columns) {
        wall.append(makeLine(group.slice(i, i + columns).map(makeCard)));
      }
    });
  }
  justAddedId = null;
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

function makeLine(cards, cols = columns) {
  const row = document.createElement('div');
  row.className = 'line';
  row.style.setProperty('--cols', cols);
  row.innerHTML = STRING_SVG;
  cards.forEach((card, i) => {
    card.style.setProperty('--drop', `${sag((i + 0.5) / cols)}px`);
    row.append(card);
  });
  return row;
}

function makeCard(sky) {
  const el = document.createElement('article');
  el.className = 'polaroid' + (sky.id === justAddedId ? ' is-new' : '');
  el.dataset.id = sky.id;
  el.style.setProperty('--tilt', `${TILTS[hash(sky.id) % TILTS.length]}deg`);
  el.style.setProperty('--frame', MOODS[sky.mood] || MOODS.plain);
  el.innerHTML = `
    <span class="pin" aria-hidden="true"></span>
    <button class="polaroid-open" type="button">
      <span class="photo"><img loading="lazy" decoding="async"></span>
      <span class="caption"><span class="cap-title"></span><span class="cap-meta"></span></span>
    </button>
    <button class="heart" type="button">${HEART_SVG}</button>
    <span class="sticker ${sky.type}" aria-hidden="true">${stickerSvg(sky.type)}</span>`;

  const title = displayTitle(sky);
  const img = el.querySelector('img');
  img.src = photoUrl(sky);
  img.alt = `${sky.type}: ${title}`;
  el.querySelector('.cap-title').textContent = title;
  el.querySelector('.cap-meta').textContent =
    [shortDate(sky.date), sky.title ? sky.location : ''].filter(Boolean).join(' · ');
  if (sky.palette) el.querySelector('.caption').append(paletteEl(sky.palette, 'palette'));
  el.querySelector('.polaroid-open').addEventListener('click', () => openView(sky.id));

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
  const el = document.createElement('article');
  el.className = 'polaroid empty';
  el.style.setProperty('--tilt', '-2deg');
  el.innerHTML = `
    <span class="pin" aria-hidden="true"></span>
    <div class="polaroid-open">
      <span class="photo"><span class="msg"></span></span>
      <span class="caption"><span class="cap-title">&nbsp;</span></span>
    </div>`;
  el.querySelector('.msg').textContent = messages[filter];
  const types = filter === 'all' ? ['sunrise', 'sunset'] : filter === 'fav' ? [] : [filter];
  if (types.length) {
    const row = document.createElement('span');
    row.className = 'sky-add';
    types.forEach(type => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-${type === 'sunrise' ? 'rise' : 'set'}`;
      btn.textContent = `+ ${type}`;
      btn.addEventListener('click', () => openForm(null, type));
      row.append(btn);
    });
    el.querySelector('.photo').append(row);
    el.querySelector('.cap-title').textContent = 'soon';
  }
  return el;
}

new ResizeObserver(() => {
  if (columnCount() !== columns) render();
}).observe(wall);

// ---------- filters ----------
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('is-active', c === chip);
      c.setAttribute('aria-pressed', String(c === chip));
    });
    document.body.dataset.filter = filter;
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
  toast(existing ? 'sky updated' : 'pinned to the wall ✿');
});

formDialog.addEventListener('close', () => setPreview(null));

// ---------- view / edit / delete ----------
const viewDialog = $('#viewDialog');
let viewingId = null;

function fillView(sky) {
  viewingId = sky.id;
  $('#viewFrame').style.setProperty('--frame', MOODS[sky.mood] || MOODS.plain);
  $('#viewImg').src = photoUrl(sky);
  $('#viewImg').alt = `${sky.type}: ${displayTitle(sky)}`;
  $('#viewType').textContent = sky.type === 'sunrise' ? '☀ sunrise' : '☾ sunset';
  $('#viewTitle').textContent = displayTitle(sky);
  $('#viewDate').textContent = longDate(sky.date);
  $('#viewMeta').textContent = [sky.location, sky.mood && `${sky.mood} sky`].filter(Boolean).join(' · ');
  $('#viewNote').textContent = sky.note ? `“${sky.note}”` : '';
  $('#viewPalette').replaceChildren(...paletteEl(sky.palette, '').children);
  $('#viewFav').textContent = sky.fav ? '♥ a keeper' : '♡ favourite';
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

// theme
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function syncThemeLabel() {
  $('#themeToggle').setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
  // match the phone's status bar to the chosen theme
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    m.content = isDark() ? '#2A2125' : '#FAEAF0';
  });
}
$('#themeToggle').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('sky-theme', next); } catch (e) {}
  syncThemeLabel();
});
syncThemeLabel();

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
  let phase, kicker, headline, sub, t, moon = false;

  // t = position along the arc (0 = left horizon, 1 = right); the moon takes the night arc
  if (now < rise) {
    if (rise - now <= 45 * MIN) {
      phase = 'dawn'; kicker = 'the sky is waking up'; headline = `sunrise in ${fmtIn(rise - now)}`; sub = 'go find a window ☀';
      t = -0.03;
    } else {
      const prevSet = at(-1).set;
      phase = 'night'; kicker = 'night owl hours'; headline = `sunrise in ${fmtIn(rise - now)}`; sub = `at ${fmtTime(rise)}`;
      t = (now - prevSet) / (rise - prevSet); moon = true;
    }
  } else if (now < set) {
    t = (now - rise) / (set - rise);
    if (now - rise <= 60 * MIN) {
      phase = 'dawn'; kicker = 'morning glow'; headline = 'the sun just rose'; sub = `at ${fmtTime(rise)}. still pink out there?`;
    } else if (set - now <= 60 * MIN) {
      phase = 'golden'; kicker = 'golden hour ✶'; headline = `sunset in ${fmtIn(set - now)}`; sub = 'go look up.';
    } else {
      phase = 'day'; kicker = 'today'; headline = `sunset in ${fmtIn(set - now)}`; sub = `at ${fmtTime(set)}`;
    }
  } else {
    const nextRise = at(1).rise;
    if (now - set <= 45 * MIN) {
      phase = 'dusk'; kicker = 'afterglow'; headline = 'the sun just set'; sub = `at ${fmtTime(set)}. the sky's still glowing`;
      t = 1.03;
    } else {
      phase = 'night'; kicker = 'goodnight, sun'; headline = `sunrise in ${fmtIn(nextRise - now)}`; sub = `tomorrow at ${fmtTime(nextRise)}`;
      t = (now - set) / (nextRise - set); moon = true;
    }
  }

  $('#sky').dataset.phase = phase;
  $('#skyKicker').textContent = kicker;
  $('#skyHeadline').textContent = headline;
  $('#skySub').textContent = sub;
  $('#skyRise').textContent = `☀ ${fmtTime(rise)}`;
  $('#skySet').textContent = `☾ ${fmtTime(set)}`;
  $('#skyPlace').textContent = place.name;

  const body = $('#skyBody');
  body.classList.toggle('is-moon', moon);
  const k = Math.min(1.05, Math.max(-0.05, t));
  const x = (1 - k) ** 2 * 40 + 2 * k * (1 - k) * 500 + k ** 2 * 960;
  const y = (1 - k) ** 2 * 270 + 2 * k * (1 - k) * -50 + k ** 2 * 270;
  body.style.left = `${x / 10}%`;
  body.style.top = `${(y / 320) * 100}%`;
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
}).observe($('.sky-add'));

// ---------- start ----------
db.all()
  .then(list => { skies = list; sortSkies(); render(); if (list.length) keepStorage(); backfillPalettes(); })
  .catch(err => {
    console.error(err);
    render();
    toast('this browser is blocking storage, so skies won’t be saved');
  });
