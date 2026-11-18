// Lista de cumparaturi comuna, fara cont. Datele stau in Supabase (tabelul shopping_items).
// Cheia de mai jos e cea PUBLICA (publishable): e facuta sa stea in browser, iar regulile din baza
// ii permit sa lucreze doar cu tabelul listei.
const SUPABASE_URL = 'https://vlyumivkyfivholhgfda.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7LsjX6z9owt44sliS-6fsQ_Lt5-jWSZ';
const NAME_KEY = 'lista-cumparaturi-nume';
const NBSP = ' ';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const $ = id => document.getElementById(id);

const items = new Map();      // id -> rand din baza
const els = new Map();        // id -> <li>
const qtyTimers = new Map();  // id -> timer (cantitatea se trimite dupa o scurta pauza)
let me = readName();
let addQty = 1;

// ---------- Numele (doar pe acest dispozitiv) ----------
function readName() {
  try { return (localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) { return ''; }
}
function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* fara stocare: tinem numele doar cat e pagina deschisa */ }
}
function showNameCard(show) {
  $('name-card').hidden = !show;
  $('main').hidden = show;
  $('who').hidden = show || !me;
  if (show) { $('name-input').value = me; $('name-input').focus(); }
  else { $('who-name').textContent = me; }
}
$('name-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('name-input').value.trim().slice(0, 40);
  if (!name) return;
  me = name; saveName(name); showNameCard(false); $('add-name').focus();
});
$('change-name').addEventListener('click', () => showNameCard(true));

// ---------- Stare ----------
function setStatus(text, bad = false) {
  $('status').textContent = text;
  $('status').classList.toggle('bad', bad);
}
function failed(err) {
  console.error(err);
  setStatus('Nu s-a putut salva. Verifică internetul, apoi reîncearcă.', true);
  load();
}

// ---------- Afisare ----------
function whenText(iso) {
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `azi,${NBSP}${time}`;
  if (diff === 1) return `ieri,${NBSP}${time}`;
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }).replace(' ', NBSP);
}

function buildItem(id) {
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.id = id;
  li.innerHTML = `
    <button type="button" class="check" data-act="toggle"><span></span></button>
    <textarea class="item-name" rows="1" maxlength="80" enterkeyhint="done" aria-label="Numele produsului"></textarea>
    <div class="stepper">
      <button type="button" class="step" data-act="minus" aria-label="Mai puțin">−</button>
      <output></output>
      <button type="button" class="step" data-act="plus" aria-label="Mai mult">+</button>
    </div>
    <p class="meta"></p>
    <div class="actions"><button type="button" class="del" data-act="delete">Șterge</button></div>`;
  return li;
}

function fillItem(li, it) {
  li.classList.toggle('done', it.done);
  const check = li.querySelector('.check');
  check.setAttribute('aria-label', it.done ? `Pune „${it.name}” înapoi pe listă` : `Marchează „${it.name}” ca luat`);
  check.setAttribute('aria-pressed', String(it.done));
  const input = li.querySelector('.item-name');
  if (document.activeElement !== input && input.value !== it.name) input.value = it.name;
  autosize(input);
  li.querySelector('output').textContent = it.qty;
  li.querySelector('[data-act="minus"]').disabled = it.qty <= 1;
  li.querySelector('.meta').textContent = `adăugat de${NBSP}${it.added_by}${NBSP}· ${whenText(it.created_at)}`;
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
  $('todo-empty').hidden = todo.length > 0;
  $('done-section').hidden = done.length === 0;
}

// ---------- Date din Supabase ----------
async function load() {
  const { data, error } = await sb.from('shopping_items').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); setStatus('Nu pot încărca lista. Verifică internetul.', true); return; }
  const fresh = new Map(data.map(r => [r.id, r]));
  for (const [id, local] of items) if (qtyTimers.has(id) && fresh.has(id)) fresh.get(id).qty = local.qty;
  items.clear();
  for (const [id, r] of fresh) items.set(id, r);
  render();
  setStatus(live ? 'Sincronizat. Modificările apar pe toate telefoanele.' : 'Lista e la zi.');
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
  ids.forEach(id => items.delete(id)); render();
  const { error } = await sb.from('shopping_items').delete().in('id', ids);
  if (error) failed(error);
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
  const original = btn.textContent;
  btn.textContent = label;
  btn.dataset.timer = setTimeout(() => { delete btn.dataset.armed; btn.textContent = original; }, 3000);
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
    case 'delete': armDelete(btn, 'Sigur? Apasă iar', () => remove([id])); break;
  }
});

$('clear-done').addEventListener('click', e => {
  armDelete(e.currentTarget, 'Sigur? Apasă iar', () => {
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
  if (!name || name === it.name) { input.value = it.name; return; }
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
    if (payload.eventType === 'DELETE') items.delete(payload.old.id);
    else {
      const row = payload.new;
      if (qtyTimers.has(row.id)) row.qty = items.get(row.id)?.qty ?? row.qty;
      items.set(row.id, row);
    }
    render();
  })
  .subscribe(status => {
    live = status === 'SUBSCRIBED';
    if (live) setStatus('Sincronizat. Modificările apar pe toate telefoanele.');
  });

// Rezerva: daca timpul real cade, lista se reincarca la revenirea in pagina si la fiecare 30 de secunde.
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
setInterval(() => { if (!document.hidden && !live) load(); }, 30000);

// ---------- Pornire ----------
showNameCard(!me);
load();
