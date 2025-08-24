let currentPage = 1;
const logsPerPage = 10;

document.addEventListener("DOMContentLoaded", async () => {
  const crateToggleBtn = document.getElementById("crate-toggle-btn");
  if (crateToggleBtn) {
    crateToggleBtn.addEventListener("click", function () {
      console.log("Direct crate toggle btn clicked");
      toggleDropdown(this);
    });
  }

  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".crate-dropdown-btn");
    if (btn) {
      console.log("Crate dropdown button clicked:", btn);
      toggleDropdown(btn);
    }
  });

  try {
    const res = await fetch("https://simplesurvivalcollectibles.site/me", {
      credentials: "include",
    });

    if (res.status === 401) {
      // Try refreshing the token
      const refreshRes = await fetch("https://simplesurvivalcollectibles.site/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (refreshRes.ok) {
        // Retry /me after refresh
        const retry = await fetch("https://simplesurvivalcollectibles.site/me", {
          credentials: "include",
        });
        const retryData = await retry.json();

        if (retry.ok && retryData.role && (retryData.role === "Admin" || retryData.role === "SysAdmin")) {
          document.getElementById("adminContent").style.display = "block";
          initializeAdminPanel(retryData.role);
        } else {
          throw new Error("Retry failed or role invalid");
        }
      } else {
        throw new Error("Token refresh failed");
      }
    } else {
      const data = await res.json();
      if (!data.role || (data.role !== "Admin" && data.role !== "SysAdmin")) throw new Error("Unauthorized");

      document.getElementById("adminContent").style.display = "block";
      initializeAdminPanel(data.role);
    }
  } catch (err) {
    console.error("Auth check failed:", err);
    document.body.innerHTML = "";
    window.location.href = "404";
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

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabContents.forEach(tab => tab.style.display = "none");
      tabButtons.forEach(b => b.classList.remove("active"));
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.style.display = "block";
      btn.classList.add("active");
    });
  });

  tabContents.forEach(tab => tab.style.display = "none");
  tabButtons.forEach(b => b.classList.remove("active"));
  const activeUsersBtn = document.querySelector('[data-tab="usersTab"]');
  const activeUsersTab = document.getElementById("usersTab");
  if (activeUsersBtn && activeUsersTab) {
    activeUsersBtn.classList.add("active");
    activeUsersTab.style.display = "block";
  }

  if (role === "SysAdmin") {
    const sysadminTab = document.getElementById("sysadminTab");
    const rolesTabBtn = document.getElementById("rolesTabBtn");
    const auditTabBtn = document.getElementById("auditTabBtn");

    if (sysadminTab) sysadminTab.style.display = "inline-block";
    if (rolesTabBtn) rolesTabBtn.style.display = "inline-block";
    if (auditTabBtn) auditTabBtn.style.display = "inline-block";

    loadAuditLogs(currentPage);
  }

  const dbTabBtn = document.querySelector('[data-tab="dbTab"]');
  if (dbTabBtn) {
    dbTabBtn.addEventListener('click', () => loadCratesAndItems());

    // If DB tab happens to be active on initial load, populate immediately
    if (dbTabBtn.classList.contains('active')) {
      loadCratesAndItems();
    }
  }

  // ===== Tasks (Deletion Requests) =====
  const tasksTabBtn = document.querySelector('[data-tab="tasksTab"]');
  if (tasksTabBtn && (role === 'Admin' || role === 'SysAdmin')) {
    tasksTabBtn.addEventListener("click", () => loadDeletionRequests());

    // If Tasks tab is the default or already active when page loads:
    if (tasksTabBtn.classList.contains('active')) {
      loadDeletionRequests();
    }
  }

  // Small helper so we always hit the same origin with cookies:
  async function api(path, init = {}) {
    return fetch(`https://simplesurvivalcollectibles.site${path}`, {
      credentials: 'include',
      ...init
    });
  }

  const STATUS_MAP = {
    awaiting:     { label: 'Awaiting Approval', modalClass: 'kbm-awaiting', tagClass: 'awaiting' },
    in_progress:  { label: 'In Progress',       modalClass: 'kbm-inProgress', tagClass: 'in-progress' },
    completed:    { label: 'Completed',         modalClass: 'kbm-completed', tagClass: 'completed' }
  };
  const statusLabel = s => (STATUS_MAP[s]?.label || s);
  const statusTagCls = s => (STATUS_MAP[s]?.tagClass || '');
  const statusModalCls = s => (STATUS_MAP[s]?.modalClass || '');

  const STATUS_LABELS = {
    awaiting: 'Awaiting Approval',
    in_progress: 'In Progress',
    completed: 'Completed'
  };
  function getStatusLabel(s) {
    return STATUS_LABELS[s] || s;
  }
  function getStatusClass(s) {
    if (s === 'awaiting')    return 'kbm-awaiting';
    if (s === 'in_progress') return 'kbm-inProgress';
    if (s === 'completed')   return 'kbm-completed';
    return '';
  }

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

  async function loadDeletionRequests() {
    const data = await api('/admin/deletion-requests').then(r => r.json()).catch(() => []);

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
      btnWrap.innerHTML = `
        <button class="kbm-btn danger" id="kbm-archive">Remove Request</button>
        <button class="kbm-btn secondary" id="kbm-close">Close</button>
      `;
      document.getElementById('kbm-archive')?.addEventListener('click', () =>
        confirmArchive(r.id, r.username_snapshot, r.email_snapshot)
      );
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
    loadDeletionRequests();
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
      const res = await fetch(`https://simplesurvivalcollectibles.site/admin/deletion-requests/${id}/archive`, {
        method: 'PATCH',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Archive failed');

      showToast('Request removed from list');
      fadeOutAndRemove(modalId);
      window.closeTaskModal();

      // refresh the Tasks columns
      loadDeletionRequests();
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
      loadDeletionRequests();
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
  fetch("https://simplesurvivalcollectibles.site/admin/active-users", {
    credentials: "include"
  })
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById("activeUserList");
      list.innerHTML = "";
      data.forEach(user => {
        const li = document.createElement("li");
        li.innerHTML = role === "SysAdmin"
          ? `${user.username} (IP: ${user.last_ip}, Location: ${user.last_location}) <span class="role-tag ${user.role}">${user.role}</span>`
          : `${user.username} <span class="role-tag ${user.role}">${user.role}</span>`;
        list.appendChild(li);
      });
    });

  if (role === "SysAdmin") {
    fetch("https://simplesurvivalcollectibles.site/admin/all-users", {
      credentials: "include"
    })
      .then(res => res.json())
      .then(data => {
        const tableBody = document.getElementById("accountList");
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
      });

    fetch("https://simplesurvivalcollectibles.site/admin/all-users", {
      credentials: "include"
    })
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
    userRole = role;
    setupChangelogForm();
    loadChangelogEntries();
}

function loadCratesAndItems() {
  Promise.all([
    fetch("https://simplesurvivalcollectibles.site/admin/crates", {
      credentials: "include"
    }).then((res) => res.json()),
    fetch("https://simplesurvivalcollectibles.site/admin/items", {
      credentials: "include"
    }).then((res) => res.json()),
  ])
    .then(([crates, items]) => {
      const selector = document.getElementById("crate-selector");
      const form = document.getElementById("crate-edit-form");
      if (!selector || !form) return;

      // Populate crate dropdown
      selector.innerHTML =
        "<option disabled selected>Select a crate to edit</option>";
      selector.onchange = null;

      crates.forEach((crate) => {
        const option = document.createElement("option");
        option.value = crate.id;
        option.textContent = crate.crate_name;
        selector.appendChild(option);
      });

      // Attach event to update view based on selected crate
      selector.addEventListener("change", () => {
        const selectedCrateId = parseInt(selector.value);
        const selectedCrate = crates.find((c) => c.id === selectedCrateId);
        const relatedItems = items.filter(
          (i) => i.crate_id === selectedCrateId
        );

        const form = document.getElementById("crate-edit-form");
        form.innerHTML = `
          <button class="admin-action-btn add-item-btn" onclick="openAddItemModal(${
            selectedCrate.id
          })">Add New Item to Crate</button>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Crate Name</th>
                  <th>Crate Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${selectedCrate.id}</td>
                  <td>${selectedCrate.crate_name}</td>
                  <td>${
                    selectedCrate.is_cosmetic ? "Cosmetic" : "Non-Cosmetic"
                  }</td>
                  <td>
                    <button class="admin-action-btn" onclick="editCrate(${
                      selectedCrate.id
                    })">✏️</button>
                    ${
                      localStorage.getItem("role") === "SysAdmin"
                        ? `<button class="admin-action-btn delete" onclick="deleteCrate(${selectedCrate.id})">🗑️</button>`
                        : ""
                    }
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4>Items in Crate</h4>
          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Set</th>
                  <th>Icon</th>
                  <th>Tags</th>
                  <th>Tooltip</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${relatedItems
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.id}</td>
                    <td>${item.item_name}</td>
                    <td>${item.set_name}</td>
                    <td><img src="${
                      item.icon_url
                    }" alt="icon" class="item-icon" /></td>
                    <td>${(item.tags || [])
                      .map((t) => `<span class='tag'>${t}</span>`)
                      .join(" ")}</td>
                    <td>${item.tooltip || ""}</td>
                    <td>
                      <button class="admin-action-btn" onclick="editItem(${
                        item.id
                      })">✏️</button>
                      ${
                        localStorage.getItem("role") === "SysAdmin"
                          ? `<button class="admin-action-btn delete" onclick="deleteItem(${item.id})">🗑️</button>`
                          : ""
                      }
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      });
    })
    .catch((err) => {
      console.error("Failed to load crates or items:", err);
    });
}

function editCrate(crateId) {
  fetch("https://simplesurvivalcollectibles.site/admin/crates", {
    credentials: "include"
  })
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
  fetch(`https://simplesurvivalcollectibles.site/admin/items`, {
    credentials: "include"
  })
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
    };

    fetch(`https://simplesurvivalcollectibles.site/admin/crates/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
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

    fetch(`https://simplesurvivalcollectibles.site/admin/items/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
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
  ).textContent = `Selected Crate: ${crateName}`;

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

  fetch("https://simplesurvivalcollectibles.site/admin/items", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
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
  fetch(`https://simplesurvivalcollectibles.site/admin/crates/${crateId}`, {
    method: "DELETE",
    credentials: "include"
  }).then(() => {
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
  fetch(`https://simplesurvivalcollectibles.site/admin/items/${itemId}`, {
    method: "DELETE",
    credentials: "include"
  }).then(() => {
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
  fetch("https://simplesurvivalcollectibles.site/admin/crates", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      crate_name: crateName,
      is_cosmetic: parseInt(crateType)
    })
  })
    .then(res => res.json())
    .then(crate => {
      // Submit all items with the returned crate ID
      const promises = items.map(item =>
        fetch("https://simplesurvivalcollectibles.site/admin/items", {
          method: "POST",
          credentials: "include",
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
  fetch(
    `https://simplesurvivalcollectibles.site/admin/audit-logs?page=${page}&limit=10`,
    {
      credentials: "include",
    }
  )
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
  fetch(`https://simplesurvivalcollectibles.site/admin/audit-logs/${logId}`, {
    method: "DELETE",
    credentials: "include"
  }).then(() => {
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
  fetch("https://simplesurvivalcollectibles.site/admin/audit-logs", {
    method: "DELETE",
    credentials: "include"
  }).then(() => {
    showToast("Audit log successfully cleared.");
    loadAuditLogs(1);
    fadeOutAndRemove(modalId);
  });
}


function verifyUser(userId) {
  fetch("https://simplesurvivalcollectibles.site/admin/verify-user", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
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
  fetch("https://simplesurvivalcollectibles.site/admin/delete-user", {
    method: "DELETE",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId })
  }).then(() => {
    showToast("User deleted successfully.");
    setTimeout(() => location.reload(), 1000);
    fadeOutAndRemove(modalId);
  });
}

function changeRole(userId) {
  const newRole = document.getElementById(`role-${userId}`).value;
  fetch("https://simplesurvivalcollectibles.site/admin/change-role", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
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

function exportAuditLogsAsCSV() {
  fetch("https://simplesurvivalcollectibles.site/admin/audit-logs?page=1&limit=10000", {
    credentials: "include"
  })
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
    fetch(`https://simplesurvivalcollectibles.site/admin/unlock-user/${userId}`, {
      method: "POST",
      credentials: "include"
    })
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
      const res = await fetch("https://simplesurvivalcollectibles.site/admin/changelog", {
        method: "POST",
        credentials: "include",
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
    const res = await fetch(`https://simplesurvivalcollectibles.site/changelog?page=${page}`, {
      credentials: "include"
    });

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

  fetch(`https://simplesurvivalcollectibles.site/admin/changelog/${id}`, {
    method: "PUT",
    credentials: "include",
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
  fetch(`https://simplesurvivalcollectibles.site/admin/changelog/${id}`, {
    method: "DELETE",
    credentials: "include"
  })
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
