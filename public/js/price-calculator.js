const backendUrl = '/api';
const accRoot = document.getElementById('accRoot');
const crateSidebar = document.getElementById('crateSidebar');
const preloader = document.getElementById('preloader');
let selectedEconomy = 'Phoenix';
let currentItem = null;

function hidePreloader() {
  if (!preloader) return;
  preloader.style.opacity = '0';
  preloader.style.transition = 'opacity 0.6s ease';
  setTimeout(() => (preloader.style.display = 'none'), 600);
}

(async function init() {
  try {
    const res = await fetch(`${backendUrl}/me`, { credentials: 'include' });
    if (!res.ok) return redirectHome();
    const user = await res.json();

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

function redirectHome() {
  location.replace('/');
}

async function loadCrates() {
  const res = await fetch(`${backendUrl}/calculator/crates`, { credentials: 'include' });
  const { crates } = await res.json();
  renderSidebar(crates);
}

// ===== Sidebar Accordion Rendering =====
function renderSidebar(crates) {
  const cosmetic = crates.filter(c => c.is_cosmetic);
  const other = crates.filter(c => !c.is_cosmetic);

  crateSidebar.innerHTML = '';
  crateSidebar.appendChild(makeAccordion('Cosmetic Crates', cosmetic));
  crateSidebar.appendChild(makeAccordion('Other Crates', other));

  // Attach accordion behavior
  document.querySelectorAll('.pc-acc-btn').forEach(btn => {
    btn.addEventListener('click', () => togglePanel(btn.nextElementSibling, btn));
  });
}

function makeAccordion(title, list) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pc-acc-wrapper';
  wrapper.innerHTML = `
    <button class="pc-acc-btn" type="button">
      <span>${title}</span>
      <svg class="pc-acc-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M7 10l5 5 5-5z"/>
      </svg>
    </button>
    <div class="pc-acc-panel">
      <div class="pc-acc-inner">
        ${list.map(c => `
          <button class="pc-crate-btn" onclick="selectCrate(${c.id}, '${c.name}')">${c.name}</button>
        `).join('')}
      </div>
    </div>
  `;
  return wrapper;
}

function togglePanel(panel, btn) {
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.pc-acc-panel.open').forEach(p => {
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

// ===== Crate and Modal Logic =====
async function selectCrate(id, name) {
  const res = await fetch(`${backendUrl}/calculator/crates`, { credentials: 'include' });
  const { crates } = await res.json();
  const crate = crates.find(c => c.id === id);
  renderItems(crate);
  document.getElementById('crateTitle').textContent = name;
  document.getElementById('crateCount').textContent = crate.items.length + ' items';
}

function renderItems(crate) {
  accRoot.innerHTML = '';
  crate.items.forEach(it => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <span>${it.item_name}</span>
      <button class="money-btn" onclick="openModal(${it.id})">💰</button>
    `;
    accRoot.appendChild(row);
  });
}

async function openModal(itemId) {
  const modal = document.getElementById('priceModal');
  const itemRes = await fetch(`${backendUrl}/prices/${itemId}`);
  const item = await itemRes.json();
  currentItem = item;
  document.getElementById('itemName').textContent = item.item_name;

  const cerberusBtn = document.getElementById('cerberusBtn');
  cerberusBtn.style.display = item.crate_name?.toLowerCase().includes('cerberus')
    ? 'inline-block'
    : 'none';

  updateEconomyDisplay();
  await loadComments(itemId);

  modal.classList.remove('hidden');
  modal.querySelector('.close-btn').onclick = () => modal.classList.add('hidden');
}

function updateEconomyDisplay() {
  const base = document.getElementById('baseValue');
  const max = document.getElementById('maxValue');
  const avg = document.getElementById('avgValue');
  const it = currentItem;

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
    selectedEconomy = btn.dataset.econ;
    updateEconomyDisplay();
    loadComments(currentItem.id);
  });
});

// ===== Comments =====
async function loadComments(itemId) {
  const res = await fetch(`${backendUrl}/comments?itemId=${itemId}&economy=${selectedEconomy}`);
  const comments = await res.json();
  const list = document.getElementById('commentList');
  list.innerHTML = comments.length
    ? comments.map(c => `<div><b>${c.minecraft_username ?? c.username}:</b> ${c.comment}</div>`).join('')
    : '<p>No comments yet.</p>';
}

document.getElementById('submitComment').onclick = async () => {
  const comment = document.getElementById('commentBox').value.trim();
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
    document.getElementById('commentBox').value = '';
    loadComments(currentItem.id);
  } else alert(out.error);
};

document.getElementById('commentBox').addEventListener('input', e => {
  document.getElementById('charCount').textContent = e.target.value.length;
});
