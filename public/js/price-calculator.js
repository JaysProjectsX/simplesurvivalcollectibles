const backendUrl = '/api';
const accRoot = document.getElementById('accRoot');
const crateSidebar = document.getElementById('crateSidebar');
const preloader = document.getElementById('preloader');
let selectedEconomy = 'Phoenix';
let currentItem = null;
let allCrates = [];
let currentCrate = null;
let searchTerm = '';

// === Utility ===
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

function redirectHome() {
  location.replace('/');
}

// === Auth + Init ===
(async function init() {
  try {
    const me = await fetch(`${backendUrl}/me`, { credentials: 'include' });
    if (!me.ok) return redirectHome();
    const user = await me.json();
    if (user.role !== 'Admin' && user.role !== 'SysAdmin') return redirectHome();

    document.body.hidden = false;
    await loadCrates();
  } catch (err) {
    console.error('Initialization failed:', err);
    redirectHome();
  } finally {
    hidePreloader();
  }
})();

// === Load Crates ===
async function loadCrates() {
  const res = await fetch(`${backendUrl}/calculator/crates`, { credentials: 'include' });
  const data = await res.json();
  allCrates = data?.crates || [];

  renderSidebar(allCrates);

  const firstBtn = crateSidebar.querySelector('.crate-btn');
  if (firstBtn) firstBtn.click();
}

// === Sidebar Rendering (flat buttons grouped by category) ===
function renderSidebar(crates) {
  const cosmetic = crates.filter(c => !!c.is_cosmetic);
  const other = crates.filter(c => !c.is_cosmetic);
  crateSidebar.innerHTML = '';

  crateSidebar.appendChild(makeCrateGroup('Cosmetic Crates', cosmetic));
  crateSidebar.appendChild(makeCrateGroup('Other Crates', other));
}

function makeCrateGroup(title, list) {
  const group = document.createElement('div');
  group.className = 'crate-group';
  group.innerHTML = `<div class="pc-section-title">${title}</div>`;
  list.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'crate-btn';
    btn.textContent = prettyCrateName(c.crate_name);
    btn.addEventListener('click', () => {
      crateSidebar.querySelectorAll('.crate-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('crateTitle').textContent = prettyCrateName(c.crate_name);
      document.getElementById('crateCount').textContent = `${c.items?.length || 0} items`;
      currentCrate = c;
      renderItemsAsAccordions(c);
    });
    group.appendChild(btn);
  });
  return group;
}

// === Search ===
document.getElementById('searchInput').addEventListener('input', e => {
  searchTerm = e.target.value.trim().toLowerCase();
  if (currentCrate) renderItemsAsAccordions(currentCrate);
});

// === Item Accordions ===
function renderItemsAsAccordions(crate) {
  accRoot.innerHTML = '';
  const groups = crate.items.reduce((acc, it) => {
    const key = it.set_name || 'Unknown';
    (acc[key] ||= []).push(it);
    return acc;
  }, {});
  const setNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  setNames.forEach(setName => {
    const items = groups[setName].slice().sort((a, b) => a.item_name.localeCompare(b.item_name));

    const wrap = document.createElement('div');
    wrap.className = 'acc-item';
    wrap.innerHTML = `
      <button class="acc-btn" type="button">
        <span class="acc-title">${setName}</span>
        <span class="acc-count">Total items: ${items.length}</span>
        <span class="acc-icon" aria-hidden="true">
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
      tr.innerHTML = `
        <td>${it.item_name}</td>
        <td>${it.set_name || ''}</td>
        <td>${it.icon_url ? `<img src="${it.icon_url}" alt="${it.item_name}">` : ''}</td>
        <td><button class="money-btn" data-item-id="${it.id}">💰</button></td>
      `;
      tbody.appendChild(tr);
    });

    accRoot.appendChild(wrap);
  });

  accRoot.querySelectorAll('.money-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.itemId));
  });
}

function togglePanel(panel, btn) {
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.acc-panel.open').forEach(p => {
    p.classList.remove('open');
    p.style.maxHeight = null;
    p.previousElementSibling?.classList.remove('active');
  });
  if (!isOpen) {
    panel.classList.add('open');
    panel.style.maxHeight = panel.scrollHeight + 'px';
    btn.classList.add('active');
  }
}

// === Modal ===
async function openModal(itemId) {
  const modal = document.getElementById('priceModal');
  const itemRes = await fetch(`${backendUrl}/prices/${itemId}`, { credentials: 'include' });
  const item = await itemRes.json();
  currentItem = item;
  document.getElementById('itemName').textContent = item.item_name || 'Item';

  const cerbBtn = document.getElementById('cerberusBtn');
  const isCerb = (item.crate_name || '').toLowerCase().includes('cerberus');
  cerbBtn.style.display = isCerb ? 'inline-block' : 'none';
  if (!isCerb && selectedEconomy === 'Cerberus') selectedEconomy = 'Phoenix';

  updateEconomyDisplay();
  await loadComments(itemId);

  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('show'));
  modal.querySelector('.close-btn').onclick = () => closeModal(modal);
}

function closeModal(modal) {
  modal.classList.remove('show');
  setTimeout(() => modal.classList.add('hidden'), 300);
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
