// Comentarii la produsele din lista: un fir mic sub produs, deschis cu butonul cu balon.
// Pe buton: un numar colorat cand sunt comentarii noi scrise de altcineva, nevazute pe acest dispozitiv;
// altfel, discret, cate comentarii are produsul. "Vazut" se tine in localStorage, pe produs.
// Foloseste din app.js: sb, items, els, me, render, sameName, whenText, armDelete, failed, problem, NBSP, ICON_TRASH.

const comments = new Map();   // id -> comentariu
const openThreads = new Set();
const SEEN_KEY = 'lista-comentarii-vazute';   // { idProdus: idUltimulComentariuVazut }
const MINE_KEY = 'lista-comentarii-mele';     // id-urile comentariilor trimise de pe acest dispozitiv

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* fara stocare: "vazut" tine cat e pagina deschisa */ }
}
const seen = readJson(SEEN_KEY, {});
const mine = new Set(readJson(MINE_KEY, []));

const isMine = c => mine.has(c.id) || sameName(c.author, me);
const commentsOf = itemId => [...comments.values()].filter(c => c.item_id === itemId).sort((a, b) => a.id - b.id);
const unseenCount = itemId => commentsOf(itemId).filter(c => c.id > (seen[itemId] || 0) && !isMine(c)).length;

function markSeen(itemId) {
  const list = commentsOf(itemId);
  if (!list.length) return;
  const last = list[list.length - 1].id;
  if ((seen[itemId] || 0) < last) { seen[itemId] = last; writeJson(SEEN_KEY, seen); }
}

function buildComment(c) {
  const li = document.createElement('li');
  li.className = 'comment';
  li.dataset.cid = c.id;
  li.innerHTML = `
    <div class="c-head"><strong class="c-author"></strong><span class="c-time"></span>
      <button type="button" class="c-del" data-cact="delete" aria-label="Șterge comentariul">${ICON_TRASH}</button></div>
    <p class="c-body"></p>`;
  li.querySelector('.c-author').textContent = c.author;
  li.querySelector('.c-time').textContent = whenText(c.created_at);
  li.querySelector('.c-body').textContent = c.body;
  return li;
}

// Apelata din app.js pentru fiecare produs, la fiecare afisare.
function fillComments(li, it) {
  const id = it.id, list = commentsOf(id), open = openThreads.has(id);
  if (open) markSeen(id);
  li.classList.toggle('thread-open', open);

  const btn = li.querySelector('.talk'), badge = btn.querySelector('.badge');
  const fresh = unseenCount(id);
  btn.setAttribute('aria-expanded', String(open));
  if (fresh) {
    badge.hidden = false; badge.classList.add('new'); badge.textContent = fresh > 9 ? '9+' : fresh;
    btn.setAttribute('aria-label', `Comentarii noi: ${fresh}`);
  } else if (list.length) {
    badge.hidden = false; badge.classList.remove('new'); badge.textContent = list.length > 9 ? '9+' : list.length;
    btn.setAttribute('aria-label', `Comentarii: ${list.length}`);
  } else {
    badge.hidden = true; badge.classList.remove('new');
    btn.setAttribute('aria-label', 'Comentarii');
  }
  if (!open) return;

  const ul = li.querySelector('.comments');
  const wanted = new Set(list.map(c => String(c.id)));
  [...ul.children].forEach(el => { if (!wanted.has(el.dataset.cid)) el.remove(); });
  list.forEach((c, idx) => {
    let el = ul.querySelector(`[data-cid="${c.id}"]`);
    if (!el) el = buildComment(c);
    el.querySelector('.c-time').textContent = whenText(c.created_at);
    if (ul.children[idx] !== el) ul.insertBefore(el, ul.children[idx] || null);
  });
}

// ---------- Date ----------
async function loadComments() {
  const { data, error } = await sb.from('item_comments').select('*').order('id');
  if (error) { console.error(error); problem('Fără conexiune'); return; }
  comments.clear();
  data.forEach(c => comments.set(c.id, c));
  render();
}

async function sendComment(form) {
  const li = form.closest('.item');
  const itemId = Number(li.dataset.id);
  const input = form.querySelector('.comment-input');
  const body = input.value.trim().slice(0, 1000);
  if (!body || !items.has(itemId)) return;
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  const { data, error } = await sb.from('item_comments').insert({ item_id: itemId, author: me, body }).select().single();
  btn.disabled = false;
  if (error) return failed(error);
  mine.add(data.id); writeJson(MINE_KEY, [...mine].slice(-500));
  comments.set(data.id, data);
  input.value = '';
  render();
  input.focus();
}

// ---------- Actiuni ----------
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-cact]');
  if (!btn) return;
  const li = btn.closest('.item');
  const itemId = li ? Number(li.dataset.id) : null;
  if (btn.dataset.cact === 'toggle') {
    if (openThreads.has(itemId)) openThreads.delete(itemId);
    else {
      openThreads.add(itemId);
      if (!commentsOf(itemId).length) requestAnimationFrame(() => li.querySelector('.comment-input')?.focus());
    }
    render();
  } else if (btn.dataset.cact === 'delete') {
    const cid = Number(btn.closest('.comment').dataset.cid);
    armDelete(btn, 'Sigur?', async () => {
      comments.delete(cid); render();
      const { error } = await sb.from('item_comments').delete().eq('id', cid);
      if (error) { failed(error); loadComments(); }
    });
  }
});

document.addEventListener('submit', e => {
  if (!e.target.classList.contains('comment-form')) return;
  e.preventDefault();
  sendComment(e.target);
});
document.addEventListener('keydown', e => {
  if (!e.target.classList?.contains('comment-input')) return;
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); }
});

// ---------- Timp real ----------
sb.channel('comentarii')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'item_comments' }, payload => {
    if (payload.eventType === 'DELETE') comments.delete(payload.old.id);
    else comments.set(payload.new.id, payload.new);
    render();
  })
  .subscribe(status => { if (status === 'SUBSCRIBED') loadComments(); });

document.addEventListener('visibilitychange', () => { if (!document.hidden) loadComments(); });
loadComments();
