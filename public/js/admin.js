document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token || (role !== "Admin" && role !== "SysAdmin")) {
    window.location.href = "404.html";
    return;
  }

  // Sidebar tab switching logic
  document.querySelectorAll(".sidebar-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sidebar-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-section").forEach(section => section.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  if (role === "SysAdmin") {
    document.getElementById("sysadminTab").style.display = "block";
    document.getElementById("roleTab").style.display = "block";
  }

  // Load active users
  fetch("https://simplesurvivalcollectibles.site/admin/active-users", {
    headers: { Authorization: `Bearer ${token}` },
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

  // Load account management list
  if (role === "SysAdmin") {
    fetch("https://simplesurvivalcollectibles.site/admin/all-users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        const container = document.getElementById("accountList");
        container.innerHTML = data.map(user => `
          <div class="account-entry">
            <strong>${user.username}</strong> - ${user.email} - Verified: ${user.verified}
            <button onclick="verifyUser(${user.id})">Verify</button>
            <button onclick="deleteUser(${user.id})">Delete</button>
          </div>
        `).join("");
      });

    // Load Role Management table
    fetch("https://simplesurvivalcollectibles.site/admin/all-users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        const tbody = document.querySelector("#roleTable tbody");
        tbody.innerHTML = "";

        data.forEach(user => {
          const tr = document.createElement("tr");

          tr.innerHTML = `
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
            <td><button onclick="changeRole(${user.id})">Update</button></td>
          `;

          tbody.appendChild(tr);
        });
      });
  }
});

function verifyUser(userId) {
  fetch(`https://simplesurvivalcollectibles.site/admin/verify-user/${userId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json"
    }
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
