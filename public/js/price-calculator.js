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

// ---- Sidebar Accordion ----
function renderSidebar(crates) {
  const cosmetic = crates.filter(c => c.is_cosmetic);
  const other = crates.filter(c => !c.is_cosmetic);

  crateSidebar.innerHTML = `
    ${makeAccordion('Cosmetic Crates', cosmetic)}
    ${makeAccordion('Other Crates', other)}
  `;

  document.querySelectorAll('.acc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.nextElementSibling;
      btn.classList.toggle('active');
      if (panel.style.maxHeight) {
        panel.style.maxHeight = null;
      } else {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });
}

function makeAccordion(title, list) {
  return `
    <button class="acc-btn">${title}</button>
    <div class="acc-panel">
      ${list
        .map(
          c =>
            `<button class="crate-btn" onclick="selectCrate(${c.id}, '${c.name}')">${c.name}</button>`
        )
        .join('')}
    </div>
  `;
}

// ---- Crate & Modal Logic ----
async function selectCrate(id, name) {
  const res = await fetch(`${backendUrl}/calculator/crates`, { credentials: 'include' });
  const { crates } = await res.json();
  const crate = crates.find(c => c.id === id);
  renderItems(crate);
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

// ---- Economy Display ----
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

// ---- Comments ----
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
