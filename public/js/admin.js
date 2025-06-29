document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || (role !== "Admin" && role !== "SysAdmin")) {
    window.location.href = "404.html";
    return;
  }

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
      const selectedTab = document.getElementById(btn.dataset.tab);
      if (selectedTab) selectedTab.style.display = "block";
    });
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    });
   });

  // Show SysAdmin-only tabs safely
  if (role === "SysAdmin") {
    const sysadminTab = document.getElementById("sysadminTab");
    const accountsTab = document.getElementById("accountsTab");
    const rolesTab = document.getElementById("rolesTab");
    const rolesTabBtn = document.getElementById("rolesTabBtn");
    const auditTabBtn = document.getElementById("auditTabBtn");

    if (sysadminTab) sysadminTab.style.display = "inline-block";
    if (accountsTab) accountsTab.style.display = "block";
    if (rolesTab) rolesTab.style.display = "block";
    if (rolesTabBtn) rolesTabBtn.style.display = "inline-block";
    if (auditTabBtn) auditTabBtn.style.display = "inline-block";

    // Load Audit Logs
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
  }).then(() => location.reload());
}

function deleteUser(userId) {
  if (!confirm("Are you sure?")) return;
  fetch("https://simplesurvivalcollectibles.site/admin/delete-user", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId })
  }).then(() => location.reload());
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
      alert("Role updated successfully");
      location.reload();
    })
    .catch(() => alert("Failed to update role"));
}
