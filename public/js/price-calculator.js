/* ===== Price Calculator ===== */
const backendUrl = '/api';

/* --- DOM --- */
const preloader    = document.getElementById('preloader');
const accRoot      = document.getElementById('accRoot');
const crateSidebar = document.getElementById('crateSidebar');
const searchInput  = document.getElementById('searchInput');

let selectedEconomy = 'Phoenix';
let currentItem     = null;

/* cache */
const cache = {
  cosmetic: [],
  other: [],
  itemsByCrate: new Map(), // crateId -> items[]
};
let currentCrate = null;
let searchTerm = '';

/* ---------- helpers ---------- */
const fmtCrateName = (s='') =>
  s.replace(/([a-z])([A-Z])/g, '$1 $2')
   .replace(/_/g, ' ')
   .replace(/\b\w/g, m => m.toUpperCase());

const byName = (a,b) => a.item_name.localeCompare(b.item_name);

/* preloader */
function hidePreloader() {
  if (!preloader) return;
  preloader.style.transition = 'opacity .4s ease';
  preloader.style.opacity = '0';
  setTimeout(() => (preloader.style.display = 'none'), 400);
}

/* early gate: auth + role, then show */
(async function earlyGate() {
  try {
    // try /me; if 401, try one silent refresh and retry once (same pattern as collections)
    let me = await fetch(`${backendUrl}/me`, { credentials: 'include' });
    if (me.status === 401) {
      await fetch(`${backendUrl}/refresh`, { method: 'POST', credentials: 'include' });
      me = await fetch(`${backendUrl}/me`, { credentials: 'include' });
    }
    if (!me.ok) return location.replace('/');

    const user = await me.json();
    if (user.role !== 'Admin' && user.role !== 'SysAdmin') return location.replace('/');

    // passed — reveal page
    document.body.hidden = false;

    // wire search
    searchInput?.addEventListener('input', () => {
      searchTerm = searchInput.value.trim().toLowerCase();
      if (currentCrate) renderSetsAsAccordions(currentCrate);
    });

    await loadSidebarData();       // crates for sidebar
    openFirstAccordionAndSelect(); // UX: open Cosmetic + select first crate
  } catch (e) {
    console.error('Gate/init failed:', e);
    location.replace('/');
  } finally {
    hidePreloader();
  }
})();

/* ---------- data loaders (match your backend) ----------

   We use:
   GET /api/crates/cosmetic
   GET /api/crates/noncosmetic
   GET /api/crates/:crateId/items

   These routes exist in your backend and return the fields we need.  */
async function loadSidebarData() {
  const [cRes, oRes] = await Promise.all([
    fetch(`${backendUrl}/crates/cosmetic`,    { credentials: 'include' }),
    fetch(`${backendUrl}/crates/noncosmetic`, { credentials: 'include' })
  ]);

  const [cosmetic, other] = await Promise.all([cRes.json(), oRes.json()]);
  cache.cosmetic = cosmetic || [];
  cache.other    = other || [];

  renderSidebar(cache.cosmetic, cache.other);
}

/* lazy-load items for a crate and cache */
async function getItems(crateId) {
  if (cache.itemsByCrate.has(crateId)) return cache.itemsByCrate.get(crateId);
  const res = await fetch(`${backendUrl}/crates/${crateId}/items`, { credentials: 'include' });
  let items = await res.json();
  // keep shape consistent and sortable
  items = Array.isArray(items) ? items.map(it => ({
    id: Number(it.id),
    item_name: it.item_name || '',
    set_name: it.set_name || 'Unknown',
    icon_url: it.icon_url || null
  })) : [];
  cache.itemsByCrate.set(crateId, items);
  return items;
}

/* ---------- sidebar rendering ---------- */
function renderSidebar(cosmeticCrates, otherCrates) {
  crateSidebar.innerHTML = '';

  const makePanel = (title, list) => {
    const wrap = document.createElement('div');
    wrap.className = 'acc-wrapper';

    const items = (list || []).map(c => `
      <button class="crate-btn" type="button" data-crate-id="${c.id}">
        ${fmtCrateName(c.crate_name)}
      </button>
    `).join('');

    wrap.innerHTML = `
      <button class="acc-btn" type="button">
        <span class="acc-title">${title}</span>
        <span class="acc-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M7 10l5 5 5-5z"></path>
          </svg>
        </span>
      </button>
      <div class="acc-panel">
        <div class="acc-panel-inner">${items}</div>
      </div>
    `;
    crateSidebar.appendChild(wrap);

    // panel toggle
    const btn = wrap.querySelector('.acc-btn');
    const pan = wrap.querySelector('.acc-panel');
    btn.addEventListener('click', () => togglePanel(pan, btn));

    // crate click
    wrap.querySelectorAll('.crate-btn').forEach(b =>
      b.addEventListener('click', async () => {
        // active state
        crateSidebar.querySelectorAll('.crate-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');

        const crateId = Number(b.dataset.crateId);
        const items   = await getItems(crateId);

        currentCrate = {
          id: crateId,
          name: b.textContent.trim(),
          items
        };

        document.getElementById('crateTitle').textContent = currentCrate.name;
        document.getElementById('crateCount').textContent = `${items.length} items`;
        renderSetsAsAccordions(currentCrate);
      })
    );
  };

  makePanel('Cosmetic Crates', cosmeticCrates);
  makePanel('Other Crates',    otherCrates);
}

/* open first category and auto-select first crate for UX */
function openFirstAccordionAndSelect() {
  const firstAccBtn = crateSidebar.querySelector('.acc-btn');
  const firstPanel  = firstAccBtn?.nextElementSibling;
  if (firstAccBtn && firstPanel) {
    openPanel(firstPanel, firstAccBtn);
    // select the first crate, if any
    const firstCrateBtn = firstPanel.querySelector('.crate-btn');
    firstCrateBtn?.click();
  }
}

/* accordion helpers */
function togglePanel(panel, btn) {
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.acc-panel.open').forEach(p => {
    if (p !== panel) {
      p.classList.remove('open');
      p.style.maxHeight = null;
      p.previousElementSibling?.classList.remove('active');
    }
  });
  if (!isOpen) openPanel(panel, btn);
  else {
    panel.classList.remove('open');
    panel.style.maxHeight = null;
    btn.classList.remove('active');
  }
}
function openPanel(panel, btn) {
  panel.classList.add('open');
  panel.style.maxHeight = panel.scrollHeight + 'px';
  btn.classList.add('active');
}

/* ---------- center: render one accordion per set ---------- */
function renderSetsAsAccordions(crate) {
  accRoot.innerHTML = '';

  // group by set_name
  const groups = crate.items.reduce((m, it) => {
    const key = it.set_name || 'Unknown';
    (m[key] ||= []).push(it);
    return m;
  }, {});
  const setNames = Object.keys(groups).sort((a,b)=>a.localeCompare(b));

  setNames.forEach(setName => {
    const items = groups[setName].slice().sort(byName);

    const wrap = document.createElement('div');
    wrap.className = 'acc-item';
    wrap.innerHTML = `
      <button class="acc-btn" type="button">
        <span class="acc-title">${setName}</span>
        <span class="acc-count">Total items: ${items.length}</span>
        <span class="acc-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M7 10l5 5 5-5z"></path>
          </svg>
        </span>
      </button>
      <div class="acc-panel">
        <div class="acc-panel-inner">
          <table class="acc-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Item Set</th>
                <th>Icon</th>
                <th></th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    const hdr   = wrap.querySelector('.acc-btn');
    const panel = wrap.querySelector('.acc-panel');
    const tbody = wrap.querySelector('tbody');

    hdr.addEventListener('click', () => togglePanel(panel, hdr));

    items.forEach(it => {
      const match = !searchTerm || it.item_name.toLowerCase().includes(searchTerm);
      if (!match) return;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${it.item_name}</td>
        <td>${it.set_name || ''}</td>
        <td>${it.icon_url ? `<img src="${it.icon_url}" alt="${it.item_name}">` : ''}</td>
        <td><button class="money-btn" data-item-id="${it.id}" title="Open price modal">💰</button></td>
      `;
      tbody.appendChild(tr);
    });

    accRoot.appendChild(wrap);
  });

  // money buttons
  accRoot.querySelectorAll('.money-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(Number(btn.dataset.itemId)));
  });
}

/* ---------- modal / pricing / comments (same endpoints you already added) ---------- */
async function openModal(itemId) {
  const modal = document.getElementById('priceModal');

  const itemRes = await fetch(`${backendUrl}/prices/${itemId}`, { credentials: 'include' });
  const item    = await itemRes.json();
  currentItem   = item;

  document.getElementById('itemName').textContent = item.item_name || 'Item';

  const cerbBtn = document.getElementById('cerberusBtn');
  const isCerb  = (item.crate_name || '').toLowerCase().includes('cerberus');
  cerbBtn.style.display = isCerb ? 'inline-block' : 'none';
  if (!isCerb && selectedEconomy === 'Cerberus') selectedEconomy = 'Phoenix';

  updateEconomyDisplay();
  await loadComments(itemId);

  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('show'));

  const closeBtn = modal.querySelector('.close-btn');
  closeBtn.onclick = () => closeModal(modal);
}

function closeModal(modal) {
  modal.classList.remove('show');
  setTimeout(() => modal.classList.add('hidden'), 300);
}

function updateEconomyDisplay() {
  const it = currentItem || {};
  const baseEl = document.getElementById('baseValue');
  const maxEl  = document.getElementById('maxValue');
  const avgEl  = document.getElementById('avgValue');

  let base, max;
  switch (selectedEconomy) {
    case 'Phoenix':  [base, max] = [it.px_base_value, it.px_max_value]; break;
    case 'Lynx':     [base, max] = [it.lx_base_value, it.lx_max_value]; break;
    case 'Wyvern':   [base, max] = [it.wyv_base_value, it.wyv_max_value]; break;
    case 'Cerberus': [base, max] = [it.cb_base_value, it.cb_max_value]; break;
  }
  baseEl.textContent = base ?? '—';
  maxEl.textContent  = max  ?? '—';
  avgEl.textContent  = (base && max) ? ((+base + +max) / 2).toFixed(2) : '—';

  document.querySelectorAll('.econ-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.econ === selectedEconomy);
  });
}

document.querySelectorAll('.econ-btn').forEach(b => {
  b.addEventListener('click', () => {
    const econ = b.dataset.econ;
    if (econ === 'Cerberus' && b.style.display === 'none') return;
    selectedEconomy = econ;
    updateEconomyDisplay();
    if (currentItem?.id) loadComments(currentItem.id);
  });
});

async function loadComments(itemId) {
  const res = await fetch(`${backendUrl}/comments?itemId=${itemId}&economy=${selectedEconomy}`, {
    credentials: 'include'
  });
  const comments = await res.json();
  const list = document.getElementById('commentList');
  list.innerHTML = (comments && comments.length)
    ? comments.map(c => `<div><b>${c.minecraft_username ?? c.username}:</b> ${c.comment}</div>`).join('')
    : '<p>No comments yet.</p>';
}

document.getElementById('submitComment')?.addEventListener('click', async () => {
  const box = document.getElementById('commentBox');
  const comment = box.value.trim();
  if (!comment) return;
  if (comment.length > 250) return alert('Comment too long');

  const res = await fetch(`${backendUrl}/comments`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId: currentItem.id, economy: selectedEconomy, comment })
  });
  const out = await res.json();
  if (!res.ok) return alert(out.error || 'Failed to post comment');

  box.value = '';
  document.getElementById('charCount').textContent = '0';
  loadComments(currentItem.id);
});

document.getElementById('commentBox')?.addEventListener('input', e => {
  document.getElementById('charCount').textContent = e.target.value.length;
});
