let currentPage = 1;
let _crateUiInitialised = false;
const logsPerPage = 10;
let wizardCurrentStep = 0;

const api = (path, init) =>
AUTH.fetchWithAuth(`${(window.backendUrl || "/api")}${path}`, init);

let newCrateItemsDt = null;
window.newCrateItems = window.newCrateItems || [];
let newCrateItems = window.newCrateItems;
let currentStep = 0;
let newCrateSelectedIndex = null;
let crateWizardInitialized = false;

function escapeHTML(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m] || m));
}

function escapeAttr(str = "") {
  return escapeHTML(str).replace(/`/g, "&#96;");
}


let crateItemsDt = null;
let crateSummaryDt = null;
let currentCrateId = null;
let selectedItemId = null;

// Quick icon presets used in Add/Edit item modals
const QUICK_ICONS = [
  {
    name: "Netherite Sword",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_netherite_sword.png"
  },
  {
    name: "Mace",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_mace.png"
  },
  {
    name: "Bow",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_bow.png"
  },
  {
    name: "Crossbow",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_crossbow.png"
  },
  {
    name: "Netherite Pickaxe",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_netherite_pickaxe.png"
  },
  {
    name: "Netherite Shovel",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_netherite_shovel.png"
  },
  {
    name: "Netherite Axe",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_netherite_axe.png"
  },
  {
    name: "Netherite Hoe",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_netherite_hoe.png"
  },
  {
    name: "Fishing Rod",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_fishing_rod.png"
  },
  {
    name: "Shears",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_shears.png"
  },
  {
    name: "Flint and Steel",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_flint_and_steel.png"
  },
  {
    name: "Shield",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_shield.png"
  },
  {
    name: "Elytra",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_elytra.png"
  },
  {
    name: "Trident",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_trident.png"
  },
  {
    name: "Paper",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_paper.png"
  },
  {
    name: "Turtle Helmet",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_turtle_helmet.png"
  },
  {
    name: "Netherite Helmet",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_netherite_helmet.png"
  },
  {
    name: "Netherite Chestplate",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_netherite_chestplate.png"
  },
  {
    name: "Netherite Leggings",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_netherite_leggings.png"
  },
  {
    name: "Netherite Boots",
    url: "https://mc.nerothe.com/img/1.21.5/minecraft_netherite_boots.png"
  },
];


async function softMe() {
  return fetch(`${backendUrl}/me`, { credentials: 'include' });
}

document.addEventListener("DOMContentLoaded", async () => {

  if (window.waitForAuthReady) {
    try { await window.waitForAuthReady(); } catch {}
  }

  try {
    const res = await softMe();
    if (res.status === 401) {
      // Not logged in, send to 404 page
      window.location.replace('/404');
      return;
    }
    if (!res.ok) throw new Error('Auth check failed');

    const user = await res.json();
    if (user.role !== 'Admin' && user.role !== 'SysAdmin') {
      window.location.replace('/404');
      return;
    }

    const adminContent = document.getElementById("adminContent");
    adminContent.style.display = "flex";
    initializeAdminPanel(user.role);

    initIconPickers();

  } catch (err) {
    console.error("Auth check failed:", err);
    document.body.innerHTML = "";
    window.location.href = "/404";
  }
});

function isLockedOut(user) {
  if (!user || user.failed_attempts === undefined || !user.last_failed_login) return false;

  const failedAttempts = parseInt(user.failed_attempts, 10);
  const lastFailed = new Date(user.last_failed_login);
  const now = new Date();
  const diff = now - lastFailed;

  return failedAttempts >= 3 && diff < 10 * 60 * 1000;
}

function lockoutRemaining(user) {
  if (!user.last_failed_login) return "00:00";

  const lastFailed = new Date(user.last_failed_login);
  if (isNaN(lastFailed.getTime())) return "00:00"; // invalid date

  const now = new Date();
  const elapsed = Math.floor((now - lastFailed) / 1000); // seconds
  const remaining = Math.max(0, 10 * 60 - elapsed); // 10 min lockout

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}



function initializeAdminPanel(role) {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  function showDbDefaultSubtab() {
    // show the dbTab content
    const dbTabContent = document.getElementById("dbTab");
    if (!dbTabContent) return;

    // hide all .db-subtab-content first
    document.querySelectorAll(".db-subtab-content").forEach(el => {
      el.style.display = "none";
    });

    // mark "View / Edit Crates" as active subtab
    const defaultBtn = document.querySelector('.db-subtab-btn[data-tab="view-edit"]');
    if (defaultBtn) {
      document.querySelectorAll(".db-subtab-btn").forEach(b => b.classList.remove("active"));
      defaultBtn.classList.add("active");
    }

    // show the view / edit panel
    const defaultPanel = document.getElementById("db-tab-view-edit");
    if (defaultPanel) {
      defaultPanel.style.display = "block";
    }
  }

  // === Sidebar drawer (mobile / tablet) ===
  const sidebar = document.querySelector(".admin-sidebar");
  const drawerToggle = document.getElementById("sidebarDrawerToggle");
  const drawerBackdrop = document.getElementById("sidebarDrawerBackdrop");

  function closeSidebarDrawer() {
    document.body.classList.remove("sidebar-drawer-open");
  }

  if (sidebar && drawerToggle && drawerBackdrop) {
    drawerToggle.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-drawer-open");
    });

    drawerBackdrop.addEventListener("click", closeSidebarDrawer);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSidebarDrawer();
      }
    });
  }

  // === Active Users DataTable ===
  async function loadActiveUsersTable() {
    const isSysAdmin = role === "SysAdmin";
    const tableSelector = "#activeUsersTable";
    const $table = window.jQuery ? window.jQuery(tableSelector) : null;

    if (!$table || !$table.length) return;

    try {
      const res = await api('/admin/active-users');
      if (!res.ok) throw new Error("Failed to fetch active users");
      const users = await res.json();

      // Helper to build the child-row HTML (SysAdmin only)
      const createDetailsHtml = (u) => `
        <div class="active-user-extra">
          <div><strong>IP Address:</strong> ${escapeHTML(u.last_ip || "—")}</div>
          <div><strong>Location:</strong> ${escapeHTML(u.last_location || "—")}</div>
        </div>
      `;

      // If DataTable already exists, just refresh its data
      if (window.jQuery.fn.dataTable.isDataTable(tableSelector)) {
        const dt = $table.DataTable();
        dt.clear();
        dt.rows.add(users);
        dt.draw();
        return;
      }

      // First-time DataTable init
      const dt = $table.DataTable({
        data: users,
        columns: [
          {
            className: isSysAdmin ? "details-control" : "",
            orderable: false,
            data: null,
            defaultContent: isSysAdmin ? "" : "",
            width: "20px"
          },
          { data: "username" },
          {
            data: "role",
            render: function (data, type) {
              if (type === "display") {
                return `<span class="role-tag ${data}">${escapeHTML(data)}</span>`;
              }
              return data;
            }
          },
          {
            data: "last_login",
            render: function (data, type) {
              if (!data) return "";
              const d = new Date(data);
              if (isNaN(d.getTime())) return escapeHTML(String(data));
              return type === "display" ? d.toLocaleString() : d.toISOString();
            }
          }
        ],
        order: [[1, "asc"]],
        pageLength: 10,
        lengthMenu: [10, 25, 50, 100],
        autoWidth: false
      });

      // Only SysAdmins get the expandable details rows
      if (isSysAdmin) {
        $table
          .find("tbody")
          .on("click", "td.details-control", function () {
            const tr = window.jQuery(this).closest("tr");
            const row = dt.row(tr);

            if (row.child.isShown()) {
              row.child.hide();
              tr.removeClass("shown");
            } else {
              row.child(createDetailsHtml(row.data())).show();
              tr.addClass("shown");
            }
          });
      }
    } catch (err) {
      console.error("Failed to load active users table:", err);
    }
  }

  // Handle switching between top-level tabs
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;

      tabContents.forEach(t => { t.style.display = "none"; });
      tabButtons.forEach(b => b.classList.remove("active"));

      if (tabId === "usersTab") {
        const panel = document.getElementById("usersTab");
        if (panel) panel.style.display = "block";
        loadActiveUsersTable();

      } else if (tabId === "dbTab") {
        const panel = document.getElementById("dbTab");
        if (panel) panel.style.display = "block";

        showDbDefaultSubtab();

        // Initialise the crate UI once
        if (!_crateUiInitialised) {
          _crateUiInitialised = true;
          initCrateSummaryDataTable();
          initCrateItemsDataTable();
          loadCratesAndItems();
        }

      } else if (tabId) {
        // Any other top-level tab
        const panel = document.getElementById(tabId);
        if (panel) panel.style.display = "block";
      }

      btn.classList.add("active");
    });
  });


  tabContents.forEach(tab => (tab.style.display = "none"));
  tabButtons.forEach(b => b.classList.remove("active"));
  const activeUsersBtn = document.querySelector('[data-tab="usersTab"]');
  const activeUsersTab = document.getElementById("usersTab");
  if (activeUsersBtn && activeUsersTab) {
    activeUsersBtn.classList.add("active");
    activeUsersTab.style.display = "block";
    loadActiveUsersTable();
  }

  if (role === "SysAdmin") {
    const sysadminTab = document.getElementById("sysadminTab");
    const rolesTabBtn = document.getElementById("rolesTabBtn");
    const auditTabBtn = document.getElementById("auditTabBtn");

    if (sysadminTab) sysadminTab.style.display = "flex";
    if (rolesTabBtn) rolesTabBtn.style.display = "flex";
    if (auditTabBtn) auditTabBtn.style.display = "flex";

    loadAuditLogs(currentPage);

    // 🆕 Account list (respects filter)
    loadAccountList();
    document.getElementById('userFilter')?.addEventListener('change', () => loadAccountList());

    // Keep Role Management list as-is
    api('/admin/all-users')
      .then(res => res.json())
      .then(data => {
        const roleList = document.getElementById("roleManagementList");
        roleList.innerHTML = data.map(user => `
          <tr>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>
              <select class="role-select" id="role-${user.id}">
                <option value="User" ${user.role === 'User' ? 'selected' : ''}>User</option>
                <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                <option value="SysAdmin" ${user.role === 'SysAdmin' ? 'selected' : ''}>SysAdmin</option>
              </select>
            </td>
            <td><button class="admin-action-btn verify" onclick="changeRole(${user.id})">Update</button></td>
          </tr>
        `).join("");
      });
  }

  // ===== Tasks (Deletion Requests) =====
  const tasksTabBtn = document.querySelector('[data-tab="tasksTab"]');
  const filterEl = document.getElementById('tasksFilter');
  const getArchivedFlag = () => (filterEl?.value === 'archived' ? 1 : 0);

  if (tasksTabBtn && (role === 'Admin' || role === 'SysAdmin')) {
    tasksTabBtn.addEventListener("click", () => loadDeletionRequests(getArchivedFlag()));
    if (tasksTabBtn.classList.contains('active')) {
      loadDeletionRequests(getArchivedFlag());
    }
  }

  filterEl?.addEventListener('change', () => {
    loadDeletionRequests(getArchivedFlag());
  });

  const STATUS_MAP = {
    awaiting:     { label: 'Awaiting Approval', modalClass: 'kbm-awaiting', tagClass: 'awaiting' },
    in_progress:  { label: 'In Progress',       modalClass: 'kbm-inProgress', tagClass: 'in-progress' },
    completed:    { label: 'Completed',         modalClass: 'kbm-completed', tagClass: 'completed' }
  };
  const statusLabel = s => (STATUS_MAP[s]?.label || s);
  const statusTagCls = s => (STATUS_MAP[s]?.tagClass || '');
  const statusModalCls = s => (STATUS_MAP[s]?.modalClass || '');

  // open/close helpers
  window.closeAuditModal = function () {
    const bd = document.getElementById('auditModalBackdrop');
    const box = document.getElementById('auditModal');
    if (!bd) return;
    if (box) { box.classList.remove('fadeIn'); box.classList.add('fadeOut'); }
    setTimeout(()=>{ bd.classList.add('hidden'); if (box) box.classList.remove('fadeOut'); }, 220);
  };

  async function openDeletionAuditModal() {
    // Fill the table first
    await loadDeletionAuditTable();

    // Build footer controls
    const foot = document.getElementById('auditModalFoot') || document.querySelector('#auditModal .kbm-foot');
    if (foot) {
      foot.innerHTML = '';


      if (userRole === 'SysAdmin') {
        const clearBtn = document.createElement('button');
        clearBtn.className = 'kbm-btn danger';
        clearBtn.textContent = 'Clear Audit Log';
        clearBtn.addEventListener('click', clearDeletionAudit);
        foot.appendChild(clearBtn);

        // NEW: Purge archived requests (hard delete)
        const purgeBtn = document.createElement('button');
        purgeBtn.className = 'kbm-btn warn';
        purgeBtn.textContent = 'Purge Archived Requests…';
        purgeBtn.addEventListener('click', openPurgeArchivedDialog);
        foot.appendChild(purgeBtn);
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'kbm-btn';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', window.closeAuditModal);
      foot.appendChild(closeBtn);
    }

    // Show + retrigger fadeIn every time
    const bd = document.getElementById('auditModalBackdrop');
    const modal = document.getElementById('auditModal');
    if (bd && modal) {
      bd.classList.remove('hidden');
      modal.classList.remove('fadeOut', 'fadeIn');   // reset
      void modal.offsetWidth;                        // <-- force reflow
      modal.classList.add('fadeIn');                 // play animation
    }
  }

  document.getElementById('kbAuditBtn')?.addEventListener('click', openDeletionAuditModal);

  async function loadDeletionAuditTable() {
    try {
      const res = await api('/admin/deletion-requests/audit?limit=200');
      const rows = res.ok ? await res.json() : [];
      const tb = document.getElementById('auditTbody');
      if (!tb) return;

      tb.innerHTML = rows.length
        ? rows.map(r => `
            <tr>
              <td>${new Date(r.at_time).toLocaleString()}</td>
              <td><b>${escapeHTML(r.action)}</b></td>
              <td>${r.actor_username ? escapeHTML(r.actor_username) : '—'}</td>
              <td>${escapeHTML(r.username_snapshot)} <span class="kb-subtle">(${escapeHTML(r.email_snapshot)})</span></td>
              <td>${r.note ? escapeHTML(r.note) : '—'}</td>
            </tr>
          `).join('')
        : `<tr><td colspan="5" style="opacity:.7">No audit entries</td></tr>`;
    } catch (e) {
      console.error('Failed to load audit table:', e);
    }
  }

  async function clearDeletionAudit() {
    try {
      const r = await api('/admin/deletion-audit', { method: 'DELETE' });
      if (!r.ok) throw new Error();

      showGlobalModal({
        type: 'success',
        title: 'Audit Cleared',
        message: 'The deletion audit log has been cleared.',
        buttons: [{ label: 'Close', onClick: "fadeOutAndRemove('modal-auditclear-ok')" }],
        id: 'modal-auditclear-ok'
      });

      await loadDeletionAuditTable(); // refresh table in the open modal
    } catch (e) {
      console.error(e);
      showGlobalModal({
        type: 'error',
        title: 'Failed',
        message: 'Could not clear the deletion audit log.',
        buttons: [{ label: 'Close', onClick: "fadeOutAndRemove('modal-auditclear-fail')" }],
        id: 'modal-auditclear-fail'
      });
    }
  }

  // --- replace your existing openPurgeArchivedDialog with this ---
  async function openPurgeArchivedDialog() {
    // 1) initial preview (all ages)
    let preview;
    try {
      const r = await api('/admin/deletion-requests/purge-archived?dry_run=1');
      if (!r.ok) throw new Error();
      preview = await r.json();
    } catch (e) {
      showToast('Could not load purge preview.', 'error');
      return; // ⬅️ do NOT open the modal if preview failed
    }

    const totalWouldDelete =
      (preview.would_delete_requests | 0) + (preview.would_delete_audit | 0);

    if (totalWouldDelete === 0) {
      showToast('There are no archived requests to purge.', 'info');
      return; // ⬅️ nothing to do
    }

    const modalId = `purgePreview-${Date.now()}`;
    const inputId = `purgeAgeDays-${Date.now()}`;

    showGlobalModal({
      type: 'warning',
      title: 'Purge Archived Requests',
      message: `
        <p>This permanently deletes <b>archived</b> deletion requests and their audit rows.</p>
        <div style="margin-top:.5rem">
          <label for="${inputId}">Only older than (days):</label>
          <input id="${inputId}" type="number" min="0" value="0" style="width:7rem">
        </div>
        <p class="kb-subtle" style="margin-top:.5rem">Preview (all ages):</p>
        <p><b>Requests:</b> ${preview.would_delete_requests}<br/>
          <b>Audit rows:</b> ${preview.would_delete_audit}</p>
      `,
      buttons: [
        { label: 'Cancel', onClick: `fadeOutAndRemove('${modalId}')` },
        { label: 'Purge',  onClick: `confirmPurgeArchived('${modalId}','${inputId}')` }
      ],
      id: modalId
    });
  }

  // --- add this helper (inside initializeAdminPanel so it has access to api/etc.) ---
  window.confirmPurgeArchived = async function(modalId, ageInputId) {
    const age = parseInt(document.getElementById(ageInputId)?.value || '0', 10);

    // 2) re-check counts for the chosen age before deleting
    try {
      const previewUrl = `/admin/deletion-requests/purge-archived?dry_run=1` +
        (age > 0 ? `&older_than_days=${age}` : ``);

      const p = await api(previewUrl);
      if (!p.ok) throw new Error();
      const pre = await p.json();

      const noneToDelete =
        ((pre.would_delete_requests | 0) + (pre.would_delete_audit | 0)) === 0;

      if (noneToDelete) {
        showToast('Nothing to purge for that age.', 'info');
        return; // ⬅️ do not call DELETE, so no “purging nothing” audit is created
      }

      // 3) perform the delete
      const delUrl = `/admin/deletion-requests/purge-archived` +
        (age > 0 ? `?older_than_days=${age}` : ``);

      const d = await api(delUrl, { method: 'DELETE' });
      if (!d.ok) throw new Error();
      const result = await d.json();

      fadeOutAndRemove(modalId);
      showToast(`Purged ${result.deleted_requests} request(s) and ${result.deleted_audit} audit row(s).`);

      // Refresh UI
      await loadDeletionAuditTable();
      const archivedNow = document.getElementById('tasksFilter')?.value === 'archived';
      loadDeletionRequests(archivedNow ? 1 : 0);
    } catch (e) {
      showToast('Purge failed.', 'error');
    }
  };

  async function loadDeletionRequests(archived = 0) {
    const data = await api(`/admin/deletion-requests?archived=${archived}`).then(r => r.json()).catch(() => []);

    const A = document.getElementById('kb-awaiting');
    const I = document.getElementById('kb-inprogress');
    const C = document.getElementById('kb-completed');
    [A, I, C].forEach(el => el && (el.innerHTML = ''));

    data.forEach(r => {
      const card = document.createElement('div');
      card.className = `kb-card state-${r.status}`;
      const tag = `<span class="kb-tag ${statusTagCls(r.status)}">${statusLabel(r.status)}</span>`;
      card.innerHTML = `
        <div class="kb-card-top">${tag}</div>
        <h4 class="kb-title">${escapeHTML(r.username_snapshot)} <span class="kb-subtle">(${escapeHTML(r.email_snapshot)})</span></h4>
        <div class="kb-card-bottom">
          <small class="kb-date">${new Date(r.requested_at).toLocaleDateString()}</small>
          ${r.scheduled_delete_at ? `<small class="kb-date">Deletes: ${new Date(r.scheduled_delete_at).toLocaleString()}</small>` : ``}
        </div>
      `;
      card.onclick = () => openDeletionModal(r.id);

      if (r.status === 'awaiting') A.appendChild(card);
      else if (r.status === 'in_progress') I.appendChild(card);
      else if (r.status === 'completed') C.appendChild(card);
    });
  }

  window.closeTaskModal = function(){
    const bd = document.getElementById('taskModalBackdrop');
    const box = document.getElementById('taskModal');
    if (!bd) return;
    if (box) { box.classList.remove('fadeIn'); box.classList.add('fadeOut'); }
    setTimeout(()=>{ bd.classList.add('hidden'); if (box) box.classList.remove('fadeOut'); }, 220);
  };

  async function openDeletionModal(id) {
    const res = await api(`/admin/deletion-requests/${id}`);
    if (!res.ok) return;
    const { request:r, logs } = await res.json();

    // header
    document.getElementById('kbm-title').textContent = 'Account Deletion Request';
    document.getElementById('kbm-userline').innerHTML =
      `${escapeHTML(r.username_snapshot)} <span class="kb-subtle">(${escapeHTML(r.email_snapshot)})</span>`;
    const statusEl = document.getElementById('kbm-status');
    statusEl.textContent = statusLabel(r.status);                     // Awaiting Approval / In Progress / Completed
    statusEl.className = `kbm-status ${statusModalCls(r.status)}`;    // adds kbm-awaiting | kbm-inProgress | kbm-completed
    document.getElementById('kbm-ip').textContent = `Requested from: ${r.requester_ip || '—'}`;
    document.getElementById('kbm-ua').textContent = r.requester_ua || '—';

    // meta
    document.getElementById('kbm-requested').textContent = new Date(r.requested_at).toLocaleString();
    document.getElementById('kbm-scheduled').textContent = r.scheduled_delete_at ? new Date(r.scheduled_delete_at).toLocaleString() : '—';
    document.getElementById('kbm-completed').textContent = r.completed_at ? new Date(r.completed_at).toLocaleString() : '—';

    // logs
    const logEl = document.getElementById('kbm-logs');
    logEl.innerHTML = logs && logs.length
      ? logs.map(l => `
    <div class="kbm-logline">
      ${new Date(l.at_time).toLocaleString()} — 
      <b>${escapeHTML(l.action)}</b>
      ${l.actor_username ? ` <b>by ${escapeHTML(l.actor_username)}</b>` : ``}
      ${l.note ? ` — ${escapeHTML(l.note)}` : ``}
    </div>`).join('') : '<i style="opacity:.7">No history</i>';

    // buttons (admin/sysadmin only)
    const btnWrap = document.getElementById('kbm-buttons');

    if (r.status === 'awaiting') {
      btnWrap.innerHTML = `
        <button class="kbm-btn" id="kbm-approve">Approve (24h)</button>
        <button class="kbm-btn danger" id="kbm-deny">Deny</button>
        <button class="kbm-btn secondary" id="kbm-close">Close</button>
      `;
      document.getElementById('kbm-approve')?.addEventListener('click', () => approveDeletion(r.id));
      document.getElementById('kbm-deny')?.addEventListener('click', () => showReasonModal('deny', r.id));
      document.getElementById('kbm-close')?.addEventListener('click', window.closeTaskModal);

    } else if (r.status === 'in_progress') {
      btnWrap.innerHTML = `
        <button class="kbm-btn" id="kbm-cancel">Cancel</button>
        <button class="kbm-btn secondary" id="kbm-close">Close</button>
      `;
      document.getElementById('kbm-cancel')?.addEventListener('click', () => showReasonModal('cancel', r.id));
      document.getElementById('kbm-close')?.addEventListener('click', window.closeTaskModal);

    } else {
      const inArchivedView = document.getElementById('tasksFilter')?.value === 'archived';
      if (!inArchivedView) {
        btnWrap.innerHTML = `
          <button class="kbm-btn danger" id="kbm-archive">Remove Request</button>
          <button class="kbm-btn secondary" id="kbm-close">Close</button>
        `;
        document.getElementById('kbm-archive')?.addEventListener('click', () =>
          confirmArchive(r.id, r.username_snapshot, r.email_snapshot)
        );
      } else {
        btnWrap.innerHTML = `<button class="kbm-btn secondary" id="kbm-close">Close</button>`;
      }
      document.getElementById('kbm-close')?.addEventListener('click', window.closeTaskModal);
    }

    // show
    const bd = document.getElementById('taskModalBackdrop');
    if (bd) bd.classList.remove('hidden');
  }

  async function approveDeletion(id) {
    await api(`/admin/deletion-requests/${id}/approve`, { method:'POST' });
    showToast('Approved and scheduled for deletion in 24h');
    window.closeTaskModal();
    const archivedNow = document.getElementById('tasksFilter')?.value === 'archived';
    loadDeletionRequests(archivedNow ? 1 : 0);
  }

  function confirmArchive(id, uname, email) {
    const modalId = `archiveReq-${id}`;
    showGlobalModal({
      type: "warning",
      title: "Remove Completed Request",
      message: `
        <p>Remove this completed deletion request from the Tasks board?</p>
        <p style="opacity:.8;margin-top:.5rem;">
          <b>${escapeHTML(uname)}</b>
          <span class="kb-subtle">(${escapeHTML(email)})</span>
        </p>
        <p style="opacity:.7;margin-top:.75rem;">Audit history will be retained.</p>
      `,
      buttons: [
        { label: "Cancel", onClick: `fadeOutAndRemove('${modalId}')` },
        { label: "Remove", onClick: `archiveDeletionRequest(${id}, '${modalId}')` }
      ],
      id: modalId
    });
  }

  window.archiveDeletionRequest = async function (id, modalId) {
    try {
      const res = await api(`/admin/deletion-requests/${id}/archive`, { method: 'POST' });
      if (!res.ok) throw new Error('Archive failed');

      showToast('Request removed from list');
      fadeOutAndRemove(modalId);
      window.closeTaskModal();

      // refresh the Tasks columns
      const archivedNow = document.getElementById('tasksFilter')?.value === 'archived';
      loadDeletionRequests(archivedNow ? 1 : 0);
    } catch (e) {
      showToast('Could not remove request', 'error');
      console.error(e);
    }
  };

  function showReasonModal(action, id) {
    // action is 'deny' or 'cancel'
    const sfx = `${action}-${id}-${Date.now()}`;
    const actionLabel = action === 'deny' ? 'Deny Request' : 'Cancel Deletion';

    const html = `
    <div id="reasonBackdrop-${sfx}" class="kbm-backdrop">
      <div id="reasonModal-${sfx}" class="kbm-modal fadeIn kbm-modal--narrow" role="dialog" aria-modal="true">
        <div class="kbm-head">
          <h3>${actionLabel}</h3>
          <button class="kbm-close" aria-label="Close">&times;</button>
        </div>

        <div class="kbm-body">
          <div class="kbm-desc">
            <div class="kbm-desc-title">Reason (optional)</div>
            <textarea id="reasonText-${sfx}" class="kbm-textarea" placeholder="Type your reason..."></textarea>
          </div>
        </div>

        <div class="kbm-foot">
          <button class="kbm-btn secondary" id="reasonCancel-${sfx}">Cancel</button>
          <button class="kbm-btn ${action === 'deny' ? 'danger' : 'warn'}" id="reasonSubmit-${sfx}">
            ${action === 'deny' ? 'Deny' : 'Confirm Cancel'}
          </button>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    const backdrop = document.getElementById(`reasonBackdrop-${sfx}`);
    const modal    = document.getElementById(`reasonModal-${sfx}`);

    // Close handlers
    backdrop.querySelector('.kbm-close')?.addEventListener('click', () => closeReasonModal(sfx));
    document.getElementById(`reasonCancel-${sfx}`)?.addEventListener('click', () => closeReasonModal(sfx));

    // Submit handler
    document.getElementById(`reasonSubmit-${sfx}`)?.addEventListener('click', async () => {
      const reason = document.getElementById(`reasonText-${sfx}`).value.trim();
      await api(`/admin/deletion-requests/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      showToast(action === 'deny' ? 'Request denied' : 'Deletion cancelled');
      closeReasonModal(sfx);
      window.closeTaskModal();
      const archivedNow = document.getElementById('tasksFilter')?.value === 'archived';
      loadDeletionRequests(archivedNow ? 1 : 0);
    });
  }

  function closeReasonModal(sfx) {
    const backdrop = document.getElementById(`reasonBackdrop-${sfx}`);
    const modal    = document.getElementById(`reasonModal-${sfx}`);
    if (!backdrop || !modal) return;

    modal.classList.remove('fadeIn');
    modal.classList.add('fadeOut');
    setTimeout(() => backdrop.remove(), 220); // match your fadeOut duration
  }



  // Load Active Users
  userRole = role;
  setupChangelogForm();
  loadChangelogEntries();
}

function initIconPickers() {
  // builds the icon strip and click handler for a given modal
  function setupPicker(toggleId, stripId, inputId) {
    const toggle = document.getElementById(toggleId);
    const strip = document.getElementById(stripId);
    if (!toggle || !strip) return;

    // Build icons only once
    if (!strip.dataset.built) {
      QUICK_ICONS.forEach(icon => {
        const img = document.createElement("img");
        img.src = icon.url;
        img.alt = icon.name;
        img.title = icon.name;

        img.addEventListener("click", () => {
          const input = document.getElementById(inputId);
          if (input) {
            input.value = icon.url;
            // optional: close after selecting
            // strip.classList.remove("open");
            // strip.classList.add("hidden");
            // toggle.textContent = toggle.textContent.replace("Hide", "Show").replace("▴", "▾");
          }
        });

        strip.appendChild(img);
      });

      strip.dataset.built = "1";
    }

    // Toggle open/closed
    toggle.addEventListener("click", () => {
      const isOpen = strip.classList.toggle("open");
      strip.classList.toggle("hidden", !isOpen);
      toggle.textContent = isOpen
        ? "Hide quick icons ▴"
        : "Show quick icons ▾";
    });
  }

  // Hook both modals
  setupPicker("toggle-edit-icon-picker", "edit-icon-picker", "edit-icon-url");
  setupPicker("toggle-add-icon-picker", "add-icon-picker", "add-icon-url");

  // Hook wizard modals
  setupPicker("wizard-toggle-add-icon-picker", "wizard-add-icon-picker", "wizard-add-icon-url");
  setupPicker("wizard-toggle-edit-icon-picker", "wizard-edit-icon-picker", "wizard-edit-icon-url");
}


// ===== Crate / Items DataTable wrappers =====

// Small helper to enable/disable the Edit/Delete buttons for items
function updateItemsEditorButtons() {
  const hasSelection = !!selectedItemId;
  const editBtn = document.getElementById("itemsEditorEdit");
  const delBtn  = document.getElementById("itemsEditorDelete");

  if (editBtn) {
    editBtn.disabled = !hasSelection;
  }

  if (delBtn) {
    if (userRole === "SysAdmin") {
      delBtn.style.display = "";
      delBtn.disabled = !hasSelection;
    } else {
      // Admins never see the delete button
      delBtn.style.display = "none";
    }
  }
}

function initCrateSummaryDataTable() {
  const $ = window.jQuery;
  const selector = "#crateInfoTable";

  if (!$ || !$(selector).length) return;

  if ($.fn.dataTable.isDataTable(selector)) {
    $(selector).DataTable().destroy();
  }

  crateSummaryDt = $(selector).DataTable({
    paging: false,
    searching: false,
    info: false,
    lengthChange: false,
    ordering: false,
    autoWidth: false
  });
}

// call this once when the View/Edit Crates tab is shown
function initCrateItemsDataTable() {
  const $ = window.jQuery;
  const selector = "#crateItemsTable";

  if (!$.fn.DataTable) return;
  if (!$(selector).length) return;

  if ($.fn.dataTable.isDataTable(selector)) {
    crateItemsDt.destroy();
    $(selector).off("click", "tbody tr");
  }

  crateItemsDt = $(selector).DataTable({
    paging: true,
    searching: true,
    ordering: true,
    pageLength: 10,
    deferRender: true,
    autoWidth: false
  });

  const $table = $(selector);

  // Delegated click handler works for ALL pages + searches
  $table.on("click", "tbody tr", function () {
    const row = crateItemsDt.row(this);
    const data = row.data();
    if (!data) return;

    const id = parseInt(data[0], 10);
    if (isNaN(id)) return;

    if ($(this).hasClass("selected")) {
      $(this).removeClass("selected");
      selectedItemId = null;
    } else {
      $table.find("tr.selected").removeClass("selected");
      $(this).addClass("selected");
      selectedItemId = id;
    }

    updateItemsEditorButtons();
  });

  crateItemsDt.on("draw", function () {
    selectedItemId = null;
    $table.find("tr.selected").removeClass("selected");
    updateItemsEditorButtons();
  });
}

// --- NEW: Create-New-Crate wizard items DataTable (Step 2) ---

function initNewCrateItemsDataTable() {
  const $ = window.jQuery;
  const selector = "#newCrateItemsTable";

  if (!$ || !$.fn.DataTable) return;
  if (!$(selector).length) return;

  // avoid re-initialising
  if (newCrateItemsDt) return;

  newCrateItemsDt = $(selector).DataTable({
    paging: true,
    searching: true,
    ordering: true,
    pageLength: 10,
    deferRender: true,
    autoWidth: false,
    language: {
      emptyTable: "No items have been added to this crate yet."
    }
  });

  const $table = $(selector);

  // row selection (index based on first column so sorting/search still works)
  $table.on("click", "tbody tr", function () {
    const row  = newCrateItemsDt.row(this);
    const data = row.data();
    if (!data) return;

    // First column is the 1-based “#” we added in refreshNewCrateItemsTable()
    const displayIndex = parseInt(data[0], 10) - 1;
    if (isNaN(displayIndex) || displayIndex < 0) return;

    if ($(this).hasClass("selected")) {
      $(this).removeClass("selected");
      newCrateSelectedIndex = null;
    } else {
      $table.find("tr.selected").removeClass("selected");
      $(this).addClass("selected");
      newCrateSelectedIndex = displayIndex;
    }

    updateNewCrateItemsToolbar();
  });

  newCrateItemsDt.on("draw", function () {
    newCrateSelectedIndex = null;
    $(selector).find("tr.selected").removeClass("selected");
    updateNewCrateItemsToolbar();
  });

  // initial button state
  updateNewCrateItemsToolbar();
}

function updateNewCrateItemsToolbar() {
  const addBtn  = document.getElementById("addItemBtn");
  const editBtn = document.getElementById("editItemBtn");
  const delBtn  = document.getElementById("deleteItemBtn");

  if (!addBtn || !editBtn || !delBtn) return;

  const hasSelection =
    newCrateItemsDt &&
    newCrateSelectedIndex !== null &&
    newCrateSelectedIndex < newCrateItemsDt.rows().count();

  // “New” is always enabled
  addBtn.disabled  = false;
  editBtn.disabled = !hasSelection;
  delBtn.disabled  = !hasSelection;
}

// Optional helper if you keep a newCrateItems[] array
function refreshNewCrateItemsTable() {
  if (!newCrateItemsDt) return;

  newCrateItemsDt.clear();

  const rows = newCrateItems.map((item, index) => [
    index + 1,
    escapeHTML(item.name || ""),
    escapeHTML(item.set || ""),
    item.icon
      ? `<img src="${escapeHTML(item.icon)}" class="item-icon" alt="icon" />`
      : "",
    escapeHTML(item.tags || ""),
    escapeHTML(item.tooltip || "")
  ]);

  newCrateItemsDt.rows.add(rows).draw();
}

function setupCreateCrateWizard() {
  const wizard = document.getElementById("crateWizard");
  if (!wizard) return;

  const steps     = Array.from(document.querySelectorAll(".wizard-step"));
  const stepDots  = Array.from(document.querySelectorAll(".wizard-steps li"));
  const prevBtn   = document.getElementById("prevStepBtn");
  const nextBtn   = document.getElementById("nextStepBtn");
  const submitBtn = document.getElementById("submitCrateBtn");

  if (!steps.length || !prevBtn || !nextBtn || !submitBtn) return;

  currentStep = 0;

  function updateStepUi() {
    // Show the current step, hide others
    steps.forEach((stepEl, idx) => {
      const isActive = idx === currentStep;
      stepEl.classList.toggle("active", isActive);
      stepEl.style.display = isActive ? "block" : "none";
    });

    // Update circles at top
    stepDots.forEach((li, idx) => {
      li.classList.toggle("active", idx === currentStep);
      li.classList.toggle("completed", idx < currentStep);
    });

    // Nav buttons
    prevBtn.disabled        = currentStep === 0;
    nextBtn.style.display   = currentStep < steps.length - 1 ? "inline-block" : "none";
    submitBtn.style.display = currentStep === steps.length - 1 ? "inline-block" : "none";
  }

  // expose if you ever want to jump programmatically
  window.showWizardStep = function(step) {
    const maxStep = steps.length - 1;
    currentStep = Math.min(Math.max(step, 0), maxStep);
    updateStepUi();
  };

  prevBtn.addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep -= 1;
      updateStepUi();
    }
  });

  nextBtn.addEventListener("click", () => {
    // Validate *before* moving forward
    if (currentStep === 0) {
      if (!validateCrateInfo()) return;
    } else if (currentStep === 1) {
      if (!validateWizardItems()) return;
      populateConfirmationTables();
    }

    if (currentStep < steps.length - 1) {
      currentStep += 1;
      updateStepUi();
    }
  });

  submitBtn.addEventListener("click", submitNewCrate);

  // Step 3 dropdown toggle
  const dropdownBtn     = document.getElementById("crate-dropdown-btn");
  const dropdownContent = document.getElementById("crate-dropdown-content");
  if (dropdownBtn && dropdownContent) {
    dropdownContent.style.maxHeight = "0px";

    dropdownBtn.addEventListener("click", () => {
      const isOpen = dropdownContent.classList.toggle("open");
      const arrow  = dropdownBtn.querySelector(".arrow");
      dropdownContent.style.maxHeight = isOpen
        ? dropdownContent.scrollHeight + "px"
        : "0px";
      if (arrow) arrow.classList.toggle("open", isOpen);
    });
  }

  // Step 2 toolbar buttons
  const addBtn    = document.getElementById("addItemBtn");
  const editBtn   = document.getElementById("editItemBtn");
  const deleteBtn = document.getElementById("deleteItemBtn");

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      openWizardAddItemModal();
    });
  }

  if (editBtn) {
    editBtn.addEventListener("click", () => {
      if (newCrateSelectedIndex == null) return;
      openWizardEditItemModal(newCrateSelectedIndex);
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      if (newCrateSelectedIndex == null) return;
      deleteWizardItem(newCrateSelectedIndex);
    });
  }

  // Initial state
  updateStepUi();
}

const wizardStepPanels  = document.querySelectorAll(".wizard-step");
const wizardHeaderSteps = document.querySelectorAll(".wizard-steps li");
const wizardStepsUl     = document.querySelector(".wizard-steps");

const prevStepBtn    = document.getElementById("prevStepBtn");
const nextStepBtn    = document.getElementById("nextStepBtn");
const submitCrateBtn = document.getElementById("submitCrateBtn");

function setWizardStep(stepIndex) {
  if (stepIndex < 0 || stepIndex >= wizardStepPanels.length) return;

  wizardCurrentStep = stepIndex;

  // Show only the current panel
  wizardStepPanels.forEach(panel => {
    const s = parseInt(panel.dataset.step, 10);
    panel.classList.toggle("active", s === wizardCurrentStep);
  });

  // Header circles: mark active + completed
  wizardHeaderSteps.forEach(li => {
    const s = parseInt(li.dataset.step, 10);
    li.classList.toggle("active", s === wizardCurrentStep);
    li.classList.toggle("completed", s <  wizardCurrentStep);
  });

  // Connector progress line (0, 0.5, 1)
  if (wizardStepsUl) {
    let progress = 0;
    if (wizardCurrentStep === 1)      progress = 0.5;
    else if (wizardCurrentStep >= 2)  progress = 1;
    wizardStepsUl.style.setProperty("--wizard-line-progress", progress);
  }

  // Button visibility
  prevStepBtn.disabled      = (wizardCurrentStep === 0);
  nextStepBtn.style.display = (wizardCurrentStep === wizardStepPanels.length - 1)
    ? "none"
    : "inline-block";
  submitCrateBtn.style.display = (wizardCurrentStep === wizardStepPanels.length - 1)
    ? "inline-block"
    : "none";

  // Build Step 3 review on last step
  if (wizardCurrentStep === 2 && typeof buildStep3Review === "function") {
    buildStep3Review();
  }
}

setWizardStep(0);

// Hook up navigation buttons
nextStepBtn?.addEventListener("click", () => {
  if (wizardCurrentStep === 0 && !validateCrateInfo()) return;
  if (wizardCurrentStep === 1 && !validateWizardItems()) return;

  setWizardStep(wizardCurrentStep + 1);
});

prevStepBtn?.addEventListener("click", () => {
  setWizardStep(wizardCurrentStep - 1);
});

function validateCrateInfo() {
  const nameInput = document.getElementById("new-crate-name");
  const typeRadio = document.querySelector('input[name="crateType"]:checked');
  const visRadio  = document.querySelector('input[name="crateVisibility"]:checked');

  const name = nameInput ? nameInput.value.trim() : "";

  if (!name) {
    const modalId = "modal-crateNameRequired";
    showGlobalModal({
      type: "error",
      title: "Crate Name Required",
      message: "Please enter a crate name before continuing.",
      buttons: [{ label: "OK", onClick: `fadeOutAndRemove('${modalId}')` }],
      id: modalId
    });
    return false;
  }

  if (!typeRadio || !visRadio) {
    const modalId = "modal-crateOptionsRequired";
    showGlobalModal({
      type: "error",
      title: "Missing Options",
      message: "Please choose a crate type and visibility before continuing.",
      buttons: [{ label: "OK", onClick: `fadeOutAndRemove('${modalId}')` }],
      id: modalId
    });
    return false;
  }

  return true;
}

function validateWizardItems() {
  if (!Array.isArray(newCrateItems) || newCrateItems.length === 0) {
    const modalId = "modal-crateItemsRequired";
    showGlobalModal({
      type: "error",
      title: "No Items Added",
      message: "Please add at least one item to this crate before continuing.",
      buttons: [{ label: "OK", onClick: `fadeOutAndRemove('${modalId}')` }],
      id: modalId
    });
    return false;
  }
  return true;
}

// ===== Create New Crate Wizard: full reset back to Step 1 =====
function resetCreateCrateWizard() {
  wizardCurrentStep = 0;

  if (typeof setWizardStep === "function") {
    setWizardStep(0);
  }

  const wizard = document.getElementById("crateWizard");
  if (wizard) {
    const panels = wizard.querySelectorAll(".wizard-step");
    panels.forEach((panel) => {
      const isFirst =
        panel.dataset.step === "0" ||
        panel.getAttribute("data-step") === "0";

      panel.classList.toggle("active", isFirst);
      panel.style.display = isFirst ? "block" : "none";
    });
  }

  if (wizardStepsUl) {
    wizardStepsUl.style.setProperty("--wizard-line-progress", 0);
  }

  if (prevStepBtn) prevStepBtn.disabled = true;
  if (nextStepBtn) {
    nextStepBtn.style.display = "inline-block";
    nextStepBtn.disabled = false;
  }
  if (submitCrateBtn) {
    submitCrateBtn.style.display = "none";
  }

  const nameInput =
    document.getElementById("new-crate-name") ||
    document.getElementById("crate-name");
  if (nameInput) {
    nameInput.value = "";
  }

  const defaultTypeRadio =
    document.querySelector('input[name="crateType"][value="cosmetic"]') ||
    document.querySelector('input[name="crate-type"][value="1"]');
  if (defaultTypeRadio) {
    defaultTypeRadio.checked = true;
  }

  const defaultVisRadio =
    document.querySelector('input[name="crateVisibility"][value="public"]') ||
    document.querySelector('input[name="crate-visibility"][value="0"]');
  if (defaultVisRadio) {
    defaultVisRadio.checked = true;
  }

  if (Array.isArray(window.newCrateItems)) {
    window.newCrateItems.length = 0;
  }

  if (typeof refreshNewCrateItemsTable === "function") {
    refreshNewCrateItemsTable();
  } else if (window.jQuery && $.fn.DataTable && $.fn.DataTable.isDataTable("#newCrateItemsTable")) {
    $("#newCrateItemsTable").DataTable().clear().draw();
  } else {
    const step2Body = document.querySelector("#newCrateItemsTable tbody");
    if (step2Body) step2Body.innerHTML = "";
  }

  const summaryBody = document.getElementById("crate-summary-body");
  if (summaryBody) summaryBody.innerHTML = "";

  const itemsBody = document.getElementById("crate-items-table-body");
  if (itemsBody) itemsBody.innerHTML = "";

  if (window.jQuery && $.fn.DataTable && $.fn.DataTable.isDataTable("#wizard-items-review-table")) {
    $("#wizard-items-review-table").DataTable().clear().draw();
  }
}

// ===== Create New Crate Wizard: submit handler =====
async function submitNewCrate() {
  const crateNameInput = document.getElementById("new-crate-name");
  const crateName = crateNameInput?.value.trim() || "";

  const crateTypeRadio =
    document.querySelector('input[name="crateType"]:checked') ||
    document.querySelector('input[name="crate-type"]:checked');

  const crateTypeValue = crateTypeRadio?.value || "";

  const visibilityRadio =
    document.querySelector('input[name="crateVisibility"]:checked') ||
    document.querySelector('input[name="crate-visibility"]:checked');

  const visValue = visibilityRadio?.value || "";

  const isCosmetic =
    crateTypeValue === "cosmetic"
      ? 1
      : crateTypeValue === "noncosmetic"
      ? 0
      : parseInt(crateTypeValue || "0", 10);

  const isHidden =
    visValue === "hidden"
      ? 1
      : visValue === "public"
      ? 0
      : parseInt(visValue || "0", 10);

  if (!crateName) {
    showGlobalModal({
      type: "error",
      title: "Missing Crate Name",
      message: "Please enter a crate name before submitting.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-crateName')" }],
      id: "modal-crateName"
    });
    return;
  }

  if (!crateTypeValue) {
    showGlobalModal({
      type: "error",
      title: "Missing Crate Type",
      message: "Please select a crate type.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-crateType')" }],
      id: "modal-crateType"
    });
    return;
  }

  // main wizard items array
  const itemsArray = newCrateItems;

  try {
    // --- create crate ---
    const crateRes = await api("/admin/crates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crate_name: crateName,
        is_cosmetic: isCosmetic,
        is_hidden: isHidden
      })
    });

    const crate = await crateRes.json();
    const crateId = crate.id;

    if (!crateId) {
      throw new Error("Server did not return a crate ID");
    }

    // --- create all items for this crate ---
    const promises = itemsArray.map((item) => {
      const tagsArray = Array.isArray(item.tags)
        ? item.tags
        : String(item.tags || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

      return api("/admin/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crate_id: crateId,
          item_name: item.name,
          set_name: item.set,
          icon_url: item.icon,
          tags: tagsArray,
          tooltip: item.tooltip
        })
      }).then((res) => {
        if (!res.ok) {
          console.error("Item POST failed for", item, "status", res.status);
        }
        return res.json().catch(() => null);
      });
    });

    await Promise.all(promises);

    // --- success + reset ---
    showGlobalModal({
      type: "success",
      title: "Crate Created",
      message: "Your crate and items were successfully saved!",
      buttons: [
        {
          label: "Close",
          onClick: "fadeOutAndRemove('modal-crateSuccess')"
        }
      ],
      id: "modal-crateSuccess"
    });

    // reset step 1 fields
    if (crateNameInput) crateNameInput.value = "";

    const defaultTypeRadio =
      document.querySelector('input[name="crateType"][value="cosmetic"]') ||
      document.querySelector('input[name="crate-type"][value="1"]');
    if (defaultTypeRadio) defaultTypeRadio.checked = true;

    const defaultVisRadio =
      document.querySelector('input[name="crateVisibility"][value="public"]') ||
      document.querySelector('input[name="crate-visibility"][value="0"]');
    if (defaultVisRadio) defaultVisRadio.checked = true;

    // clear wizard items
    if (Array.isArray(window.newCrateItems)) {
      window.newCrateItems.length = 0;
    }

    if (typeof refreshNewCrateItemsTable === "function") {
      refreshNewCrateItemsTable();
    }

    // go back to step 1
    if (typeof resetCreateCrateWizard === "function") {
      resetCreateCrateWizard();
    }

    // reload view/edit tab so the new crate and its items appear
    if (typeof loadCratesAndItems === "function") {
      loadCratesAndItems();
    } else if (typeof loadCrates === "function") {
      loadCrates();
    }
  } catch (err) {
    console.error("Crate creation failed:", err);
    showGlobalModal({
      type: "error",
      title: "Submission Failed",
      message: "There was an error creating the crate. Please try again.",
      buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-submitError')" }],
      id: "modal-submitError"
    });
  }
}

function populateConfirmationTables() {
  const summaryBody = document.getElementById("crate-summary-body");
  const itemsBody   = document.getElementById("crate-items-table-body");

  // Crate-level summary
  if (summaryBody) {
    summaryBody.innerHTML = "";

    const name = document.getElementById("new-crate-name")?.value.trim() || "";
    const typeVal = document.querySelector('input[name="crateType"]:checked')?.value;
    const visVal  = document.querySelector('input[name="crateVisibility"]:checked')?.value;

    const typeLabel = typeVal === "noncosmetic" ? "Non-Cosmetic" : "Cosmetic";
    const visLabel  = visVal === "hidden" ? "Hidden" : "Visible";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(name)}</td>
      <td>${escapeHTML(typeLabel)}</td>
      <td>${escapeHTML(visLabel)}</td>
    `;
    summaryBody.appendChild(tr);
  }

  // Items summary
  if (itemsBody) {
    itemsBody.innerHTML = "";

    newCrateItems.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHTML(item.name || "")}</td>
        <td>${escapeHTML(item.set || "")}</td>
        <td>${item.icon ? `<img src="${escapeHTML(item.icon)}" class="item-icon" alt="icon" />` : ""}</td>
        <td>${escapeHTML(item.tags || "")}</td>
        <td>${escapeHTML(item.tooltip || "")}</td>
      `;
      itemsBody.appendChild(tr);
    });
  }
}

function openWizardAddItemModal() {
  const modal = document.getElementById("wizardAddItemModal");
  if (!modal) return;

  // Clear fields
  document.getElementById("wizard-add-item-name").value = "";
  document.getElementById("wizard-add-set-name").value = "";
  document.getElementById("wizard-add-icon-url").value = "";
  document.getElementById("wizard-add-tags").value = "";
  document.getElementById("wizard-add-tooltip").value = "";

  modal.classList.remove("hidden");
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeOut");
  content.classList.add("fadeIn");
}

function closeWizardAddItemModal() {
  const modal = document.getElementById("wizardAddItemModal");
  if (!modal) return;
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeIn");
  content.classList.add("fadeOut");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

function deleteWizardItem(index) {
  if (!Array.isArray(newCrateItems)) return;
  if (index == null || index < 0 || index >= newCrateItems.length) return;

  newCrateItems.splice(index, 1);

  if (typeof refreshNewCrateItemsTable === "function") {
    refreshNewCrateItemsTable();
  }

  if (wizardCurrentStep === 2 && typeof buildStep3Review === "function") {
    buildStep3Review();
  }
}

// ===== STEP 3: BUILD CONFIRM REVIEW =====
function buildStep3Review() {
  // --- 1) Crate summary (top table) ---
  const crateNameInput = document.getElementById("new-crate-name");
  const crateName = crateNameInput ? crateNameInput.value.trim() : "";

  const typeRadio = document.querySelector('input[name="crateType"]:checked');
  const crateType =
    typeRadio && typeRadio.value === "cosmetic"
      ? "Cosmetic"
      : typeRadio && typeRadio.value === "noncosmetic"
      ? "Non-Cosmetic"
      : "—";

  const visRadio = document.querySelector('input[name="crateVisibility"]:checked');
  const visibility =
    visRadio && visRadio.value === "public"
      ? "Visible"
      : visRadio && visRadio.value === "hidden"
      ? "Hidden"
      : "—";

  const summaryBody = document.getElementById("crate-summary-body");
  if (summaryBody) {
    summaryBody.innerHTML = `
      <tr>
        <td>${crateName || "—"}</td>
        <td>${crateType}</td>
        <td>${visibility}</td>
      </tr>
    `;
  }

  // --- 2) Items in crate (copy rows from Step 2 DataTable) ---
  const itemsBody = document.getElementById("crate-items-table-body");
  if (!itemsBody) return;
  itemsBody.innerHTML = "";

  let step2Data = [];

  // Prefer DataTables API if the Step 2 table is initialised
  if ($.fn.dataTable && $.fn.dataTable.isDataTable("#newCrateItemsTable")) {
    const dt = $("#newCrateItemsTable").DataTable();
    step2Data = dt.rows().data().toArray();
  } else {
    // Fallback: copy raw DOM rows
    document
      .querySelectorAll("#newCrateItemsTable tbody tr")
      .forEach((row) => {
        const cells = Array.from(row.children).map((td) => td.innerHTML);
        step2Data.push(cells);
      });
  }

  step2Data.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cellHtml) => {
      const td = document.createElement("td");
      td.innerHTML = cellHtml;
      tr.appendChild(td);
    });
    itemsBody.appendChild(tr);
  });

  // --- 3) (Re)initialise DataTable on the Step 3 review table ---
  if ($.fn.dataTable && $.fn.dataTable.isDataTable("#wizard-items-review-table")) {
    $("#wizard-items-review-table").DataTable().destroy();
  }

  $("#wizard-items-review-table").DataTable({
    paging: true,
    pageLength: 10,
    lengthChange: true,
    searching: true,
    ordering: true,
    info: true,
    autoWidth: false,
    responsive: false,
    dom: "lrtip",
  });
}

function openWizardEditItemModal(index) {
  if (!Array.isArray(newCrateItems) || index == null) return;
  const item = newCrateItems[index];
  if (!item) return;

  const modal = document.getElementById("wizardEditItemModal");
  if (!modal) return;

  // Store index in hidden field
  document.getElementById("wizard-edit-item-index").value = index;

  // Fill fields
  document.getElementById("wizard-edit-item-name").value = item.name || "";
  document.getElementById("wizard-edit-set-name").value = item.set || "";
  document.getElementById("wizard-edit-icon-url").value = item.icon || "";
  document.getElementById("wizard-edit-tags").value = item.tags || "";
  document.getElementById("wizard-edit-tooltip").value = item.tooltip || "";

  modal.classList.remove("hidden");
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeOut");
  content.classList.add("fadeIn");
}

function closeWizardEditItemModal() {
  const modal = document.getElementById("wizardEditItemModal");
  if (!modal) return;
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeIn");
  content.classList.add("fadeOut");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

// Hook up the "New / Edit / Delete" buttons under the items table header
function initItemsEditorToolbar(selectedCrateId) {
  const newBtn  = document.getElementById("itemsEditorNew");
  const editBtn = document.getElementById("itemsEditorEdit");
  const delBtn  = document.getElementById("itemsEditorDelete");

  if (!newBtn || !editBtn || !delBtn) return;

  newBtn.onclick = () => {
    if (!selectedCrateId) return;
    openAddItemModal(selectedCrateId);
  };

  editBtn.onclick = () => {
    if (!selectedItemId) return;
    editItem(selectedItemId);
  };

  delBtn.onclick = () => {
    if (!selectedItemId) return;
    deleteItem(selectedItemId);
  };

  updateItemsEditorButtons();
}

// Render the selected crate into the summary + items DataTables
function renderCrateUi(crate, items) {
  if (!crateSummaryDt || !crateItemsDt || !crate) return;

  currentCrateId = crate.id;
  selectedItemId = null;
  updateItemsEditorButtons();

  // ---- Crate summary (single row) ----
  crateSummaryDt.clear();

  const editSvg = `
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4z"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linejoin="round"/>
      <path d="M14 6l4 4"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round"/>
    </svg>`;

  const trashSvg = `
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round"/>
      <path d="M10 11v6M14 11v6"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round"/>
      <path d="M9 7V5h6v2"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round"/>
      <path d="M6 7l1 12h10l1-12"
            fill="none" stroke="currentColor" stroke-width="2"
            stroke-linejoin="round"/>
    </svg>`;

  const actionsHtml = `
    <button type="button" class="btn btn-sm btn-outline-light me-1"
            onclick="editCrate(${crate.id})">
      ${editSvg}
    </button>
    ${userRole === "SysAdmin" ? `
      <button type="button" class="btn btn-sm btn-outline-danger"
              onclick="deleteCrate(${crate.id})">
        ${trashSvg}
      </button>` : ""}
  `;

  crateSummaryDt.row.add([
    crate.id,
    crate.crate_name,
    crate.is_cosmetic ? "Cosmetic" : "Non-Cosmetic",
    crate.is_hidden ? "Hidden" : "Visible",
    actionsHtml
  ]).draw(false);

  // --- Items table (bulk) ---
  crateItemsDt.clear();

  const rows = (items || []).map(item => [
    item.id,
    item.item_name,
    item.set_name || "",
    item.icon_url ? `<img src="${item.icon_url}" alt="" class="item-icon" />` : "",
    (item.tags || []).join(", "),
    item.tooltip || ""
  ]);

  crateItemsDt.rows.add(rows).draw(false);
  crateItemsDt.columns.adjust().draw(false);

  // attach data-item-id for selection
  crateItemsDt.rows().every(function () {
    const data = this.data();
    const node = this.node();
    window.jQuery(node).attr("data-item-id", data[0]); // first col is ID
  });
}

function loadCratesAndItems(selectedCrateId) {
  const previousCrateId =
    typeof selectedCrateId === "number" ? selectedCrateId : currentCrateId;

  Promise.all([
    api("/admin/crates").then((res) => res.json()),
    api("/admin/items").then((res) => res.json()),
  ])
    .then(([crates, items]) => {
      const selector = document.getElementById("crate-selector");
      if (!selector) return;

      // Reset dropdown options
      selector.innerHTML =
        '<option disabled selected>Select a crate to edit</option>';

      crates.forEach((crate) => {
        const option = document.createElement("option");
        option.value = crate.id;
        option.textContent = crate.crate_name;
        selector.appendChild(option);
      });

      const sections = [
        document.getElementById("crate-info-wrapper"),
        document.getElementById("crate-items-wrapper"),
      ];

      const handleSelection = (crateId) => {
        if (!crateId) return;

        const selectedCrate = crates.find((c) => c.id === crateId);
        if (!selectedCrate) return;

        const relatedItems = items.filter((i) => i.crate_id === crateId);

        sections.forEach((s) => s && s.classList.add("is-loading"));

        requestAnimationFrame(() => {
          renderCrateUi(selectedCrate, relatedItems);
          initItemsEditorToolbar(crateId);
          sections.forEach((s) => s && s.classList.remove("is-loading"));
        });
      };

      // Make sure we only ever have ONE change handler
      selector.onchange = function () {
        const selectedCrateId = parseInt(selector.value, 10);
        handleSelection(selectedCrateId);
      };

      // Try to restore the previously selected crate (if it still exists)
      const canRestore =
        previousCrateId &&
        crates.some((crate) => crate.id === previousCrateId);

      if (canRestore) {
        selector.value = String(previousCrateId);
        handleSelection(previousCrateId);
      } else {
        // Previous crate was deleted or none selected → clear tables + state
        currentCrateId = null;
        selectedItemId = null;
        if (crateSummaryDt) crateSummaryDt.clear().draw();
        if (crateItemsDt) crateItemsDt.clear().draw();
        updateItemsEditorButtons();
      }
    })
    .catch((err) => {
      console.error("Failed to load crates or items:", err);
    });
}

function editCrate(crateId) {
  api('/admin/crates')
    .then((res) => res.json())
    .then((crates) => {
      const crate = crates.find((c) => c.id === crateId);
      if (!crate) return showToast("Crate not found.");

      // Pre-fill modal inputs
      document.getElementById("edit-crate-id").value = crate.id;
      document.getElementById("edit-crate-name").value = crate.crate_name;
      document.getElementById("edit-crate-type").value = crate.is_cosmetic
        ? "1"
        : "0";
      document.getElementById("edit-crate-hidden").checked = !!crate.is_hidden;


      // Show modal
      const modal = document.getElementById("editCrateModalAdmin");
      modal.classList.remove("hidden");
      modal.querySelector(".modal-content-admin").classList.remove("fadeOut");
      modal.querySelector(".modal-content-admin").classList.add("fadeIn");
    })
    .catch(() => showToast("Failed to load crate data."));
}

function closeEditCrateModal() {
  const modal = document.getElementById("editCrateModalAdmin");
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeIn");
  content.classList.add("fadeOut");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

function editItem(itemId) {
  api('/admin/items')
    .then((res) => res.json())
    .then((items) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return showToast("Item not found.");

      document.getElementById("edit-item-id").value = item.id;
      document.getElementById("edit-item-name").value = item.item_name || "";
      document.getElementById("edit-set-name").value = item.set_name || "";
      document.getElementById("edit-icon-url").value = item.icon_url || "";
      document.getElementById("edit-tags").value = (item.tags || []).join(", ");
      document.getElementById("edit-tooltip").value = item.tooltip || "";

      const modal = document.getElementById("editItemModalAdmin");
      modal.classList.remove("hidden");
      modal.querySelector(".modal-content-admin").classList.remove("fadeOut");
      modal.querySelector(".modal-content-admin").classList.add("fadeIn");
    });
}

function closeEditModal() {
  const modal = document.getElementById("editItemModalAdmin");
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeIn");
  content.classList.add("fadeOut");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

document
  .getElementById("editCrateForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const id = document.getElementById("edit-crate-id").value;
    const updatedData = {
      crate_name: document.getElementById("edit-crate-name").value,
      is_cosmetic: parseInt(document.getElementById("edit-crate-type").value),
      is_hidden: document.getElementById("edit-crate-hidden").checked ? 1 : 0,
    };

    api(`/admin/crates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedData),
    })
      .then((res) => res.json())
      .then(() => {
        showToast("Crate updated successfully");
        closeEditCrateModal();
        loadCratesAndItems();
      })
      .catch(() => showToast("Failed to update crate"));
  });

document
  .getElementById("editItemForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const id = document.getElementById("edit-item-id").value;
    const updatedData = {
      item_name: document.getElementById("edit-item-name").value,
      set_name: document.getElementById("edit-set-name").value,
      icon_url: document.getElementById("edit-icon-url").value,
      tags: document
        .getElementById("edit-tags")
        .value.split(",")
        .map((t) => t.trim()),
      tooltip: document.getElementById("edit-tooltip").value,
    };

    api(`/admin/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedData),
    })
      .then((res) => res.json())
      .then(() => {
        showToast("Item updated successfully");
        closeEditModal();
        loadCratesAndItems();
      })
      .catch(() => showToast("Failed to update item"));
  });

function openAddItemModal(crateId) {
  document.getElementById("add-crate-id").value = crateId;

  const selector = document.getElementById("crate-selector");
  const crateName = selector.options[selector.selectedIndex].text;
  document.getElementById(
    "add-item-crate-label"
  ).textContent = `${crateName}`;

  const modal = document.getElementById("addItemModalAdmin");
  modal.classList.remove("hidden");
  modal.querySelector(".modal-content-admin").classList.remove("fadeOut");
  modal.querySelector(".modal-content-admin").classList.add("fadeIn");
}

function closeAddItemModal() {
  const modal = document.getElementById("addItemModalAdmin");
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeIn");
  content.classList.add("fadeOut");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

document.getElementById("addItemForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const crate_id = document.getElementById("add-crate-id").value;
  const item_name = document.getElementById("add-item-name").value;
  const set_name = document.getElementById("add-set-name").value;
  const icon_url = document.getElementById("add-icon-url").value;
  const tags = document
    .getElementById("add-tags")
    .value.split(",")
    .map((t) => t.trim());
  const tooltip = document.getElementById("add-tooltip").value;

  api('/admin/items', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      crate_id,
      item_name,
      set_name,
      icon_url,
      tags,
      tooltip,
    }),
  })
    .then((res) => res.json())
    .then(() => {
      showToast("Item added successfully!");
      closeAddItemModal();
      loadCratesAndItems();
    })
    .catch(() => showToast("Failed to add item."));
});

// Create New Crate Wizard - Add Item form
document.getElementById("wizardAddItemForm")?.addEventListener("submit", function (e) {
  e.preventDefault();

  const name    = document.getElementById("wizard-add-item-name").value.trim();
  const set     = document.getElementById("wizard-add-set-name").value.trim();
  const icon    = document.getElementById("wizard-add-icon-url").value.trim();
  const tags    = document.getElementById("wizard-add-tags").value.trim();
  const tooltip = document.getElementById("wizard-add-tooltip").value.trim();

  if (!name || !set) {
    showToast("Item name and set name are required.");
    return;
  }

  if (!Array.isArray(window.newCrateItems)) {
    window.newCrateItems = [];
  }
  newCrateItems = window.newCrateItems;

  newCrateItems.push({
    name,
    set,
    icon,
    tags,
    tooltip
  });

  refreshNewCrateItemsTable();
  closeWizardAddItemModal();
});

// Create New Crate Wizard - Edit Item form
document.getElementById("wizardEditItemForm")?.addEventListener("submit", function (e) {
  e.preventDefault();

  const index = parseInt(
    document.getElementById("wizard-edit-item-index").value,
    10
  );
  if (!Array.isArray(newCrateItems) || isNaN(index) || !newCrateItems[index]) {
    return;
  }

  const name    = document.getElementById("wizard-edit-item-name").value.trim();
  const set     = document.getElementById("wizard-edit-set-name").value.trim();
  const icon    = document.getElementById("wizard-edit-icon-url").value.trim();
  const tags    = document.getElementById("wizard-edit-tags").value.trim();
  const tooltip = document.getElementById("wizard-edit-tooltip").value.trim();

  if (!name || !set) {
    showToast("Item name and set name are required.");
    return;
  }

  newCrateItems[index] = {
    name,
    set,
    icon,
    tags,
    tooltip
  };

  refreshNewCrateItemsTable();
  closeWizardEditItemModal();
});

function deleteCrate(crateId) {
  const modalId = `deleteCrateModal-${crateId}`;
  showGlobalModal({
    type: "warning",
    title: "Delete Crate",
    message: "Are you sure you want to permanently delete this crate?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Delete",
        onClick: `confirmDeleteCrate(${crateId}, '${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmDeleteCrate(crateId, modalId) {
  api(`/admin/crates/${crateId}`, { method: "DELETE" })
    .then(() => {
    showToast("Crate deleted successfully.");
    loadCratesAndItems();
    fadeOutAndRemove(modalId);
  });
}

function deleteItem(itemId) {
  const modalId = `deleteItemModal-${itemId}`;
  showGlobalModal({
    type: "warning",
    title: "Delete Item",
    message: "Are you sure you want to permanently delete this item?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Delete",
        onClick: `confirmDeleteItem(${itemId}, '${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmDeleteItem(itemId, modalId) {
  api(`/admin/items/${itemId}`, { method: "DELETE" })
    .then(() => {
    showToast("Item deleted successfully.");
    loadCratesAndItems();
    fadeOutAndRemove(modalId);
  });
}



function loadAuditLogs(page = 1) {
  api(`/admin/audit-logs?page=${page}&limit=10`)
    .then((res) => res.json())
    .then(({ logs, total }) => {
      const tbody = document.getElementById("auditLogTable");
      const pagination = document.getElementById("auditPagination");
      tbody.innerHTML = "";

      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No audit logs found.</td></tr>';
        pagination.innerHTML = "";
        return;
      }

      logs.forEach((log) => {
        const tr = document.createElement("tr");
        const formattedDate = new Date(log.timestamp).toLocaleString();
        tr.innerHTML = `
          <td>${log.user_id}</td>
          <td>${log.action}</td>
          <td>${formattedDate}</td>
          <td><button class="delete-log-btn" onclick="deleteLog(${log.id})">🗑</button></td>
        `;
        tbody.appendChild(tr);
      });

      const totalPages = Math.ceil(total / logsPerPage);
      pagination.innerHTML = "";

      if (totalPages > 1) {
        for (let i = 1; i <= totalPages; i++) {
          const btn = document.createElement("button");
          btn.textContent = i;
          btn.className = "page-btn";
          btn.disabled = i === page;
          btn.onclick = () => {
            currentPage = i;
            loadAuditLogs(currentPage);
          };
          pagination.appendChild(btn);
        }
      }
    })
    .catch((err) => {
      console.error("Failed to load audit logs:", err);
      document.getElementById("auditLogTable").innerHTML =
        '<tr><td colspan="4">Failed to load logs.</td></tr>';
    });
}

function deleteLog(logId) {
  const modalId = `deleteLogModal-${logId}`;
  showGlobalModal({
    type: "warning",
    title: "Delete Log Entry",
    message: "Are you sure you want to delete this audit log entry?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Delete",
        onClick: `confirmDeleteLog(${logId}, '${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmDeleteLog(logId, modalId) {
  api(`/admin/audit-logs/${logId}`, { method: "DELETE" })
    .then(() => {
    showToast("Log entry deleted.");
    loadAuditLogs(currentPage);
    fadeOutAndRemove(modalId);
  });
}

function clearAuditLogs() {
  const modalId = `clearAuditModal`;
  showGlobalModal({
    type: "warning",
    title: "Clear Audit Logs",
    message: "This action cannot be undone. Clear the entire audit log?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Confirm",
        onClick: `confirmClearAuditLogs('${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmClearAuditLogs(modalId) {
  api('/admin/audit-logs', { method: "DELETE" })
    .then(() => {
    showToast("Audit log successfully cleared.");
    loadAuditLogs(1);
    fadeOutAndRemove(modalId);
  });
}


function verifyUser(userId) {
  api('/admin/verify-user', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  }).then(() => {
    showToast("User verified successfully");
    setTimeout(() => location.reload(), 1000);
  });
}

function deleteUser(userId) {
  const modalId = `deleteUserModal-${userId}`;
  showGlobalModal({
    type: "warning",
    title: "Delete User",
    message: "Are you sure you want to permanently delete this user?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Delete",
        onClick: `confirmDeleteUser(${userId}, '${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmDeleteUser(userId, modalId) {
  api('/admin/delete-user', {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId })
  }).then(() => {
    showToast("User deleted successfully.");
    setTimeout(() => location.reload(), 1000);
    fadeOutAndRemove(modalId);
  });
}

function changeRole(userId) {
  const newRole = document.getElementById(`role-${userId}`).value;
  api('/admin/change-role', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, newRole }),
  })
    .then((res) => res.json())
    .then(() => {
      showToast("User role updated successfully!");
      const row = document.getElementById(`role-${userId}`).closest("tr");
      row.style.backgroundColor = "#2a2a2a";
      setTimeout(() => (row.style.backgroundColor = ""), 1000);
    })
    .catch(() => showToast("Failed to update user role"));
}

// Horizontal subtab behavior inside Database Config tab
document.querySelectorAll(".db-subtab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".db-subtab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const tabId = btn.dataset.tab;
    document.querySelectorAll(".db-subtab-content").forEach((tab) => {
      tab.style.display = tab.id === `db-tab-${tabId}` ? "block" : "none";
    });

    if (tabId === "create") {
      if (!crateWizardInitialized) {
        setupCreateCrateWizard();
        crateWizardInitialized = true;
      }

      initNewCrateItemsDataTable();
    }
  });
});

function startLockoutTimers() {
  const timers = document.querySelectorAll('.lockout-timer');

  timers.forEach(timer => {
    let remaining = parseInt(timer.getAttribute('data-seconds'));

    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        timer.textContent = "Unlocked";
        clearInterval(interval);
        timer.parentElement.querySelector('button')?.remove();
        return;
      }
      timer.textContent = formatCountdown(remaining);
    }, 1000);
  });
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function buildAllUsersQuery() {
  const el = document.getElementById('userFilter');
  const v = el ? el.value : 'active';
  if (v === 'include') return '?include_deleted=1';
  if (v === 'deleted') return '?only_deleted=1';
  return '';
}

async function loadAccountList() {
  // role is "SysAdmin" or "Admin" (we only call this for SysAdmin)
  const qs = buildAllUsersQuery();

  try {
    const res = await api(`/admin/all-users${qs}`);
    const data = await res.json();

    const tableBody = document.getElementById("accountList");
    if (!tableBody) return;
    tableBody.innerHTML = data.map(user => {
      const locked = isLockedOut(user);
      const lastFailed = new Date(user.last_failed_login);
      const now = Date.now();
      const diffInSeconds = Math.floor((now - lastFailed) / 1000);
      const remainingTime = Math.max(0, 600 - diffInSeconds);

      return `
        <tr>
          <td>${user.id}</td>
          <td>${user.username}</td>
          <td>${user.email}</td>
          <td>${user.verified ? "Yes" : "No"}</td>
          <td>
            <button class="admin-action-btn verify" onclick="verifyUser(${user.id})">Verify</button>
            <button class="admin-action-btn delete" onclick="deleteUser(${user.id})">Delete</button>
          </td>
          <td>
            ${locked ? `<span class="lockout-timer" data-seconds="${remainingTime}">${remainingTime}</span>` : 'Not locked out'}
            ${locked && user.role !== 'SysAdmin' ? `<button class="unlock-btn" data-user-id="${user.id}">Unlock</button>` : ''}
          </td>
        </tr>
      `;
    }).join("");

    startLockoutTimers();
  } catch (err) {
    console.error("Failed to load user list:", err);
  }
}


function exportAuditLogsAsCSV() {
  api('/admin/audit-logs?page=1&limit=10000')
    .then((res) => res.json())
    .then(({ logs }) => {
      if (!logs || logs.length === 0) {
        const modalId = "csvExportNoneModal";
        showGlobalModal({
          type: "error",
          title: "No Logs to Export",
          message: "There are currently no audit logs available for export.",
          buttons: [
            {
              label: "Close",
              onClick: `fadeOutAndRemove('${modalId}')`
            }
          ],
          id: modalId
        });
        return;
      }

      const csvRows = [["User ID", "Action", "Timestamp"]];
      logs.forEach((log) => {
        csvRows.push([
          `"${log.user_id}"`,
          `"${log.action}"`,
          `"${new Date(log.timestamp).toLocaleString()}"`
        ]);
      });

      const csvContent = csvRows.map((row) => row.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const modalId = "csvExportSuccessModal";
      showGlobalModal({
        type: "success",
        title: "Audit Log Exported",
        message: "Audit logs were exported successfully as a CSV file.",
        buttons: [
          {
            label: "Close",
            onClick: `fadeOutAndRemove('${modalId}')`
          }
        ],
        id: modalId
      });
    })
    .catch(() => {
      const modalId = "csvExportErrorModal";
      showGlobalModal({
        type: "error",
        title: "Export Failed",
        message: "An error occurred while exporting audit logs. Please try again later.",
        buttons: [
          {
            label: "Close",
            onClick: `fadeOutAndRemove('${modalId}')`
          }
        ],
        id: modalId
      });
    });
}

function fadeOutAndRemove(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const content = modal.querySelector(".global-modal-container");
  if (content) {
    content.classList.remove("fadeIn");
    content.classList.add("fadeOut");
    setTimeout(() => {
      modal.remove();
    }, 300); // Match fadeOut animation duration
  } else {
    modal.remove(); // Fallback
  }
}

document.addEventListener("click", function (e) {
  if (e.target.classList.contains("unlock-btn")) {
    const userId = e.target.getAttribute("data-user-id");
    api(`/admin/unlock-user/${userId}`, { method: "POST" })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast("User unlocked successfully.");
        e.target.parentElement.querySelector('.lockout-timer').textContent = '';
        e.target.remove();
      } else {
        showToast(data.error || "Failed to unlock user.", "error");
      }
    })
    .catch(err => {
      showToast("Request failed.", "error");
      console.error(err);
    });
  }
});

// ------------------- CHANGELOG MANAGEMENT -------------------
const changelogForm = document.getElementById("changelog-form");
const changelogTableBody = document.getElementById("changelog-entries-body");
const changelogPageRadios = document.querySelectorAll('input[name="changelog-page-filter"]');

// Handle form submission
function setupChangelogForm() {
  if (!changelogForm) return;

  changelogForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = document.getElementById("changelog-message").value.trim();
    const page = document.querySelector('input[name="changelog-page"]:checked')?.value;

    if (!message || !page) {
      showGlobalModal({
        type: "error",
        title: "Missing Info",
        message: "Please provide a message and select a target page.",
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-changelogEmpty')" }],
        id: "modal-changelogEmpty"
      });
      return;
    }

    try {
      const res = await api('/admin/changelog', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, page })
      });

      if (!res.ok) throw new Error("Failed to save entry");
      document.getElementById("changelog-message").value = "";
      showGlobalModal({
        type: "success",
        title: "Changelog Added",
        message: "Your changelog entry has been saved.",
        buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-changelogSuccess')" }],
        id: "modal-changelogSuccess"
      });
      loadChangelogEntries();
    } catch (err) {
      console.error(err);
      showGlobalModal({
        type: "error",
        title: "Error",
        message: "Failed to save changelog entry.",
        buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-changelogFail')" }],
        id: "modal-changelogFail"
      });
    }
  });
}

// Load changelogs based on selected page
changelogPageRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    loadChangelogEntries();
  });
});

async function loadChangelogEntries() {
  const page = document.querySelector('input[name="changelog-page-filter"]:checked')?.value || "cosmetic";

  try {
    const res = await api(`/changelog?page=${page}`);

    const entries = await res.json();
    renderChangelogTable(entries);
  } catch (err) {
    console.error("Error loading changelog entries:", err);
    changelogTableBody.innerHTML = `<tr><td colspan="6">Failed to load changelog entries.</td></tr>`;
  }
}

function renderChangelogTable(entries) {
  if (!entries || entries.length === 0) {
    changelogTableBody.innerHTML = `<tr><td colspan="6">No entries found.</td></tr>`;
    return;
  }

  changelogTableBody.innerHTML = entries.map(entry => {
    const date = new Date(entry.timestamp).toLocaleString();
    return `
      <tr>
        <td>${entry.id}</td>
        <td>
          ${entry.username || "Unknown"} 
          <span class="role-tag ${entry.role}">${entry.role}</span>
        </td>
        <td><span class="changelog-message" data-id="${entry.id}">${entry.message}</span></td>
        <td>${date}</td>
        <td>
          ${userRole === "Admin" || userRole === "SysAdmin" ? `
            <button class="admin-action-btn" onclick="editChangelog(${entry.id})">✏️</button>
          ` : ""}
          ${userRole === "SysAdmin" ? `
            <button class="admin-action-btn delete" onclick="deleteChangelog(${entry.id})">🗑️</button>
          ` : ""}
        </td>
      </tr>
    `;
  }).join("");
}

function editChangelog(id) {
  const span = document.querySelector(`.changelog-message[data-id="${id}"]`);
  const currentMsg = span?.textContent || "";

  const modalId = `editChangelogModal-${id}`;
  showGlobalModal({
    type: "warning",
    title: "Edit Changelog",
    message: `
      <div class="changelog-edit-wrapper">
        <textarea id="editChangelogTextarea">${currentMsg}</textarea>
      </div>
    `,
    buttons: [
      { label: "Cancel", onClick: `fadeOutAndRemove('${modalId}')` },
      { label: "Save", onClick: `confirmEditChangelog(${id}, '${modalId}')` }
    ],
    id: modalId
  });

  // 💡 ADD THIS: apply .changelog-edit-modal to the active modal
  const modal = document.querySelector(`#${modalId} .global-modal`);
  if (modal) {
    modal.classList.add("changelog-edit-modal");
  }
}

function confirmEditChangelog(id, modalId) {
  const message = document.getElementById("editChangelogTextarea")?.value.trim();
  if (!message) return;

    api(`/admin/changelog/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    })
    .then(res => res.json())
    .then(() => {
      fadeOutAndRemove(modalId);
      showGlobalModal({
        type: "success",
        title: "Updated",
        message: "Changelog message updated.",
        buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-changelogUpdated')` }],
        id: "modal-changelogUpdated"
      });
      loadChangelogEntries();
    })
    .catch(() => {
      showGlobalModal({
        type: "error",
        title: "Update Failed",
        message: "Could not update changelog.",
        buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-changelogUpdateFail')` }],
        id: "modal-changelogUpdateFail"
      });
    });
}

function deleteChangelog(id) {
  const modalId = `deleteChangelogModal-${id}`;
  showGlobalModal({
    type: "warning",
    title: "Delete Entry",
    message: "Are you sure you want to delete this changelog entry?",
    buttons: [
      { label: "Cancel", onClick: `fadeOutAndRemove('${modalId}')` },
      { label: "Delete", onClick: `confirmDeleteChangelog(${id}, '${modalId}')` }
    ],
    id: modalId
  });
}

function confirmDeleteChangelog(id, modalId) {
  api(`/admin/changelog/${id}`, { method: "DELETE" })
    .then(() => {
      fadeOutAndRemove(modalId);
      showGlobalModal({
        type: "success",
        title: "Deleted",
        message: "Changelog entry deleted successfully.",
        buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-changelogDeleted')` }],
        id: "modal-changelogDeleted"
      });
      loadChangelogEntries();
    })
    .catch(() => {
      showGlobalModal({
        type: "error",
        title: "Delete Failed",
        message: "Could not delete changelog entry.",
        buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-changelogDeleteFail')` }],
        id: "modal-changelogDeleteFail"
      });
    });
}
