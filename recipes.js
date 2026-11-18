// Retete comune: fiecare e salvata pentru o portie. Se deschid pe loc, alegi portiile, apoi
// "Adauga in lista" pune ingredientele pe lista (cu pachete, daca se stie marimea pachetului).
// Retetele noi se introduc direct in baza de date; aici doar se citesc si se modifica pe loc.
// Foloseste din app.js: sb, $, items, addToList, fmtGrams, failed, problem, autosize, NBSP, ICON_TRASH.

const recipes = new Map();      // id -> reteta
const ingredients = new Map();  // id -> ingredient
const packs = new Map();        // name_key -> marimea pachetului
const portions = new Map();     // id reteta -> portii alese (implicit 1)
const openRecipes = new Set();
const recEls = new Map();
const ingEls = new Map();

const packKey = name => name.trim().toLocaleLowerCase('ro-RO');
const num = v => Number(v);
const parseGrams = text => {
  const n = Number(String(text).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
};
const plainNum = n => (Math.round(num(n) * 100) / 100).toLocaleString('ro-RO', { maximumFractionDigits: 2, useGrouping: false });
const packagesFor = (total, size) => Math.max(1, Math.ceil(total / size - 1e-9));
const packWord = n => (n === 1 ? 'pachet' : n < 20 ? 'pachete' : 'de pachete');

// ---------- Afisare ----------
function buildRecipe(id) {
  const li = document.createElement('li');
  li.className = 'recipe';
  li.dataset.rid = id;
  li.innerHTML = `
    <div class="recipe-head">
      <textarea class="recipe-name" rows="1" maxlength="120" enterkeyhint="done" aria-label="Rețetă" readonly></textarea>
      <button type="button" class="chevron" data-ract="toggle" aria-label="Deschide"><span></span></button>
      <p class="meta recipe-meta"></p>
    </div>
    <div class="recipe-body">
      <div class="portions">
        <span class="portions-label">Porții</span>
        <div class="stepper">
          <button type="button" class="step" data-ract="pminus" aria-label="Mai puține porții">−</button>
          <output></output>
          <button type="button" class="step" data-ract="pplus" aria-label="Mai multe porții">+</button>
        </div>
      </div>
      <ul class="ingredients"></ul>
      <div class="recipe-actions">
        <button type="button" class="btn" data-ract="add">Adaugă în listă</button>
        <button type="button" class="del" data-ract="delete-recipe">Șterge rețeta</button>
      </div>
    </div>`;
  return li;
}

function buildIngredient(id) {
  const li = document.createElement('li');
  li.className = 'ing';
  li.dataset.iid = id;
  li.innerHTML = `
    <textarea class="ing-name" rows="1" maxlength="80" enterkeyhint="done" aria-label="Ingredient"></textarea>
    <p class="ing-total"></p>
    <button type="button" class="icon-btn ing-del" data-ract="delete-ing" aria-label="Scoate ingredientul">${ICON_TRASH}</button>
    <div class="ing-fields">
      <label class="field"><input type="text" class="num-input" data-field="per" inputmode="decimal" enterkeyhint="done" aria-label="Grame pe porție"><span>g/porție</span></label>
      <label class="field"><span>pachet</span><input type="text" class="num-input" data-field="pack" inputmode="decimal" enterkeyhint="done" aria-label="Mărimea pachetului în grame"><span>g</span></label>
    </div>`;
  return li;
}

function setValue(el, value) {
  if (document.activeElement !== el && el.value !== value) el.value = value;
}

function fillIngredient(li, ing, n) {
  const total = num(ing.grams_per_portion) * n;
  const pack = packs.get(packKey(ing.name));
  setValue(li.querySelector('.ing-name'), ing.name);
  autosize(li.querySelector('.ing-name'));
  setValue(li.querySelector('[data-field="per"]'), plainNum(ing.grams_per_portion));
  setValue(li.querySelector('[data-field="pack"]'), pack ? plainNum(pack.grams) : '');
  const k = pack ? packagesFor(total, num(pack.grams)) : 0;
  li.querySelector('.ing-total').textContent = pack ? `${fmtGrams(total)}${NBSP}· ${k}${NBSP}${packWord(k)}` : fmtGrams(total);
}

function fillRecipe(li, r) {
  const open = openRecipes.has(r.id);
  const n = portions.get(r.id) || 1;
  li.classList.toggle('open', open);
  const name = li.querySelector('.recipe-name');
  name.readOnly = !open;
  setValue(name, r.name);
  autosize(name);
  const chev = li.querySelector('.chevron');
  chev.setAttribute('aria-expanded', String(open));
  chev.setAttribute('aria-label', open ? 'Închide' : 'Deschide');
  li.querySelector('.recipe-meta').textContent = `adăugată de${NBSP}${r.added_by}`;
  li.querySelector('.portions output').textContent = n;
  li.querySelector('[data-ract="pminus"]').disabled = n <= 1;

  const list = li.querySelector('.ingredients');
  const mine = [...ingredients.values()].filter(i => i.recipe_id === r.id).sort((a, b) => a.position - b.position || a.id - b.id);
  mine.forEach((ing, idx) => {
    if (!ingEls.has(ing.id)) ingEls.set(ing.id, buildIngredient(ing.id));
    const el = ingEls.get(ing.id);
    fillIngredient(el, ing, n);
    if (list.children[idx] !== el) list.insertBefore(el, list.children[idx] || null);
  });
  li.querySelector('[data-ract="add"]').disabled = mine.length === 0;
}

function renderRecipes() {
  for (const [id, el] of ingEls) if (!ingredients.has(id)) { el.remove(); ingEls.delete(id); }
  for (const [id, el] of recEls) if (!recipes.has(id)) { el.remove(); recEls.delete(id); openRecipes.delete(id); }
  const list = $('recipes');
  const sorted = [...recipes.values()].sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  sorted.forEach((r, idx) => {
    if (!recEls.has(r.id)) recEls.set(r.id, buildRecipe(r.id));
    const el = recEls.get(r.id);
    fillRecipe(el, r);
    if (list.children[idx] !== el) list.insertBefore(el, list.children[idx] || null);
  });
  $('recipes-empty').hidden = sorted.length > 0;
}

// ---------- Date ----------
async function loadRecipes() {
  const [r, i, p] = await Promise.all([
    sb.from('recipes').select('*'),
    sb.from('recipe_ingredients').select('*'),
    sb.from('package_sizes').select('*'),
  ]);
  const err = r.error || i.error || p.error;
  if (err) { console.error(err); problem('Fără conexiune'); return; }
  recipes.clear(); r.data.forEach(x => recipes.set(x.id, x));
  ingredients.clear(); i.data.forEach(x => ingredients.set(x.id, x));
  packs.clear(); p.data.forEach(x => packs.set(x.name_key, x));
  renderRecipes();
}

async function saveRow(table, map, id, changes) {
  const { data, error } = await sb.from(table).update(changes).eq('id', id).select().single();
  if (error) { failed(error); return loadRecipes(); }
  if (data) { map.set(id, data); renderRecipes(); }
}

async function savePack(name, grams) {
  const key = packKey(name);
  if (grams === null) {
    packs.delete(key); renderRecipes();
    const { error } = await sb.from('package_sizes').delete().eq('name_key', key);
    if (error) { failed(error); loadRecipes(); }
    return;
  }
  const { data, error } = await sb.from('package_sizes')
    .upsert({ name_key: key, name: name.trim().slice(0, 80), grams }, { onConflict: 'name_key' }).select().single();
  if (error) { failed(error); return loadRecipes(); }
  packs.set(key, data); renderRecipes();
}

async function addRecipeToList(rid, btn) {
  const n = portions.get(rid) || 1;
  const mine = [...ingredients.values()].filter(i => i.recipe_id === rid).sort((a, b) => a.position - b.position || a.id - b.id);
  btn.disabled = true;
  for (const ing of mine) {
    const total = num(ing.grams_per_portion) * n;
    const pack = packs.get(packKey(ing.name));
    await addToList(ing.name, pack ? packagesFor(total, num(pack.grams)) : null, total);
  }
  btn.textContent = 'Adăugat';
  setTimeout(() => { btn.textContent = 'Adaugă în listă'; btn.disabled = false; }, 1800);
}

// ---------- Actiuni ----------
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-ract]');
  const nameBox = e.target.closest('.recipe-name');
  if (nameBox && nameBox.readOnly) {
    const rid = Number(nameBox.closest('.recipe').dataset.rid);
    openRecipes.add(rid); renderRecipes(); return;
  }
  if (!btn) return;
  const rli = btn.closest('.recipe');
  const rid = rli ? Number(rli.dataset.rid) : null;
  switch (btn.dataset.ract) {
    case 'toggle':
      if (openRecipes.has(rid)) openRecipes.delete(rid); else openRecipes.add(rid);
      renderRecipes(); break;
    case 'pminus': portions.set(rid, Math.max(1, (portions.get(rid) || 1) - 1)); renderRecipes(); break;
    case 'pplus': portions.set(rid, Math.min(99, (portions.get(rid) || 1) + 1)); renderRecipes(); break;
    case 'add': addRecipeToList(rid, btn); break;
    case 'delete-recipe':
      armDelete(btn, 'Sigur?', async () => {
        recipes.delete(rid);
        [...ingredients.values()].filter(i => i.recipe_id === rid).forEach(i => ingredients.delete(i.id));
        renderRecipes();
        const { error } = await sb.from('recipes').delete().eq('id', rid);
        if (error) { failed(error); loadRecipes(); }
      });
      break;
    case 'delete-ing': {
      const iid = Number(btn.closest('.ing').dataset.iid);
      armDelete(btn, 'Sigur?', async () => {
        ingredients.delete(iid); renderRecipes();
        const { error } = await sb.from('recipe_ingredients').delete().eq('id', iid);
        if (error) { failed(error); loadRecipes(); }
      });
      break;
    }
  }
});

// Campurile se salveaza la Enter sau cand iesi din ele.
function commitRecipeField(el) {
  if (el.classList.contains('recipe-name')) {
    if (el.readOnly) return;
    const rid = Number(el.closest('.recipe').dataset.rid), r = recipes.get(rid);
    const v = el.value.trim().slice(0, 120);
    if (!r) return;
    if (!v || v === r.name) { el.value = r.name; autosize(el); return; }
    r.name = v; saveRow('recipes', recipes, rid, { name: v });
    return;
  }
  const ili = el.closest('.ing');
  if (!ili) return;
  const iid = Number(ili.dataset.iid), ing = ingredients.get(iid);
  if (!ing) return;
  if (el.classList.contains('ing-name')) {
    const v = el.value.trim().slice(0, 80);
    if (!v || v === ing.name) { el.value = ing.name; autosize(el); return; }
    ing.name = v; saveRow('recipe_ingredients', ingredients, iid, { name: v });
  } else if (el.dataset.field === 'per') {
    const g = parseGrams(el.value);
    if (g === null || g === num(ing.grams_per_portion)) { el.value = plainNum(ing.grams_per_portion); return; }
    ing.grams_per_portion = g; renderRecipes();
    saveRow('recipe_ingredients', ingredients, iid, { grams_per_portion: g });
  } else if (el.dataset.field === 'pack') {
    const current = packs.get(packKey(ing.name));
    if (!el.value.trim()) { if (current) savePack(ing.name, null); return; }
    const g = parseGrams(el.value);
    if (g === null) { el.value = current ? plainNum(current.grams) : ''; return; }
    if (current && g === num(current.grams)) return;
    savePack(ing.name, g);
  }
}
const isRecipeField = el => el.matches?.('.recipe-name, .ing-name, .num-input');
document.addEventListener('focusout', e => { if (isRecipeField(e.target)) commitRecipeField(e.target); });
document.addEventListener('keydown', e => {
  if (!isRecipeField(e.target)) return;
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
});
document.addEventListener('input', e => { if (e.target.matches?.('.recipe-name, .ing-name')) autosize(e.target); });

// ---------- Timp real ----------
function applyChange(map, keyOf) {
  return payload => {
    if (payload.eventType === 'DELETE') map.delete(keyOf(payload.old));
    else map.set(keyOf(payload.new), payload.new);
    renderRecipes();
  };
}
sb.channel('retete')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, payload => {
    if (payload.eventType === 'DELETE') {
      const rid = payload.old.id;
      recipes.delete(rid);
      [...ingredients.values()].filter(i => i.recipe_id === rid).forEach(i => ingredients.delete(i.id));
      renderRecipes();
    } else applyChange(recipes, x => x.id)(payload);
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_ingredients' }, applyChange(ingredients, x => x.id))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'package_sizes' }, applyChange(packs, x => x.name_key))
  .subscribe(status => { if (status === 'SUBSCRIBED') loadRecipes(); });

document.addEventListener('visibilitychange', () => { if (!document.hidden) loadRecipes(); });
loadRecipes();
