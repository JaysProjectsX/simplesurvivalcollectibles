const backendUrl = '/api';

// DOM
const accRoot = document.getElementById('accRoot');
const crateSidebar = document.getElementById('crateSidebar');
const preloader = document.getElementById('preloader');

// State
let selectedEconomy = 'Phoenix';
let currentItem = null;
let allCrates = [];
let currentCrate = null;
let searchTerm = '';

// ===== HELPER FUNCTIONS =====
function byName(a, b) { return a.item_name.localeCompare(b.item_name); }

function prettyCrateName(s) {
  return (s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, m => m.toUpperCase());
}

function hidePreloader() {
  if (!preloader) return;
  preloader.style.opacity = '0';
  preloader.style.transition = 'opacity 0.6s ease';
  setTimeout(() => (preloader.style.display = 'none'), 600);
}

// ===== IMMEDIATE AUTH CHECK =====
(async function authCheck() {
  try {
    const res = await fetch(`${backendUrl}/me`, { credentials: 'include' });
    if (!res.ok) return redirectHome();
    const user = await res.json();
    if (user.role !== 'Admin' && user.role !== 'SysAdmin') return redirectHome();
    document.body.hidden = false;
    await init(); // only run main init after auth confirmed
  } catch (err) {
    console.error('Authorization failed:', err);
    redirectHome();
  }
})();

function redirectHome() {
  location.replace('/');
}

// ===== SEARCH HANDLER =====
(function attachSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.addEventListener('input', () => {
    searchTerm = input.value.trim().toLowerCase();
    if (currentCrate) renderItemsAsAccordions(currentCrate);
  });
})();

// ===== MAIN INIT =====
async function init() {
  try {
    await loadCrates();
  } catch (err) {
    console.error('Initialization failed:', err);
    redirectHome();
  } finally {
    hidePreloader();
  }
}

// ===== LOAD CRATES =====
async function loadCrates() {
  const res = await fetch(`${backendUrl}/calculator/crates`, { credentials: 'include' });
  const data = await res.json();

  allCrates = (data?.crates || []).map(c => ({
    ...c,
    items: Array.isArray(c.items) ? c.items : []
  }));

  renderSidebar(allCrates);
  crateSidebar.querySelector('.crate-btn')?.click();
}

// ===== SIDEBAR =====
function renderSidebar(crates) {
  const cosmetic = crates.filter(c => !!c.is_cosmetic);
  const other = crates.filter(c => !c.is_cosmetic);

  crateSidebar.innerHTML = '';
  crateSidebar.appendChild(makeCrateAccordion('Cosmetic Crates', cosmetic));
  crateSidebar.appendChild(makeCrateAccordion('Other Crates', other));

  crateSidebar.querySelectorAll('.acc-btn').forEach(btn => {
    btn.addEventListener('click', () => togglePanel(btn.nextElementSibling, btn));
  });
}

function makeCrateAccordion(title, list) {
  const wrap = document.createElement('div');
  wrap.className = 'acc-wrapper';

  const itemsHTML = list.map(c =>
    `<button class="crate-btn" type="button" data-crate-id="${c.id}">
       ${prettyCrateName(c.crate_name)}
     </button>`
  ).join('');

  wrap.innerHTML = `
    <button class="acc-btn" type="button">
      <span class="acc-title">${title}</span>
      <span class="acc-icon arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
      </span>
    </button>
    <div class="acc-panel">
      <div class="acc-panel-inner">${itemsHTML}</div>
    </div>
  `;

  wrap.querySelectorAll('.crate-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.crateId);
      const crate = allCrates.find(c => c.id === id);
      if (!crate) return;

      crateSidebar.querySelectorAll('.crate-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.getElementById('crateTitle').textContent = prettyCrateName(crate.crate_name);
      document.getElementById('crateCount').textContent = `${crate.items.length} items`;

      currentCrate = crate;
      renderItemsAsAccordions(crate);
    });
  });

  return wrap;
}

function togglePanel(panel, btn) {
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.acc-panel.open').forEach(p => {
    p.classList.remove('open');
    p.style.maxHeight = null;
    p.previousElementSibling?.classList.remove('active');
    p.previousElementSibling?.querySelector('.arrow')?.classList.remove('rotated');
  });
  if (!isOpen) {
    panel.classList.add('open');
    panel.style.maxHeight = panel.scrollHeight + 'px';
    btn.classList.add('active');
    btn.querySelector('.arrow')?.classList.add('rotated');
  }
}

// ===== CENTER ACCORDIONS =====
function renderItemsAsAccordions(crate) {
  accRoot.innerHTML = '';

  const groups = crate.items.reduce((acc, it) => {
    const key = it.set_name || 'Unknown';
    (acc[key] ||= []).push(it);
    return acc;
  }, {});
  const setNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  setNames.forEach(setName => {
    const items = groups[setName].slice().sort(byName);

    const wrap = document.createElement('div');
    wrap.className = 'acc-item';
    wrap.innerHTML = `
      <button class="acc-btn" type="button">
        <span class="acc-title">${setName}</span>
        <span class="acc-count">Total items: ${items.length}</span>
        <span class="acc-icon arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
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

    const btn = wrap.querySelector('.acc-btn');
    const panel = wrap.querySelector('.acc-panel');
    const tbody = wrap.querySelector('tbody');
    btn.addEventListener('click', () => togglePanel(panel, btn));

    items.forEach(it => {
      const matches = !searchTerm || it.item_name.toLowerCase().includes(searchTerm);
      if (!matches) return;

      const tr = document.createElement('tr');
      if (matches && searchTerm) tr.classList.add('highlight-row');

      tr.innerHTML = `
        <td>${it.item_name}</td>
        <td>${it.set_name || ''}</td>
        <td>${it.icon_url ? `<img src="${it.icon_url}" alt="${it.item_name}">` : ''}</td>
        <td><button class="money-btn" title="Open Price Modal" data-item-id="${it.id}">💰</button></td>
      `;
      tbody.appendChild(tr);
    });

    accRoot.appendChild(wrap);
  });

  accRoot.querySelectorAll('.money-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(Number(btn.dataset.itemId)));
  });
}

// ===== MODAL / ECONOMIES / COMMENTS =====
async function openModal(itemId) {
  const modal = document.getElementById('priceModal');
  const itemRes = await fetch(`${backendUrl}/prices/${itemId}`);
  const item = await itemRes.json();
  currentItem = item;

  document.getElementById('itemName').textContent = item.item_name || 'Item';
  const cerb = document.getElementById('cerberusBtn');
  const isCerb = (item.crate_name || '').toLowerCase().includes('cerberus');
  cerb.style.display = isCerb ? 'inline-block' : 'none';
  if (!isCerb && selectedEconomy === 'Cerberus') selectedEconomy = 'Phoenix';

  updateEconomyDisplay();
  await loadComments(itemId);

  modal.classList.remove('hidden');
  modal.querySelector('.close-btn').onclick = () => modal.classList.add('hidden');
}

function updateEconomyDisplay() {
  const base = document.getElementById('baseValue');
  const max = document.getElementById('maxValue');
  const avg = document.getElementById('avgValue');
  const it = currentItem || {};

  let baseVal, maxVal;
  switch (selectedEconomy) {
    case 'Phoenix': [baseVal, maxVal] = [it.px_base_value, it.px_max_value]; break;
    case 'Lynx': [baseVal, maxVal] = [it.lx_base_value, it.lx_max_value]; break;
    case 'Wyvern': [baseVal, maxVal] = [it.wyv_base_value, it.wyv_max_value]; break;
    case 'Cerberus': [baseVal, maxVal] = [it.cb_base_value, it.cb_max_value]; break;
  }

  base.textContent = baseVal ?? '—';
  max.textContent = maxVal ?? '—';
  avg.textContent = (baseVal && maxVal) ? ((+baseVal + +maxVal) / 2).toFixed(2) : '—';
  highlightEconomy();
}

function highlightEconomy() {
  document.querySelectorAll('.econ-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.econ === selectedEconomy);
  });
}

document.querySelectorAll('.econ-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const econ = btn.dataset.econ;
    if (econ === 'Cerberus' && btn.style.display === 'none') return;
    selectedEconomy = econ;
    updateEconomyDisplay();
    if (currentItem?.id) loadComments(currentItem.id);
  });
});

async function loadComments(itemId) {
  const res = await fetch(`${backendUrl}/comments?itemId=${itemId}&economy=${selectedEconomy}`);
  const comments = await res.json();
  const list = document.getElementById('commentList');
  list.innerHTML = comments.length
    ? comments.map(c => `<div><b>${c.minecraft_username ?? c.username}:</b> ${c.comment}</div>`).join('')
    : '<p>No comments yet.</p>';
}

document.getElementById('submitComment').onclick = async () => {
  const box = document.getElementById('commentBox');
  const comment = box.value.trim();
  if (!comment) return;
  if (comment.length > 250) return alert('Comment too long');

  const res = await fetch(`${backendUrl}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ itemId: currentItem.id, economy: selectedEconomy, comment })
  });
  const out = await res.json();
  if (res.ok) {
    box.value = '';
    document.getElementById('charCount').textContent = '0';
    loadComments(currentItem.id);
  } else {
    alert(out.error || 'Failed to post comment');
  }
};

document.getElementById('commentBox').addEventListener('input', e => {
  document.getElementById('charCount').textContent = e.target.value.length;
});
