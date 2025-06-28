document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // Redirect to 404 if unauthorized
  if (!token || (role !== "Admin" && role !== "SysAdmin")) {
    window.location.href = "404.html";
    return;
  }

  // Enable tab behavior
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-content").forEach(tab => tab.style.display = "none");
      document.getElementById(btn.dataset.tab).style.display = "block";
    });
  });

  // Reveal sysadmin-only tab if needed
  if (role === "SysAdmin") {
    document.getElementById("sysadminTab").style.display = "inline-block";
    document.getElementById("accountsTab").style.display = "block";
  }

  // Load active users
  fetch("https://simplesurvivalcollectibles.site/admin/active-users", {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById("activeUserList");
      list.innerHTML = "";
      data.users.forEach(user => {
        const li = document.createElement("li");
        li.textContent = role === "SysAdmin"
          ? `${user.username} (IP: ${user.last_ip}, Location: ${user.last_location})`
          : user.username;
        list.appendChild(li);
      });
    });

  // Load accounts if SysAdmin
  if (role === "SysAdmin") {
    fetch("https://simplesurvivalcollectibles.site/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        const container = document.getElementById("accountList");
        container.innerHTML = data.users.map(user => `
          <div class="account-entry">
            <strong>${user.username}</strong> - ${user.email} - Verified: ${user.verified}
            <button onclick="verifyUser(${user.id})">Verify</button>
            <button onclick="deleteUser(${user.id})">Delete</button>
          </div>
        `).join("");
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
  fetch(`https://simplesurvivalcollectibles.site/admin/delete-user/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    }
  }).then(() => location.reload());
}
