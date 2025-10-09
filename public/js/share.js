// ===== Config =====
const BACKEND_API = 'https://simplesurvivalcollectibles.site';

// ===== Utilities =====
function tokenFromPath() {
  // expects /s/<token>
  const parts = location.pathname.split('/').filter(Boolean);
  return parts[1] || '';
}

function prettyCrateName(s) {
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function byName(a, b) {
  return a.item_name.localeCompare(b.item_name);
}

// ===== State =====
const state = {
  snapshot: null,
  currentCrate: null,
  search: ''
};

// ===== DOM =====
const $user = () => document.getElementById('shareUser');
const $crateList = () => document.getElementById('crateList');
const $crateTitle = () => document.getElementById('crateTitle');
const $crateCount = () => document.getElementById('crateCount');
const $accRoot = () => document.getElementById('accRoot');
const $search = () => document.getElementById('searchInput');
const $created = () => document.getElementById('shareCreated');
const $expires = () => document.getElementById('shareExpires');

function startSidebarExpiryCountdown(expiresAt) {
  const tick = () => {
    const ms = expiresAt - Date.now();
    if (ms <= 0) {
      $expires().textContent = 'Expired';
      setTimeout(() => { window.location.replace('/?redirectReason=shareExpired'); }, 250);
      return;
    }
    const m = String(Math.floor(ms / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    $expires().textContent = `Expires in ${m}:${s}`;
    requestAnimationFrame(tick);
  };
  tick();
}

// ===== Search Helpers =====
function openPanel(panelEl, btnEl) {
  document.querySelectorAll('.acc-panel.open').forEach((p) => {
    p.classList.remove('open');
    p.style.maxHeight = null;
    p.previousElementSibling?.classList.remove('active');
  });
  panelEl.classList.add('open');
  panelEl.style.maxHeight = panelEl.scrollHeight + 'px';
  btnEl.classList.add('active');
}

function scrollRowIntoView(container, target) {
  const cRect = container.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const top =
    container.scrollTop +
    (tRect.top - cRect.top) -
    (container.clientHeight / 2 - target.offsetHeight / 2);
  container.scrollTo({ top, behavior: 'smooth' });
}

function focusFirstSearchHit() {
  const hit = document.querySelector('#accRoot tr.search-hit');
  if (!hit) return;
  const panel = hit.closest('.acc-panel');
  const btn = panel.previousElementSibling;
  const container = document.scrollingElement || document.documentElement;
  if (!panel.classList.contains('open')) openPanel(panel, btn);
  setTimeout(() => scrollRowIntoView(container, hit), 250);
}

function isCosmeticCrate(name) {
  return /cosmetic/i.test(name || '');
}

function sectionTitleEl(text) {
  const t = document.createElement('div');
  t.className = 'share-username';
  t.textContent = text;
  return t;
}

function dividerEl() {
  const hr = document.createElement('hr');
  hr.className = 'collections-divider';
  return hr;
}

function renderSidebarFromSnapshot() {
  const root = $crateList();
  root.innerHTML = '';

  // Top identity + meta
  const meta = document.createElement('div');
  meta.className = 'share-meta';
  meta.innerHTML = `
    <div class="share-title">Available Crates</div>
    `;
  root.appendChild(meta);

  // Split crates by is_cosmetic (backend now provides it)
  const cosmetic = [];
  const other = [];
  for (const c of state.snapshot.crates) {
    (c.is_cosmetic ? cosmetic : other).push(c);
  }

  // Helper to add a section
  const addSection = (title, crates) => {
    if (!crates.length) return;
    const header = document.createElement('div');
    header.className = 'share-section-title';
    header.textContent = title;
    root.appendChild(header);

    const group = document.createElement('div');
    group.className = 'crate-group';
    crates.forEach(c => {
      const b = document.createElement('button');
      b.className = 'crate-btn';
      b.textContent = prettyCrateName(c.name);
      b.addEventListener('click', () => selectCrate(c, b));
      group.appendChild(b);
    });
    root.appendChild(group);
  };

  // Sections: Cosmetic Crates, Other Crates
  addSection('Cosmetic Crates', cosmetic);
  addSection('Other Crates', other);

  // Auto-select first available
  const firstBtn = root.querySelector('.crate-group .crate-btn');
  firstBtn?.click();
}

// ===== Init =====
(async function init() {
  const pre = document.getElementById('preloader');
  try {
    const token = tokenFromPath();
    const r = await fetch(`${BACKEND_API}/api/share-links/${token}`);
    if (!r.ok) throw new Error('Link invalid or expired');

    const { snapshot, createdAt, expiresAt } = await r.json();
    state.snapshot = snapshot;

    $user().textContent = `Shared by ${snapshot.user?.username ?? 'Unknown'}`;
    document.title = `${snapshot.user?.username ?? 'Shared'} — Collections`;
    if (createdAt) $created().textContent = `Link created: ${new Date(Number(createdAt)).toLocaleString()}`;
    if (expiresAt) startSidebarExpiryCountdown(Number(expiresAt));

    // === Sidebar rendering ===
    renderSidebarFromSnapshot();

    // Auto-select first crate
    const first = $crateList().querySelector('button');
    first?.click();

    // Wire search
    $search().addEventListener('input', () => {
        state.search = $search().value.trim().toLowerCase();
        if (state.currentCrate) {
            renderAccordions(state.currentCrate);
            if (state.search) {
            const first = document.querySelector('#accRoot tbody tr.match');
            if (first) {
                first.classList.add('search-hit');
                focusFirstSearchHit();
            }
            }
        }
        });
  } catch (e) {
    // Friendly failure
    document.body.innerHTML = `
      <div style="padding:2rem;max-width:720px;margin:0 auto;text-align:center;">
        <h2>Link not available</h2>
        <p>This share link is invalid or has expired.</p>
      </div>`;
  } finally {
    if (pre) pre.style.display = 'none';
  }
})();

// ===== Crate selection =====
function selectCrate(crate, btn) {
  state.currentCrate = crate;
  // active button
  document.querySelectorAll('.crate-btn').forEach((x) => x.classList.remove('active'));
  btn.classList.add('active');

  // KPI
  const owned = new Set(crate.owned.map(Number));
  const total = crate.items.length;
  const collected = crate.items.filter((i) => owned.has(Number(i.id))).length;

  $crateTitle().textContent = prettyCrateName(crate.name);
  $crateCount().textContent = `${collected}/${total} items`;

  renderAccordions(crate);
}

// ===== Accordions (read-only) =====
function renderAccordions(crate) {
  const root = $accRoot();
  root.innerHTML = '';

  const owned = new Set(crate.owned.map(Number));
  // Group by set_name
  const groups = crate.items.reduce((acc, it) => {
    const key = it.set_name || 'Unknown';
    (acc[key] ||= []).push(it);
    return acc;
  }, {});

  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  names.forEach((name) => {
    let items = groups[name].slice().sort(byName);

    // Search filter
    const term = state.search;
    if (term) {
      items = items.filter((i) => i.item_name.toLowerCase().includes(term));
    }

    const have = items.filter((i) => owned.has(Number(i.id))).length;

    const item = document.createElement('div');
    item.className = 'acc-item';
    item.innerHTML = `
      <button class="acc-btn" type="button">
        <span class="acc-title">${name}</span>
        <span class="acc-count">Total items collected: ${have}/${items.length}</span>
        <span class="acc-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
        </span>
      </button>
      <div class="acc-panel"><div class="acc-panel-inner">
        <table class="acc-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Item Set</th>
              <th>Icon</th>
              <th>Collected</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (it) => `
              <tr>
                <td>${it.item_name}</td>
                <td>${it.set_name || ''}</td>
                <td><img src="${it.icon_url}" alt="${it.item_name}"></td>
                <td>${owned.has(Number(it.id)) ? '✓' : ''}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div></div>
    `;

    const btn = item.querySelector('.acc-btn');
    const panel = item.querySelector('.acc-panel');
    btn.addEventListener('click', () => togglePanel(panel, btn));

    root.appendChild(item);
  });
}

function togglePanel(panel, btn) {
  const isOpen = panel.classList.contains('open');
  document.querySelectorAll('.acc-panel.open').forEach((p) => {
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
