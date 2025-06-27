const backendUrl = "https://simplesurvivalcollectibles.site";

// Toast Notification Function
const showToast = (msg, type = 'success', duration = 4000) => {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast hidden';
  }, duration);
};

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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem("token", data.token);
      fetchAccountInfo(); // 🔄 NEW: fetch user info securely
      document.getElementById("authModal").style.display = "none";
      showToast(`Welcome ${data.username}!`, "success");
    } else {
      showToast(data.error || "Login failed", "error");
    }
  } catch (err) {
    showToast("Login request failed", "error");
    console.error(err);
  }
});

async function fetchAccountInfo() {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch(`${backendUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem("username", data.username);
      localStorage.setItem("email", data.email);
      localStorage.setItem("role", data.role);
      localStorage.setItem("verified", data.verified);
      updateNavUI();
    } else {
      logout();
    }
  } catch (err) {
    console.error("Failed to fetch account info", err);
    logout();
  }
}

// Update Navigation UI after login
function updateNavUI() {
  const loginLink = document.getElementById("navLogin");
  const loginItem = document.getElementById("loginItem");
  const username = localStorage.getItem("username");
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");
  const verified = localStorage.getItem("verified");

  if (username) {
    loginItem.innerHTML = `
      <div class="user-dropdown">
        <span onclick="toggleDropdown()" class="username-link">${username}</span>
        <div class="dropdown-content" id="userDropdown">
          <a href="#" onclick="openAccountModal()">Account Options</a>
          ${role === 'Admin' ? '<a href="admin.html">Admin Panel</a>' : '<a href="collections.html">Collections List</a>'}
          <a href="#" onclick="logout()">Log Out</a>
        </div>
      </div>
    `;
  } else {
    loginItem.innerHTML = `<a href="#" onclick="toggleModal()">Login</a>`;
  }
}

window.toggleDropdown = function () {
  const dropdown = document.getElementById("userDropdown");
  if (dropdown) {
    dropdown.classList.toggle("show");
  }
};

async function logout() {
  const token = localStorage.getItem("token");

  if (token) {
    try {
      await fetch(`${backendUrl}/logout`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    }
  }

  // Clear local storage regardless
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("email");
  localStorage.removeItem("role");
  localStorage.removeItem("verified");

  updateNavUI();
  showToast("You have been logged out.", "success");
}


function goToCollections() {
  window.location.href = "/collections.html";
}

function goToAdmin() {
  window.location.href = "/admin-dashboard.html";
}

function openAccountModal() {
  const username = localStorage.getItem("username");
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");
  const verified = localStorage.getItem("verified");
  alert(`Username: ${username}\nEmail: ${email}\nRole: ${role}\nVerified: ${verified}`);
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

window.onclick = function (event) {
  const modal = document.getElementById("authModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
};

window.addEventListener("DOMContentLoaded", fetchAccountInfo);
