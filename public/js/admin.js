document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || (role !== "Admin" && role !== "SysAdmin")) {
    window.location.href = "404.html";
    return;
  }

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  // Tab switching logic
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabContents.forEach(tab => tab.style.display = "none");
      tabButtons.forEach(b => b.classList.remove("active"));

      const target = document.getElementById(btn.dataset.tab);
      if (target) target.style.display = "block";
      btn.classList.add("active");
    });
  });

  // Force default "Active Users" tab on load
  tabContents.forEach(tab => tab.style.display = "none");
  tabButtons.forEach(b => b.classList.remove("active"));
  const activeUsersBtn = document.querySelector('[data-tab="usersTab"]');
  const activeUsersTab = document.getElementById("usersTab");
  if (activeUsersBtn && activeUsersTab) {
    activeUsersBtn.classList.add("active");
    activeUsersTab.style.display = "block";
  }

  // Enable SysAdmin-only buttons
  if (role === "SysAdmin") {
    const sysadminTab = document.getElementById("sysadminTab");
    const rolesTabBtn = document.getElementById("rolesTabBtn");
    const auditTabBtn = document.getElementById("auditTabBtn");

    if (sysadminTab) sysadminTab.style.display = "inline-block";
    if (rolesTabBtn) rolesTabBtn.style.display = "inline-block";
    if (auditTabBtn) auditTabBtn.style.display = "inline-block";

    // Fetch Audit Logs
    fetch("https://simplesurvivalcollectibles.site/admin/audit-logs", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        const tbody = document.getElementById("auditLogTable");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="3">No audit logs found.</td></tr>';
          return;
        }

        data.forEach(log => {
          const tr = document.createElement("tr");
          const formattedDate = new Date(log.timestamp).toLocaleString();
          tr.innerHTML = `
            <td>${log.user_id}</td>
            <td>${log.action}</td>
            <td>${formattedDate}</td>
          `;
          tbody.appendChild(tr);
        });
      })
      .catch(err => {
        console.error("Failed to load audit logs:", err);
        const tbody = document.getElementById("auditLogTable");
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="3">Failed to load logs.</td></tr>';
        }
      });
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
        li.textContent = role === "SysAdmin"
          ? `${user.username} (IP: ${user.last_ip}, Location: ${user.last_location})`
          : user.username;
        list.appendChild(li);
      });
    });

  // Load Account Management Table
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

    // Load Role Management Table
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

function verifyUser(userId) {
  fetch("https://simplesurvivalcollectibles.site/admin/verify-user", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId })
  }).then(() => {
    showToast("User verified successfully ✅");
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
      showToast("User role updated successfully 🛠️");
      setTimeout(() => location.reload(), 1000);
    })
    .catch(() => showToast("❌ Failed to update user role"));
}

// Toast Notification Helper
function showToast(message) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
