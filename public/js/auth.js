const backendUrl = "https://simplesurvivalcollectibles.site";
let currentUser = null;

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

function isLockedOut(user) {
  if (!user || user.failed_attempts === undefined || !user.last_failed_login) return false;

  const failedAttempts = parseInt(user.failed_attempts, 10);
  const lastFailed = new Date(user.last_failed_login);
  const now = new Date();
  const diff = now - lastFailed;

  return failedAttempts >= 3 && diff < 10 * 60 * 1000;
}

document.addEventListener("DOMContentLoaded", () => {
  updateNavUI(); // prevent flicker
  if (document.cookie.includes("refreshToken") || localStorage.getItem("username")) {
    fetchAccountInfo();
  }

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

      if (res.status === 429) {
        const data = await res.json();
        if (data.lockoutRemaining) {
          showLockoutModal(data.lockoutRemaining);
          return;
        }
      }

      const data = await res.json();
      if (res.ok) {
        await fetchAccountInfo();
        const username = localStorage.getItem("username");
        document.getElementById("authModal").style.display = "none";
        if (username) {
          showToast(`Logged in as: ${username}`, "success");
        } else {
          showToast("Login succeeded, but no username found", "warning");
        }
      } else {
        if (data.error && data.error.includes("active session")) {
          showToast("Login failed: Active session already exists", "error");
        } else {
          showToast(data.error || "Login failed", "error");
        }
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

  const forgotForm = document.getElementById("forgotPasswordForm");
  const emailInput = document.getElementById("forgotEmail");
  const codeSection = document.getElementById("codeSection");
  const resetCodeInput = document.getElementById("resetCode");
  const newPasswordInput = document.getElementById("newResetPassword");

  let resetEmail = ""; // for phase 2 tracking

  forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  resetCodeInput.required = false;
  newPasswordInput.required = false;

  const email = emailInput.value.trim();
  if (!email) {
    showGlobalModal({
      type: "error",
      title: "Missing Email",
      message: "Please enter your email address.",
      buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-forgotEmailError')` }],
      id: "modal-forgotEmailError"
    });
    return;
  }

  try {
    const res = await fetch(`${backendUrl}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = await res.json();
    if (res.ok) {
      showGlobalModal({
        type: "success",
        title: "Reset Code Sent",
        message: "A reset code has been sent to your email. Please check your inbox and spam folder.",
        buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetCodeSent')` }],
        id: "modal-passwordResetCodeSent"
      });
      codeSection.style.display = "block";
      resetEmail = email;
    } else {
      showGlobalModal({
        type: "error",
        title: "Error Sending Code",
        message: "There was an error sending the reset code.",
        buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetCodeFailed')` }],
        id: "modal-passwordResetCodeFailed"
      });
    }
  } catch (err) {
    showGlobalModal({
      type: "error",
      title: "Server Error",
      message: "An internal error occurred. Please try again.",
      buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetCodeError')` }],
      id: "modal-passwordResetCodeError"
    });
    console.error(err);
  }
});

document.getElementById("resetPasswordButton").addEventListener("click", async () => {
  resetCodeInput.required = true;
  newPasswordInput.required = true;

  const code = resetCodeInput.value.trim();
  const newPassword = newPasswordInput.value.trim();

  if (!code || !newPassword) {
    showGlobalModal({
      type: "error",
      title: "Missing Fields",
      message: "Please fill in all fields.",
      buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetMissingFields')` }],
      id: "modal-passwordResetMissingFields"
    });
    return;
  }

  try {
    const res = await fetch(`${backendUrl}/reset-password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: resetEmail,
        code,
        newPassword
      })
    });

    const data = await res.json();
    if (res.ok) {
      showGlobalModal({
        type: "success",
        title: "Password Reset Successful",
        message: "You can now log in with your new password.",
        buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetComplete')` }],
        id: "modal-passwordResetComplete"
      });
      forgotForm.reset();
      codeSection.style.display = "none";
      toggleForm(); // return to login
    } else {
      showGlobalModal({
        type: "error",
        title: "Invalid Code",
        message: "There was an error resetting your password. Please try again.",
        buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetCodeError')` }],
        id: "modal-passwordResetCodeError"
      });
    }
  } catch (err) {
    showGlobalModal({
      type: "error",
      title: "Internal Server Error",
      message: "Please try again later or contact support.",
      buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetServerError')` }],
      id: "modal-passwordResetServerError"
    });
    console.error(err);
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

function showLockoutModal(secondsRemaining) {
  let remaining = secondsRemaining;

  const updateTimerText = () => {
    const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
    const seconds = (remaining % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const modalId = "lockoutGlobalModal";

  // Clear existing modal if it's already open
  const existing = document.getElementById(modalId);
  if (existing) existing.remove();

  showGlobalModal({
    type: "error",
    title: "Account Temporarily Locked",
    message: `
      You’ve been locked out due to too many failed login attempts.<br>
      Please wait <span id="lockoutTimer">${updateTimerText()}</span> before trying again.
    `,
    buttons: [
      {
        label: "Close",
        onClick: `fadeOutAndRemove('${modalId}')`
      }
    ],
    id: modalId
  });

  const interval = setInterval(() => {
    remaining--;
    const timerElem = document.getElementById("lockoutTimer");
    if (timerElem) timerElem.textContent = updateTimerText();

    if (remaining < 0) {
      clearInterval(interval);
      const modal = document.getElementById(modalId);
      if (modal) modal.remove();
    }
  }, 1000);
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
  const forgotForm = document.getElementById("forgotPasswordForm");
  const toggleTexts = document.querySelectorAll(".toggle-text");
  const backToLogin = document.getElementById("backToLoginText");

  forgotForm.style.display = "none";
  backToLogin.style.display = "none";
  document.getElementById("codeSection").style.display = "none";
  forgotForm.reset();

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

window.toggleForgotPasswordForm = function () {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const forgotForm = document.getElementById("forgotPasswordForm");
  const toggleTexts = document.querySelectorAll(".toggle-text");
  const backToLogin = document.getElementById("backToLoginText");

  loginForm.style.display = "none";
  registerForm.style.display = "none";
  forgotForm.style.display = "block";
  toggleTexts.forEach(el => el.style.display = "none");
  backToLogin.style.display = "block";
};

window.backToLoginFromForgot = function () {
  // Reset and hide forgot form
  const forgotForm = document.getElementById("forgotPasswordForm");
  const codeSection = document.getElementById("codeSection");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const backToLogin = document.getElementById("backToLoginText");
  const toggleTexts = document.querySelectorAll(".toggle-text");

  forgotForm.reset();
  forgotForm.style.display = "none";
  codeSection.style.display = "none";

  loginForm.style.display = "block";
  registerForm.style.display = "none";
  backToLogin.style.display = "none";

  // Show both login-related toggle-texts
  toggleTexts[0].style.display = "block"; // "Don't have an account?"
  toggleTexts[1].style.display = "block"; // "Forgot your password?"
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