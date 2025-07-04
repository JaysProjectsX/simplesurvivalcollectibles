let currentPage = 1;
const logsPerPage = 10;

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || (role !== "Admin" && role !== "SysAdmin")) {
    document.body.innerHTML = ""; // Prevents flicker
    window.location.href = "404";
    return;
  } else {
    document.getElementById("adminContent").style.display = "block";
  }

  document.getElementById("adminContent").style.display = "block";

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

    // Load paginated audit logs
    loadAuditLogs(currentPage);
  }

  // Load Active Users
  fetch("https://simplesurvivalcollectibles.site/admin/active-users", {
    headers: { Authorization: `Bearer ${token}` }
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
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        const tableBody = document.getElementById("accountList");
        tableBody.innerHTML = data.map(user => `
          <tr>
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.verified ? "Yes" : "No"}</td>
            <td>
              <button class="admin-action-btn verify" onclick="verifyUser(${user.id})">Verify</button>
              <button class="admin-action-btn delete" onclick="deleteUser(${user.id})">Delete</button>
            </td>
          </tr>
        `).join("");
      });

    fetch("https://simplesurvivalcollectibles.site/admin/all-users", {
      headers: { Authorization: `Bearer ${token}` }
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
});

function loadCratesAndItems() {
  const token = localStorage.getItem("token");

  Promise.all([
    fetch("https://simplesurvivalcollectibles.site/admin/crates", {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => res.json()),
    fetch("https://simplesurvivalcollectibles.site/admin/items", {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => res.json())
  ])
    .then(([crates, items]) => {
      const selector = document.getElementById("crate-selector");
      const form = document.getElementById("crate-edit-form");

      // Populate crate dropdown
      selector.innerHTML = '<option disabled selected>Select a crate to edit</option>';
      crates.forEach(crate => {
        const option = document.createElement("option");
        option.value = crate.id;
        option.textContent = crate.crate_name;
        selector.appendChild(option);
      });

      // Attach event to update view based on selected crate
      selector.addEventListener("change", () => {
        const selectedCrateId = parseInt(selector.value);
        const selectedCrate = crates.find(c => c.id === selectedCrateId);
        const relatedItems = items.filter(i => i.crate_id === selectedCrateId);

        const form = document.getElementById("crate-edit-form");
        form.innerHTML = `
          <button class="admin-action-btn add-item-btn" onclick="openAddItemModal(${selectedCrate.id})">Add New Item to Crate</button>

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
                  <td>${selectedCrate.is_cosmetic ? "Cosmetic" : "Non-Cosmetic"}</td>
                  <td>
                    <button class="admin-action-btn" onclick="editCrate(${selectedCrate.id})">✏️</button>
                    ${localStorage.getItem("role") === "SysAdmin" ? `<button class="admin-action-btn delete" onclick="deleteCrate(${selectedCrate.id})">🗑️</button>` : ""}
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
                ${relatedItems.map(item => `
                  <tr>
                    <td>${item.id}</td>
                    <td>${item.item_name}</td>
                    <td>${item.set_name}</td>
                    <td><img src="${item.icon_url}" alt="icon" class="item-icon" /></td>
                    <td>${(item.tags || []).map(t => `<span class='tag'>${t}</span>`).join(" ")}</td>
                    <td>${item.tooltip || ""}</td>
                    <td>
                      <button class="admin-action-btn" onclick="editItem(${item.id})">✏️</button>
                      ${localStorage.getItem("role") === "SysAdmin" ? `<button class="admin-action-btn delete" onclick="deleteItem(${item.id})">🗑️</button>` : ""}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
      });
    })
    .catch(err => {
      console.error("Failed to load crates or items:", err);
    });
}

  function editCrate(crateId) {
    const token = localStorage.getItem("token");

    fetch("https://simplesurvivalcollectibles.site/admin/crates", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(crates => {
        const crate = crates.find(c => c.id === crateId);
        if (!crate) return showToast("Crate not found.");

        // Pre-fill modal inputs
        document.getElementById("edit-crate-id").value = crate.id;
        document.getElementById("edit-crate-name").value = crate.crate_name;
        document.getElementById("edit-crate-type").value = crate.is_cosmetic ? "1" : "0";

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
    const token = localStorage.getItem("token");
    fetch(`https://simplesurvivalcollectibles.site/admin/items`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(items => {
        const item = items.find(i => i.id === itemId);
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

  document.getElementById("editCrateForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const token = localStorage.getItem("token");
    const id = document.getElementById("edit-crate-id").value;
    const updatedData = {
      crate_name: document.getElementById("edit-crate-name").value,
      is_cosmetic: parseInt(document.getElementById("edit-crate-type").value)
    };

    fetch(`https://simplesurvivalcollectibles.site/admin/crates/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updatedData)
    })
      .then(res => res.json())
      .then(() => {
        showToast("Crate updated successfully");
        closeEditCrateModal();
        loadCratesAndItems();
      })
      .catch(() => showToast("Failed to update crate"));
  });

  document.getElementById("editItemForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const token = localStorage.getItem("token");
    const id = document.getElementById("edit-item-id").value;
    const updatedData = {
      item_name: document.getElementById("edit-item-name").value,
      set_name: document.getElementById("edit-set-name").value,
      icon_url: document.getElementById("edit-icon-url").value,
      tags: document.getElementById("edit-tags").value.split(",").map(t => t.trim()),
      tooltip: document.getElementById("edit-tooltip").value
    };

    fetch(`https://simplesurvivalcollectibles.site/admin/items/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updatedData)
    })
      .then(res => res.json())
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
    document.getElementById("add-item-crate-label").textContent = `Selected Crate: ${crateName}`;

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

    const token = localStorage.getItem("token");
    const crate_id = document.getElementById("add-crate-id").value;
    const item_name = document.getElementById("add-item-name").value;
    const set_name = document.getElementById("add-set-name").value;
    const icon_url = document.getElementById("add-icon-url").value;
    const tags = document.getElementById("add-tags").value.split(",").map(t => t.trim());
    const tooltip = document.getElementById("add-tooltip").value;

    fetch("https://simplesurvivalcollectibles.site/admin/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ crate_id, item_name, set_name, icon_url, tags, tooltip })
    })
      .then(res => res.json())
      .then(() => {
        showToast("Item added successfully!");
        closeAddItemModal();
        loadCratesAndItems();
      })
      .catch(() => showToast("Failed to add item."));
  });


  function deleteCrate(crateId) {
    if (!confirm("Delete this crate?")) return;
    fetch(`https://simplesurvivalcollectibles.site/admin/crates/${crateId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    }).then(() => {
      showToast("Crate deleted successfully");
      loadCratesAndItems();
    });
  }

  function deleteItem(itemId) {
    if (!confirm("Delete this item?")) return;
    fetch(`https://simplesurvivalcollectibles.site/admin/items/${itemId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    }).then(() => {
      showToast("Item deleted successfully");
      loadCratesAndItems();
    });
  }

  // Call loader when switching to DB tab
  const dbTabBtn = document.querySelector('[data-tab="dbTab"]');
  if (dbTabBtn) {
    dbTabBtn.addEventListener("click", () => {
      loadCratesAndItems();
    });
  }

function loadAuditLogs(page = 1) {
  const token = localStorage.getItem("token");

  fetch(`https://simplesurvivalcollectibles.site/admin/audit-logs?page=${page}&limit=10`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(({ logs, total }) => {
      const tbody = document.getElementById("auditLogTable");
      const pagination = document.getElementById("auditPagination");
      tbody.innerHTML = "";

      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No audit logs found.</td></tr>';
        pagination.innerHTML = "";
        return;
      }

      logs.forEach(log => {
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
    .catch(err => {
      console.error("Failed to load audit logs:", err);
      document.getElementById("auditLogTable").innerHTML =
        '<tr><td colspan="4">Failed to load logs.</td></tr>';
    });
}

function deleteLog(logId) {
  if (!confirm("Delete this audit log entry?")) return;

  fetch(`https://simplesurvivalcollectibles.site/admin/audit-logs/${logId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  })
    .then(() => {
      showToast("Log entry deleted.");
      loadAuditLogs(currentPage);
    })
    .catch(() => showToast("Failed to delete log entry"));
}

function clearAuditLogs() {
  if (!confirm("Clear the entire audit log? This cannot be undone.")) return;

  fetch("https://simplesurvivalcollectibles.site/admin/audit-logs", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  })
    .then(() => {
      showToast("Audit log cleared.");
      loadAuditLogs(1);
    })
    .catch(() => showToast("Failed to clear audit log"));
}

function verifyUser(userId) {
  fetch("https://simplesurvivalcollectibles.site/admin/verify-user", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId })
  }).then(() => {
    showToast("User verified successfully");
    setTimeout(() => location.reload(), 1000);
  });
}

function deleteUser(userId) {
  if (!confirm("Are you sure you want to delete this user?")) return;
  fetch("https://simplesurvivalcollectibles.site/admin/delete-user", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId })
  }).then(() => {
    showToast("User deleted successfully 🗑️");
    setTimeout(() => location.reload(), 1000);
  });
}

function changeRole(userId) {
  const newRole = document.getElementById(`role-${userId}`).value;
  fetch("https://simplesurvivalcollectibles.site/admin/change-role", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId, newRole })
  })
    .then(res => res.json())
    .then(() => {
      showToast("User role updated successfully!");
      const row = document.getElementById(`role-${userId}`).closest("tr");
      row.style.backgroundColor = "#2a2a2a";
      setTimeout(() => (row.style.backgroundColor = ""), 1000);
    })
    .catch(() => showToast("Failed to update user role"));
}

// Horizontal subtab behavior inside Database Config tab
document.querySelectorAll('.db-subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.db-subtab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tabId = btn.dataset.tab;
    document.querySelectorAll('.db-subtab-content').forEach(tab => {
      tab.style.display = (tab.id === `db-tab-${tabId}`) ? 'block' : 'none';
    });
  });
});


function exportAuditLogsAsCSV() {
  const token = localStorage.getItem("token");

  fetch("https://simplesurvivalcollectibles.site/admin/audit-logs?page=1&limit=10000", {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(({ logs }) => {
      if (!logs || logs.length === 0) {
        showToast("No logs to export.");
        return;
      }

      const csvRows = [
        ["User ID", "Action", "Timestamp"]
      ];

      logs.forEach(log => {
        csvRows.push([
          `"${log.user_id}"`,
          `"${log.action}"`,
          `"${new Date(log.timestamp).toLocaleString()}"`
        ]);
      });

      const csvContent = csvRows.map(row => row.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast("CSV exported successfully");
    })
    .catch(() => showToast("Failed to export CSV"));
}
