// Lista de cumparaturi comuna, fara cont. Datele stau in Supabase (tabelul shopping_items),
// pozele in Supabase Storage (bucket-ul lista-poze).
// Cheia de mai jos e cea PUBLICA (publishable): e facuta sa stea in browser, iar regulile din baza
// ii permit sa lucreze doar cu tabelul listei si cu bucket-ul ei de poze.
const SUPABASE_URL = 'https://vlyumivkyfivholhgfda.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7LsjX6z9owt44sliS-6fsQ_Lt5-jWSZ';
const BUCKET = 'lista-poze';
const NAME_KEY = 'lista-cumparaturi-nume';
const NBSP = ' ';
const MAX_SIDE = 1200;

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const $ = id => document.getElementById(id);

const items = new Map();      // id -> rand din baza
const els = new Map();        // id -> <li>
const qtyTimers = new Map();  // id -> timer (cantitatea se trimite dupa o scurta pauza)
const uploading = new Set();  // id-uri cu poza in curs de incarcare
const openPhotos = new Set(); // id-uri cu poza marita
let me = readName();
let addQty = 1;
let photoTarget = null;

const ICON_CAMERA = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.2-1.8c.3-.4.7-.7 1.2-.7h3.6c.5 0 .9.3 1.2.7L16.2 6h1.3A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12.3" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---------- Numele (doar pe acest dispozitiv) ----------
function readName() {
  try { return (localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) { return ''; }
}
function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* fara stocare: numele ramane cat e pagina deschisa */ }
}
function showNameCard(show) {
  $('name-card').hidden = !show;
  $('who').hidden = show || !me;
  if (show) { $('name-input').value = me; $('name-input').focus(); }
  else { $('who-name').textContent = me; }
  applyTab();
}
$('name-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('name-input').value.trim().slice(0, 40);
  if (!name) return;
  me = name; saveName(name); showNameCard(false);
  if (currentTab() === 'lista') $('add-name').focus();
});

// ---------- File: Lista / Retete (adresa #lista sau #retete) ----------
function currentTab() { return location.hash === '#retete' ? 'retete' : 'lista'; }
function applyTab() {
  const ready = !!me && $('name-card').hidden;
  const tab = currentTab();
  $('tabs').hidden = !ready;
  $('main').hidden = !ready || tab !== 'lista';
  $('recipes-view').hidden = !ready || tab !== 'retete';
  document.querySelectorAll('.tab').forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', applyTab);

// ---------- Grame: "600 g", "1,2 kg" ----------
function fmtGrams(g) {
  const n = Number(g);
  if (!n) return '';
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toLocaleString('ro-RO')}${NBSP}kg`;
  return `${(n < 10 ? Math.round(n * 10) / 10 : Math.round(n)).toLocaleString('ro-RO')}${NBSP}g`;
}
const sameName = (a, b) => a.trim().toLocaleLowerCase('ro-RO') === b.trim().toLocaleLowerCase('ro-RO');

// Pune un ingredient pe lista. Daca exista deja nebifat (acelasi nume), aduna la el.
// packages = numarul de pachete (sau null cand nu se stie marimea pachetului), grams = totalul in grame.
async function addToList(name, packages, grams) {
  const existing = [...items.values()].find(i => !i.done && sameName(i.name, name));
  const total = Math.round(grams * 100) / 100;
  if (existing) {
    const changes = { grams: Math.round(((Number(existing.grams) || 0) + total) * 100) / 100 };
    if (packages) changes.qty = Math.min(999, existing.qty + packages);
    return update(existing.id, changes);
  }
  const { data, error } = await sb.from('shopping_items')
    .insert({ name: name.trim().slice(0, 80), qty: Math.min(999, packages || 1), grams: total || null, added_by: me })
    .select().single();
  if (error) return failed(error);
  items.set(data.id, data); render();
}
$('change-name').addEventListener('click', () => showNameCard(true));

// ---------- Semn de problema (apare doar cand ceva nu merge) ----------
function problem(text) {
  $('status').textContent = text || '';
  $('status').hidden = !text;
}
function failed(err) {
  console.error(err);
  problem('Nu s-a salvat');
  load();
}

// ---------- Poze ----------
const photoUrl = path => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
const toBlob = (canvas, type, q) => new Promise(r => canvas.toBlob(r, type, q));

// Micsoreaza poza in browser: latura mare maximum 1200 px, WebP (sau JPEG unde WebP nu merge).
async function shrink(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { src = await loadImage(file); }
  const w = src.width, h = src.height, s = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  let blob = await toBlob(canvas, 'image/webp', 0.8);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.82);
  if (blob.size > 900 * 1024) blob = await toBlob(canvas, 'image/jpeg', 0.65);
  return blob;
}

async function removeFiles(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await sb.storage.from(BUCKET).remove(list);
  if (error) console.error(error);
}

async function setPhoto(id, file) {
  const it = items.get(id);
  if (!it || !file) return;
  uploading.add(id); render();
  try {
    const blob = await shrink(file);
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${id}/${Date.now()}.${ext}`;
    const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
    if (up.error) throw up.error;
    const old = items.get(id)?.photo_path;
    await update(id, { photo_path: path });
    if (old && old !== path) removeFiles([old]);
  } catch (err) {
    failed(err);
  } finally {
    uploading.delete(id); render();
  }
}

async function clearPhoto(id) {
  const it = items.get(id);
  if (!it || !it.photo_path) return;
  const old = it.photo_path;
  openPhotos.delete(id);
  await update(id, { photo_path: null });
  removeFiles([old]);
}

$('photo-input').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  const id = photoTarget;
  photoTarget = null; e.target.value = '';
  if (file && id) setPhoto(id, file);
});

// ---------- Afisare ----------
// Cand a fost adaugat: "azi, 15:05", "ieri, 15:05" sau "18 nov, 15:05".
function whenText(iso) {
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `azi,${NBSP}${time}`;
  if (diff === 1) return `ieri,${NBSP}${time}`;
  const date = d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }).replace('.', '').replace(' ', NBSP);
  return `${date},${NBSP}${time}`;
}

function buildItem(id) {
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.id = id;
  li.innerHTML = `
    <button type="button" class="check" data-act="toggle"><span></span></button>
    <textarea class="item-name" rows="1" maxlength="80" enterkeyhint="done" aria-label="Produs"></textarea>
    <div class="stepper">
      <button type="button" class="step" data-act="minus" aria-label="Mai puțin">−</button>
      <output></output>
      <button type="button" class="step" data-act="plus" aria-label="Mai mult">+</button>
    </div>
    <p class="meta"></p>
    <div class="actions">
      <button type="button" class="icon-btn camera" data-act="camera" aria-label="Poză">${ICON_CAMERA}</button>
      <button type="button" class="thumb" data-act="photo-toggle" aria-label="Mărește poza"><img alt=""></button>
      <button type="button" class="del" data-act="delete">Șterge</button>
    </div>
    <div class="photo-big">
      <button type="button" class="big" data-act="photo-toggle" aria-label="Micșorează poza"><img alt=""></button>
      <div class="photo-tools">
        <button type="button" class="icon-btn" data-act="camera" aria-label="Înlocuiește poza">${ICON_CAMERA}</button>
        <button type="button" class="icon-btn" data-act="photo-remove" aria-label="Scoate poza">${ICON_TRASH}</button>
      </div>
    </div>`;
  return li;
}

function fillItem(li, it) {
  li.classList.toggle('done', it.done);
  const check = li.querySelector('.check');
  check.setAttribute('aria-label', it.name);
  check.setAttribute('aria-pressed', String(it.done));
  const input = li.querySelector('.item-name');
  if (document.activeElement !== input && input.value !== it.name) input.value = it.name;
  autosize(input);
  li.querySelector('output').textContent = it.qty;
  li.querySelector('[data-act="minus"]').disabled = it.qty <= 1;
  const grams = fmtGrams(it.grams);
  const meta = li.querySelector('.meta');
  meta.textContent = `adăugat de${NBSP}${it.added_by}${NBSP}· ${whenText(it.created_at)}`;
  if (grams) {
    const g = document.createElement('strong');
    g.className = 'grams';
    g.textContent = grams;
    meta.prepend(g, `${NBSP}· `);
  }

  const hasPhoto = !!it.photo_path, busy = uploading.has(it.id);
  li.classList.toggle('has-photo', hasPhoto);
  li.classList.toggle('busy', busy);
  li.classList.toggle('open', hasPhoto && openPhotos.has(it.id));
  if (!hasPhoto) openPhotos.delete(it.id);
  if (hasPhoto) {
    const url = photoUrl(it.photo_path);
    for (const img of li.querySelectorAll('.thumb img, .big img')) if (img.getAttribute('src') !== url) img.src = url;
  }
}

// Casuta numelui creste pe cate randuri are nevoie, ca numele lungi sa se vada intregi.
function autosize(el) {
  if (!el.isConnected) { requestAnimationFrame(() => el.isConnected && autosize(el)); return; }
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
document.addEventListener('input', e => { if (e.target.classList?.contains('item-name')) autosize(e.target); });
window.addEventListener('resize', () => document.querySelectorAll('.item-name').forEach(autosize));

function placeInOrder(container, list) {
  list.forEach((it, i) => {
    const el = els.get(it.id);
    if (container.children[i] !== el) container.insertBefore(el, container.children[i] || null);
  });
}

function render() {
  const all = [...items.values()];
  const todo = all.filter(i => !i.done).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const done = all.filter(i => i.done).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id);

  for (const [id, el] of els) if (!items.has(id)) { el.remove(); els.delete(id); }
  for (const it of all) {
    if (!els.has(it.id)) els.set(it.id, buildItem(it.id));
    fillItem(els.get(it.id), it);
  }
  placeInOrder($('todo'), todo);
  placeInOrder($('done'), done);

  $('todo-count').textContent = todo.length ? `(${todo.length})` : '';
  $('done-count').textContent = done.length ? `(${done.length})` : '';
  $('done-section').hidden = done.length === 0;
}

// ---------- Date din Supabase ----------
async function load() {
  const { data, error } = await sb.from('shopping_items').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); problem('Fără conexiune'); return; }
  const fresh = new Map(data.map(r => [r.id, r]));
  for (const [id, local] of items) if (qtyTimers.has(id) && fresh.has(id)) fresh.get(id).qty = local.qty;
  items.clear();
  for (const [id, r] of fresh) items.set(id, r);
  render();
  problem('');
}

async function update(id, changes) {
  const { data, error } = await sb.from('shopping_items').update(changes).eq('id', id).select().single();
  if (error) return failed(error);
  if (data) {
    if (qtyTimers.has(id)) data.qty = items.get(id)?.qty ?? data.qty;
    items.set(id, data); render();
  }
}

async function remove(ids) {
  const photos = ids.map(id => items.get(id)?.photo_path);
  ids.forEach(id => { items.delete(id); openPhotos.delete(id); }); render();
  const { error } = await sb.from('shopping_items').delete().in('id', ids);
  if (error) return failed(error);
  removeFiles(photos);
}

// ---------- Adaugare ----------
function setAddQty(n) {
  addQty = Math.max(1, Math.min(999, n));
  $('add-qty').textContent = addQty;
  $('add-minus').disabled = addQty <= 1;
}
$('add-minus').addEventListener('click', () => setAddQty(addQty - 1));
$('add-plus').addEventListener('click', () => setAddQty(addQty + 1));
setAddQty(1);

$('add-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('add-name').value.trim().slice(0, 80);
  if (!name) return;
  const btn = e.submitter || $('add-form').querySelector('[type="submit"]');
  btn.disabled = true;
  const { data, error } = await sb.from('shopping_items').insert({ name, qty: addQty, added_by: me }).select().single();
  btn.disabled = false;
  if (error) return failed(error);
  items.set(data.id, data); render();
  $('add-name').value = ''; setAddQty(1); $('add-name').focus();
  const el = els.get(data.id);
  if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 700); }
});

// ---------- Actiuni pe produse ----------
function armDelete(btn, label, onConfirm) {
  if (btn.dataset.armed) { clearTimeout(+btn.dataset.timer); onConfirm(); return; }
  btn.dataset.armed = '1';
  const original = btn.innerHTML;
  btn.textContent = label;
  btn.dataset.timer = setTimeout(() => { delete btn.dataset.armed; btn.innerHTML = original; }, 3000);
}

function changeQty(id, delta) {
  const it = items.get(id);
  if (!it) return;
  const next = Math.max(1, Math.min(999, it.qty + delta));
  if (next === it.qty) return;
  it.qty = next; render();
  clearTimeout(qtyTimers.get(id));
  qtyTimers.set(id, setTimeout(async () => {
    qtyTimers.delete(id);
    await update(id, { qty: items.get(id)?.qty ?? next });
  }, 400));
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const li = btn.closest('.item');
  const id = li ? Number(li.dataset.id) : null;
  const it = id ? items.get(id) : null;
  switch (btn.dataset.act) {
    case 'toggle': if (it) { it.done = !it.done; it.updated_at = new Date().toISOString(); render(); update(id, { done: it.done }); } break;
    case 'minus': changeQty(id, -1); break;
    case 'plus': changeQty(id, +1); break;
    case 'delete': armDelete(btn, 'Sigur?', () => remove([id])); break;
    case 'camera': photoTarget = id; $('photo-input').click(); break;
    case 'photo-toggle': if (openPhotos.has(id)) openPhotos.delete(id); else openPhotos.add(id); render(); break;
    case 'photo-remove': armDelete(btn, 'Sigur?', () => clearPhoto(id)); break;
  }
});

$('clear-done').addEventListener('click', e => {
  armDelete(e.currentTarget, 'Sigur?', () => {
    const ids = [...items.values()].filter(i => i.done).map(i => i.id);
    if (ids.length) remove(ids);
  });
});

// Numele produsului se modifica direct in casuta; se salveaza la Enter sau cand iesi din ea.
function commitName(input) {
  const id = Number(input.closest('.item').dataset.id);
  const it = items.get(id);
  if (!it) return;
  const name = input.value.trim().slice(0, 80);
  if (!name || name === it.name) { input.value = it.name; autosize(input); return; }
  it.name = name; update(id, { name });
}
document.addEventListener('keydown', e => {
  if (!e.target.classList?.contains('item-name')) return;
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  if (e.key === 'Escape') { const it = items.get(Number(e.target.closest('.item').dataset.id)); if (it) e.target.value = it.name; e.target.blur(); }
});
document.addEventListener('focusout', e => { if (e.target.classList?.contains('item-name')) commitName(e.target); });

// ---------- Timp real ----------
let live = false;
sb.channel('lista-cumparaturi')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, payload => {
    if (payload.eventType === 'DELETE') { items.delete(payload.old.id); openPhotos.delete(payload.old.id); }
    else {
      const row = payload.new;
      if (qtyTimers.has(row.id)) row.qty = items.get(row.id)?.qty ?? row.qty;
      items.set(row.id, row);
    }
    render();
  })
  .subscribe(status => {
    live = status === 'SUBSCRIBED';
    if (live) problem('');
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') problem('Fără conexiune');
  });

// Rezerva: daca timpul real cade, lista se reincarca la revenirea in pagina si la fiecare 30 de secunde.
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
setInterval(() => { if (!document.hidden && !live) load(); }, 30000);

// ---------- Pornire ----------
showNameCard(!me);
load();
