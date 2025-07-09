const backendUrl = "https://simplesurvivalcollectibles.site";

// Toast Notification Function
const showToast = (msg, type = "success", duration = 3000) => {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "styled-toast show";

  const message = document.createElement("span");
  message.textContent = msg;

  const closeBtn = document.createElement("span");
  closeBtn.className = "toast-close";
  closeBtn.innerHTML = "&times;";
  closeBtn.onclick = () => container.removeChild(toast);

  const progress = document.createElement("div");
  progress.className = "toast-progress";
  progress.style.animationDuration = `${duration}ms`;

  toast.appendChild(message);
  toast.appendChild(closeBtn);
  toast.appendChild(progress);
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      if (toast.parentNode === container) container.removeChild(toast);
    }, 300);
  }, duration);
};

document.addEventListener("DOMContentLoaded", () => {
  updateNavUI(); // prevent flicker
  fetchAccountInfo();

  document.getElementById("registerForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("registerUsername").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;

    try {
      const res = await fetch(`${backendUrl}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        document.getElementById("authModal").style.display = "none";
        document.getElementById("registrationConfirmation").style.display = "block";
        showToast("Registered successfully! Check your email for verification.", "success");
      } else {
        showToast(data.error || "Registration failed.", "error");
      }
    } catch (err) {
      showToast("Registration request failed.", "error");
      console.error(err);
    }
  });

  document.getElementById("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = this.querySelector('input[type="text"]').value;
    const password = this.querySelector('input[type="password"]').value;

    try {
      const res = await fetch(`${backendUrl}/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok) {
        await fetchAccountInfo();
        document.getElementById("authModal").style.display = "none";
        showToast(`Logged in as: ${localStorage.getItem("username")}`, "success");
      } else {
        showToast(data.error || "Login failed", "error");
      }
    } catch (err) {
      showToast("Login request failed", "error");
      console.error(err);
    }
  });

  document.getElementById("passwordChangeForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const current = document.getElementById("currentPassword").value;
    const newPass = document.getElementById("newPassword").value;
    const confirm = document.getElementById("confirmPassword").value;

    if (newPass !== confirm) {
      showToast("New passwords do not match.", "error");
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/change-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
      });

      const data = await res.json();

      if (res.ok) {
        showToast("Password changed successfully!", "success");
        document.getElementById("passwordChangeForm").reset();
      } else {
        showToast(data.error || "Password change failed.", "error");
      }
    } catch (err) {
      console.error("Password change error:", err);
      showToast("Server error.", "error");
    }
  });
});

async function fetchAccountInfo() {
  try {
    const res = await fetch(`${backendUrl}/me`, {
      credentials: "include",
    });

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return fetchAccountInfo(); // retry after refresh
      } else {
        return handleUnauthenticated();
      }
    }

    const text = await res.text();
    const data = JSON.parse(text);
    localStorage.setItem("username", data.username);
    localStorage.setItem("email", data.email);
    localStorage.setItem("role", data.role);
    localStorage.setItem("verified", data.verified);
    localStorage.setItem("created_at", data.created_at);
    updateNavUI();
  } catch (err) {
    console.error("Failed to fetch account info", err);
    await handleUnauthenticated();
  }
}

async function handleUnauthenticated() {
  const wasLoggedIn = localStorage.getItem("username");
  localStorage.clear();
  updateNavUI();

  if (wasLoggedIn) {
    showToast("You have been logged out.", "success");
    try {
      await fetch(`${backendUrl}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      // Optional: log error silently
    }
  }
}

async function refreshAccessToken() {
  try {
    const res = await fetch(`${backendUrl}/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) throw new Error("Refresh token invalid or expired");

    // Access token is now refreshed silently via cookie
    return true;
  } catch (err) {
    console.error("Token refresh failed:", err);
    return false;
  }
}


function updateNavUI() {

  const loginItem = document.getElementById("loginItem");
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");

  if (username) {
    let roleTagColor = 'gray';
    if (role === 'Admin') roleTagColor = 'red';
    if (role === 'SysAdmin') roleTagColor = '#6ea8ff';

    const headerHTML = `
      <div class="dropdown-header">
        ${username}
        <span class="role-tag" style="background-color: ${roleTagColor}; color: white; margin-left: 0.5rem; padding: 2px 6px; font-size: 0.7rem; border-radius: 0.25rem; vertical-align: middle;">
          ${role}
        </span>
      </div>
    `;

    let roleLinks = '';
    if (role === 'Admin' || role === 'SysAdmin') {
      roleLinks = `
        <a href="/admin-dashboard" class="dropdown-item">Admin Dashboard</a>
        <a href="/collections" class="dropdown-item">Collections List</a>
        <div class="dropdown-divider"></div>
      `;
    } else {
      roleLinks = `
        <a href="/collections" class="dropdown-item">Collections List</a>
        <div class="dropdown-divider"></div>
      `;
    }

    loginItem.innerHTML = `
      <div class="user-dropdown">
        <span onclick="toggleDropdown()" class="username-link">${username}</span>
        <div class="dropdown-content" id="userDropdown">
          ${headerHTML}
          <a href="#" onclick="openAccountModal()" class="dropdown-item">Account Options</a>
          ${roleLinks}
          <a href="#" onclick="logout()" class="dropdown-item">Log Out</a>
        </div>
      </div>
    `;

    // Define dropdown toggle behavior
    window.toggleDropdown = function () {

      const dropdown = document.getElementById("userDropdown");
      dropdown.classList.toggle("show");
    };
  } else {
    loginItem.innerHTML = `<a href="#" onclick="toggleModal()">Login</a>`;
  }
}

async function logout() {
  try {
    await fetch(`${backendUrl}/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (err) {
    console.error("Logout request failed:", err);
  }

  localStorage.clear();
  updateNavUI();
  showToast("You have been logged out.", "success");
}

function openAccountModal() {
  const username = localStorage.getItem("username");
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");
  const verified = localStorage.getItem("verified");
  const createdRaw = localStorage.getItem("created_at");

  const createdDate = new Date(createdRaw);
  const formattedDate = createdDate.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  document.getElementById("accUsername").textContent = username;
  document.getElementById("accEmail").textContent = email;
  document.getElementById("accRole").textContent = role;

  const verifiedElem = document.getElementById("accVerified");
  verifiedElem.textContent = verified === "1" ? "true" : "false";
  verifiedElem.style.color = verified === "1" ? "limegreen" : "red";

  document.getElementById("accCreated").textContent = formattedDate;
  document.getElementById("accountModal").style.display = "block";
}

window.toggleModal = function () {
  const modal = document.getElementById("authModal");
  modal.style.display = modal.style.display === "block" ? "none" : "block";
};

window.toggleForm = function () {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const toggleTexts = document.querySelectorAll(".toggle-text");

  if (loginForm.style.display === "none") {
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    toggleTexts[0].style.display = "block";
    toggleTexts[1].style.display = "none";
  } else {
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    toggleTexts[0].style.display = "none";
    toggleTexts[1].style.display = "block";
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const toggleCheckbox = document.getElementById("togglePassword");
  if (toggleCheckbox) {
    toggleCheckbox.addEventListener("change", function () {
      const type = this.checked ? "text" : "password";
      document.querySelectorAll("#passwordChangeForm input[type='password'], #passwordChangeForm input[type='text']")
        .forEach(input => input.type = type);
    });
  }
});

window.onclick = function (event) {
  const authModal = document.getElementById("authModal");
  const accountModal = document.getElementById("accountModal");
  const dropdown = document.getElementById("userDropdown");
  const usernameLink = document.querySelector(".username-link");

  if (event.target === authModal) authModal.style.display = "none";
  if (event.target === accountModal) accountModal.style.display = "none";

  if (
    dropdown &&
    !dropdown.contains(event.target) &&
    usernameLink &&
    event.target !== usernameLink
  ) {
    dropdown.classList.remove("show");
  }
};
