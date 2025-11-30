let currentPage = 1;
let _crateUiInitialised = false;
const logsPerPage = 10;

const api = (path, init) =>
AUTH.fetchWithAuth(`${(window.backendUrl || "/api")}${path}`, init);

// === View / Edit crates DataTables + editor-style toolbar ===
let crateItemsDt = null;
let crateSummaryDt = null;
let currentCrateId = null;
let selectedItemId = null;

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

    // Keep Role Management list as-is (usually you DON'T want deleted users here)
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

  function escapeHTML(s=''){ return s.replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

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

function loadCratesAndItems() {
  Promise.all([
    api('/admin/crates').then(res => res.json()),
    api('/admin/items').then(res => res.json()),
  ])
    .then(([crates, items]) => {
      const selector = document.getElementById("crate-selector");
      if (!selector) return;

      selector.innerHTML =
        "<option disabled selected>Select a crate to edit</option>";
      selector.onchange = null;

      crates.forEach((crate) => {
        const option = document.createElement("option");
        option.value = crate.id;
        option.textContent = crate.crate_name;
        selector.appendChild(option);
      });

      const sections = [
        document.getElementById("crate-info-wrapper"),
        document.getElementById("crate-items-wrapper")
      ];

      selector.addEventListener("change", () => {
        const selectedCrateId = parseInt(selector.value, 10);
        const selectedCrate = crates.find((c) => c.id === selectedCrateId);
        const relatedItems = items.filter((i) => i.crate_id === selectedCrateId);

        sections.forEach(s => s && s.classList.add("is-loading"));

        requestAnimationFrame(() => {
          renderCrateUi(selectedCrate, relatedItems);
          initItemsEditorToolbar(selectedCrateId);
          sections.forEach(s => s && s.classList.remove("is-loading"));
        });
      });
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

let items = [];

function nextStep(step) {
  // Step 1: Validate crate name
  if (step === 2) {
    const crateName = document.getElementById("crate-name").value.trim();
    if (!crateName) {
      showGlobalModal({
        type: "error",
        title: "Incomplete Item",
        message: "Please insert a crate name before proceeding.",
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-badItem')" }],
        id: "modal-badItem"
      });
      return;
    }
  }

  // Step 2 → Step 3: Validate item entries before showing summary
if (step === 3) {
  if (!validateItems()) return;

  const crateName = document.getElementById("crate-name").value.trim();
  document.getElementById("crate-dropdown-title").textContent = crateName;

  const tableBody = document.getElementById("crate-items-table-body");
  tableBody.innerHTML = "";

  items.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.set}</td>
      <td><img src="${item.icon}" alt="icon" style="width: 20px; height: 20px;" /></td>
      <td>${item.tags}</td>
      <td>${item.tooltip || ""}</td>
    `;
    tableBody.appendChild(row);
  });
}

  // Show target step
  document.querySelectorAll(".wizard-step").forEach(el => el.classList.add("hidden"));
  const target = document.getElementById(`step-${step}`);
  if (target) target.classList.remove("hidden");
}

function prevStep(step) {
  document.querySelectorAll('.wizard-step').forEach(el => el.classList.add('hidden'));
  const prev = document.getElementById(`step-${step}`);
  if (prev) prev.classList.remove('hidden');
}

function addItem() {
  const itemsContainer = document.getElementById("items-container");
  const id = Date.now();

  const itemHTML = `
    <div class="item-dropdown">
      <button class="crate-dropdown-btn" onclick="toggleItemDropdown(${id})">
        <span id="item-button-text-${id}">New Item</span>
        <span class="arrow">▼</span>
      </button>
      <div class="crate-dropdown-content hidden" id="item-content-${id}">
        <div class="nice-form-group">
          <label>Item Name:</label>
          <input type="text" name="itemName" placeholder="Enter item name"oninput="updateItemButtonText(${id}, this.value)" />
        </div>
        <div class="nice-form-group">
          <label>Set Name:</label>
          <input type="text" name="setName" placeholder="Enter set name"/>
        </div>
        <div class="nice-form-group">
          <label>Icon:</label>
          <input type="text" name="icon" placeholder="Enter icon URL"/>
          <small class="hint-text icons-url" onclick="window.open('https://mc.nerothe.com/')">To view usable item icons, click here</small>
        </div>
        <div class="nice-form-group">
          <label>Tags (comma-separated):</label>
          <input type="text" name="tags" placeholder="Example: Cosmetic, Wings"/>
        </div>
        <div class="nice-form-group">
          <label>Tooltip:</label>
          <textarea name="tooltip" placeholder="Optional tooltip"></textarea>
        </div>
        <button class="modal-btn" onclick="this.closest('.item-dropdown').remove()">Remove Item</button>
      </div>
    </div>
  `;

  itemsContainer.insertAdjacentHTML("beforeend", itemHTML);

    items.push({
    id,
    name: "",
    set: "",
    icon: "",
    tags: "",
    tooltip: ""
  });
}

function toggleItemDropdown(id) {
  const content = document.getElementById(`item-content-${id}`);
  const arrow = document.querySelector(`#item-button-text-${id}`).nextElementSibling;

  if (content.classList.contains("hidden")) {
    content.classList.remove("hidden");
    content.style.maxHeight = content.scrollHeight + "px";
    arrow.style.transform = "rotate(180deg)";
  } else {
    content.style.maxHeight = "0";
    arrow.style.transform = "rotate(0deg)";
    setTimeout(() => content.classList.add("hidden"), 500);
  }
}

function updateItemButtonText(id, value) {
  document.getElementById(`item-button-text-${id}`).innerText = value || "New Item";
}

function removeItem(id) {
  document.querySelector(`.item-form[data-id="${id}"]`)?.remove();
}

function toggleCrateDropdown() {
  const content = document.getElementById("crate-dropdown-content-confirm");
  const arrow = document.querySelector("#crate-dropdown-title + .arrow");

  if (!content) return;

  const isExpanded = !content.classList.contains("hidden") && content.style.maxHeight !== "0px";

  if (isExpanded) {
    content.style.maxHeight = "0";
    if (arrow) arrow.style.transform = "rotate(0deg)";
    setTimeout(() => {
      content.classList.add("hidden");
      content.removeAttribute("style");
    }, 500);
  } else {
    content.classList.remove("hidden");
    void content.offsetHeight; // Force reflow
    content.style.maxHeight = content.scrollHeight + "px";
    if (arrow) arrow.style.transform = "rotate(180deg)";
  }
}

function validateItems() {
  const step2 = document.getElementById("step-2");
  const itemElements = step2.querySelectorAll(".item-dropdown");
  items = [];

  for (const el of itemElements) {
    const get = name => el.querySelector(`[name="${name}"]`)?.value.trim() || "";
    const item = {
      name: get("itemName"),
      set: get("setName"),
      icon: get("icon"),
      tags: get("tags"),
      tooltip: get("tooltip")
    };

    if (!item.name || !item.set || !item.icon || !item.tags) {
      showGlobalModal({
        type: "error",
        title: "Incomplete Item",
        message: "Each item must have a name, set, icon, and tags. Tooltip is optional.",
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-badItem')" }],
        id: "modal-badItem"
      });
      return false;
    }

    items.push(item);
  }

  return true;
}

function submitCrate() {
  const crateName = document.getElementById("crate-name").value.trim();
  const crateType = document.querySelector('input[name="crate-type"]:checked')?.value;
  const isHidden = parseInt(
    document.querySelector('input[name="crate-visibility"]:checked')?.value || "0",
    10
  );

  // Validate crate name
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

  // Validate crate type
  if (!crateType) {
    showGlobalModal({
      type: "error",
      title: "Missing Crate Type",
      message: "Please select a crate type.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-crateType')" }],
      id: "modal-crateType"
    });
    return;
  }

  // Validate items
  if (!validateItems()) return;

  // Submit crate
  api('/admin/crates', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      crate_name: crateName,
      is_cosmetic: parseInt(crateType),
      is_hidden: isHidden
    })
  })
    .then(res => res.json())
    .then(crate => {
      // Submit all items with the returned crate ID
      const promises = items.map(item =>
        api('/admin/items', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            crate_id: crate.id,
            item_name: item.name,
            set_name: item.set,
            icon_url: item.icon,
            tags: item.tags.split(",").map(t => t.trim()),
            tooltip: item.tooltip
          })
        })
      );

      return Promise.all(promises);
    })
    .then(() => {
      showGlobalModal({
        type: "success",
        title: "Crate Created",
        message: "Your crate and items were successfully saved!",
        buttons: [{
          label: "Close",
          onClick: "fadeOutAndRemove('modal-crateSuccess')"
        }],
        id: "modal-crateSuccess"
      });

      // Reset wizard and clear data
      document.getElementById("crate-name").value = "";
      document.querySelector('input[name="crate-type"][value="1"]').checked = true;
      document.getElementById("items-container").innerHTML = "";
      items = [];

      // Go back to step 1
      document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
      document.getElementById("step-1").classList.remove("hidden");

      // Optional: reload UI
      loadCratesAndItems();
    })
    .catch(err => {
      console.error("Crate creation failed:", err);
      showGlobalModal({
        type: "error",
        title: "Submission Failed",
        message: "There was an error creating the crate. Please try again.",
        buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-submitError')" }],
        id: "modal-submitError"
      });
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
