const backendUrl = "https://simplesurvivalcollectibles.site";
let currentUser = null;

/* === ADDED: Preloader-driven session bootstrap (uses your existing nav/update code) === */
function hasCookie(name) {
  return document.cookie
    .split(";")
    .some(c => c.trim().startsWith(name + "="));
}

(function () {
  const el = document.getElementById("preloader");
  if (!el) return;

  const SAFETY_TIMEOUT_MS = 4000;
  const MIN_HOLD_MS = 450;
  const started = Date.now();

  // Page flags
  const PAGE = location.pathname.split("/").pop();
  const IS_LOGOUT_PAGE = PAGE === "logout.html";

  // If we’re on logout page, or we clearly don’t have an auth cookie,
  // skip hitting /me and /refresh entirely (prevents 401 spam).
  const shouldAttemptSession = !IS_LOGOUT_PAGE && hasCookie("refreshToken");

  async function resolveSession() {
    if (!shouldAttemptSession) return; // <-- guard

    try {
      let r = await fetch(`${backendUrl}/me`, { credentials: "include" });

      if (r.status === 401) {
        const rr = await fetch(`${backendUrl}/refresh`, { method: "POST", credentials: "include" });
        if (rr.ok) r = await fetch(`${backendUrl}/me`, { credentials: "include" });
      }

      if (r.ok) {
        const u = await r.json().catch(() => null);
        if (u) {
          localStorage.setItem("username", u.username || "");
          localStorage.setItem("email", u.email || "");
          localStorage.setItem("role", u.role || "User");
          localStorage.setItem("verified", u.verified ? "1" : "0");
          localStorage.setItem("created_at", u.created_at || "");
        }
      } else if (r.status === 401 || r.status === 403) {
        localStorage.removeItem("username");
        localStorage.removeItem("email");
        localStorage.removeItem("role");
        localStorage.removeItem("verified");
        localStorage.removeItem("created_at");
      }
    } catch {
      // ignore
    }
  }

  function hidePreloader() {
    el.style.opacity = "0";
    setTimeout(() => { el.style.display = "none"; }, 250);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await resolveSession();

    if (typeof updateNavUI === "function") {
      try { updateNavUI(); } catch {}
      try { paintAccountInfo(); } catch {}
    }

    const elapsed = Date.now() - started;
    if (elapsed < MIN_HOLD_MS) {
      setTimeout(hidePreloader, MIN_HOLD_MS - elapsed);
    } else {
      hidePreloader();
    }

    // If this is the dedicated logout page, do a one-shot cleanup and bounce.
    if (IS_LOGOUT_PAGE) {
      try {
        await fetch(`${backendUrl}/logout`, { method: "POST", credentials: "include" });
      } catch {}
      localStorage.clear();
      try { updateNavUI(); } catch {}
    }
  });

  setTimeout(hidePreloader, SAFETY_TIMEOUT_MS);
})();


/* === ADDED: robust fetch wrapper & idle guard (non-destructive) === */
const AUTH = (() => {
  const backendUrl = "https://simplesurvivalcollectibles.site";
  let refreshing = null;

  async function refreshOnce() {
    if (!refreshing) {
      refreshing = fetch(`${backendUrl}/refresh`, { method: "POST", credentials: "include" })
        .then(r => r.ok).catch(() => false)
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  // fetch that auto-refreshes once on 401
  async function fetchWithAuth(input, init = {}) {
    const r1 = await fetch(input, { credentials: "include", ...init });
    if (r1.status !== 401) return r1;
    // try one refresh
    const ok = await refreshOnce();
    if (!ok) return r1;
    return fetch(input, { credentials: "include", ...init });
  }

  // expose minimal API
  return { fetchWithAuth, refreshOnce };
})();

// Light idle refresh (sliding session) without spam
let __auth_last_activity = Date.now();
["click","keydown","pointerdown"].forEach(ev => 
  window.addEventListener(ev, () => { __auth_last_activity = Date.now(); }, {passive:true})
);
setInterval(async () => {
  if (!hasCookie("refreshToken")) return; // <-- no cookie, don’t ping

  if (Date.now() - __auth_last_activity < 2 * 60 * 1000) {
    try { await AUTH.refreshOnce(); } catch {}
  }
}, 5 * 60 * 1000);
/* === END SESSION AUTH === */


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
    updateNavUI();

    if (hasCookie("refreshToken")) {
      fetchAccountInfo();
    }

    if (document.getElementById("accUsername")) {
      paintAccountInfo();
      if (hasCookie("refreshToken") && !localStorage.getItem("username")) {
        fetchAccountInfo().catch(() => {});
      }
    }

    // Registration page
    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
      registerForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        // Query within the form so it works even if IDs change to names later
        const usernameEl = this.querySelector("#registerUsername, [name='username']");
        const emailEl    = this.querySelector("#registerEmail, [name='email']");
        const passwordEl = this.querySelector("#registerPassword, [name='password']");
        const confirmEl  = this.querySelector("#registerConfirm, [name='confirmPassword']");
        const loader     = document.getElementById("registerLoading");

        if (!usernameEl || !emailEl || !passwordEl) {
            showGlobalModal({
            type: "error",
            title: "Missing Fields",
            message: "You're missing some required fields in the registration form. Please fill them out.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-registerMissingFields');` }],
            id: "modal-registerMissingFields"
          });
          return;
        }

        const username = usernameEl.value.trim();
        const email    = emailEl.value.trim();
        const password = passwordEl.value;
        const confirm  = confirmEl ? confirmEl.value : password;

        if (!username || !email || !password) {
            showGlobalModal({
            type: "error",
            title: "Missing Fields",
            message: "Please complete all fields in the registration form.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-registerMissingFields1');` }],
            id: "modal-registerMissingFields1"
          });
          return;
        }
        if (password !== confirm) {
            showGlobalModal({
            type: "error",
            title: "Incorrect Passwords",
            message: "The passwords you entered do not match. Please try again.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-registerIncorrectPasswords');` }],
            id: "modal-registerIncorrectPasswords"
          });
          return;
        }

        try {
          if (loader) loader.style.display = "block";

          const res = await fetch(`${backendUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password }),
          });

          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            showGlobalModal({
            type: "success",
            title: "Registration Successful",
            message: "Your account has been created successfully! Please check your email for a verification link. You cannot log in until you verify your email.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-registerSuccessful'); setTimeout(() => {window.location.href = '/login.html';}, 500);` }],
            id: "modal-registerSuccessful"
          });
          } else {
            showGlobalModal({
            type: "error",
            title: "Registration Failed",
            message: "" + (data.error || "An error occurred during registration. Please try again later."),
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-registerError');` }],
            id: "modal-registerError"
          });
          }
        } catch (err) {
          console.error(err);
            showGlobalModal({
            type: "error",
            title: "Registration Error",
            message: "A network error occurred while trying to register. Please try again later.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-registerNetworkError');` }],
            id: "modal-registerNetworkError"
          });
        } finally {
          if (loader) loader.style.display = "none";
        }
      });
    }


    // Login page
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const email = this.querySelector('input[type="text"], input[type="email"]').value.trim();
        const password = this.querySelector('input[type="password"]').value;

        try {
          const res = await fetch(`${backendUrl}/login`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          if (res.status === 429) {
            const data = await res.json().catch(() => ({}));
            if (data.lockoutRemaining) {
              showLockoutModal(data.lockoutRemaining);
              return;
            }
          }

          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            await fetchAccountInfo();
            const username = localStorage.getItem("username");
            showGlobalModal({
            type: "success",
            title: "Successfully Logged In",
            message: `Welcome back, ${username || "User"}!`,
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-successLogin'); setTimeout(() => {window.location.href = '/index.html';}, 900);` }],
            id: "modal-successLogin"
          });
          } else {
            if (data.error && data.error.includes("active session")) {
                showGlobalModal({
                type: "error",
                title: "Login Failed",
                message: "This account already has an existing session. Please log out first or wait for the session to expire.",
                buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-sessionFailed');` }],
                id: "modal-sessionFailed"
              });
            } else {
                showGlobalModal({
                type: "error",
                title: "Login Failed",
                message: "An error occurred while logging in.",
                buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-loginFailed');` }],
                id: "modal-loginFailed"
              });
            }
          }
        } catch (err) {
            showGlobalModal({
            type: "error",
            title: "Login Request Failed",
            message: "A network error occurred while trying to log in.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-loginErrFailed');` }],
            id: "modal-loginErrFailed"
          });
          console.error(err);
        }
      });
    }

    // Account page – change password
    const pwForm = document.getElementById("passwordChangeForm");
    if (pwForm) {
      pwForm.addEventListener("submit", async (e) => {
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
          });

          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            showToast("Password changed successfully!", "success");
            pwForm.reset();
          } else {
            showToast(data.error || "Password change failed.", "error");
          }
        } catch (err) {
          console.error("Password change error:", err);
          showToast("Server error.", "error");
        }
      });

      // Optional: show/hide password checkbox (only on account page)
      const toggleCheckbox = document.getElementById("togglePassword");
      if (toggleCheckbox) {
        toggleCheckbox.addEventListener("change", function () {
          const type = this.checked ? "text" : "password";
          ["currentPassword","newPassword","confirmPassword"].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.type = type;
          });
        });
      }
    }

    // Forgot/reset page (two-phase in one form)
    const forgotForm = document.getElementById("forgotPasswordForm");
    if (forgotForm) {
      const emailInput = document.getElementById("forgotEmail");
      const codeSection = document.getElementById("codeSection");
      const resetCodeInput = document.getElementById("resetCode");
      const newPasswordInput = document.getElementById("newResetPassword");
      const resetBtn = document.getElementById("resetPasswordButton");

      let resetEmail = "";

      // Phase 1: send code
      forgotForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!emailInput.value.trim()) {
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
          const loader = document.getElementById("resetLoading");
          if (loader) loader.style.display = "block";

          const res = await fetch(`${backendUrl}/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailInput.value.trim() })
          });

          const data = await res.json().catch(() => ({}));
          if (loader) loader.style.display = "none";

          if (res.ok) {
            showGlobalModal({
              type: "success",
              title: "Reset Code Sent",
              message: "A reset code has been sent to your email. Please check your inbox and spam folder.",
              buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetCodeSent')` }],
              id: "modal-passwordResetCodeSent"
            });
            document.getElementById("emailSection").style.display = "none";
            codeSection.style.display = "block";
            resetEmail = emailInput.value.trim();
            resetCodeInput.disabled = false;
            newPasswordInput.disabled = false;
            resetCodeInput.required = true;
            newPasswordInput.required = true;
          } else {
            showGlobalModal({
              type: "error",
              title: "Invalid Email",
              message: data.error || "There is no account associated with that email.",
              buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetCodeFailed')` }],
              id: "modal-passwordResetCodeFailed"
            });
          }
        } catch (err) {
          const loader = document.getElementById("resetLoading");
          if (loader) loader.style.display = "none";
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

      // Phase 2: reset password
      if (resetBtn) {
        resetBtn.addEventListener("click", async () => {
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
            const loader = document.getElementById("resetLoading");
            if (loader) loader.style.display = "block";

            const res = await fetch(`${backendUrl}/reset-password`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: resetEmail, code, newPassword })
            });

            const data = await res.json().catch(() => ({}));
            if (loader) loader.style.display = "none";

            if (res.ok) {
              showGlobalModal({
                type: "success",
                title: "Password Reset Successful",
                message: "You can now log in with your new password.",
                buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetComplete'); setTimeout(() => {window.location.href = '/login.html';}, 500);` }],
                id: "modal-passwordResetComplete"
              });
            } else {
              showGlobalModal({
                type: "error",
                title: "Invalid Code",
                message: data.error || "There was an error resetting your password. Please try again.",
                buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetCodeError')` }],
                id: "modal-passwordResetCodeError"
              });
            }
          } catch (err) {
            const loader = document.getElementById("resetLoading");
            if (loader) loader.style.display = "none";
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
      }
    }
  });

  async function fetchAccountInfo() {
    try {
      const res = await AUTH.fetchWithAuth(`${backendUrl}/me`);

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
      paintAccountInfo();
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
  if (!loginItem) return;

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
          <a href="/account.html" class="dropdown-item">Account Options</a>
          ${roleLinks}
          <a href="javascript:void(0)" onclick="logout()" class="dropdown-item">Log Out</a>
        </div>
      </div>
    `;

    window.toggleDropdown = function () {
      const dropdown = document.getElementById("userDropdown");
      if (dropdown) dropdown.classList.toggle("show");
    };
  } else {
    // Link to dedicated login page (no modal)
    loginItem.innerHTML = `<a href="/login.html">Login</a>`;
  }
}

/* === Paint account page from localStorage (safe if page doesn't have these IDs) === */
function paintAccountInfo() {
  // Quick exit if we're not on the account page
  if (!document.getElementById("accUsername")) return;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val ?? "—");
  };

  const u = localStorage.getItem("username");
  const e = localStorage.getItem("email");
  const r = localStorage.getItem("role");
  const v = localStorage.getItem("verified");
  const c = localStorage.getItem("created_at");

  set("accUsername", u || "—");
  set("accEmail", e || "—");
  set("accRole", r || "User");

  if (v !== null) {
    const verifiedBool = (v === "1" || v === "true" || v === 1 || v === true);
    set("accVerified", verifiedBool ? "true" : "false");
    const ve = document.getElementById("accVerified");
    if (ve) ve.style.color = verifiedBool ? "limegreen" : "red";
  }

  if (c) {
    const d = new Date(c);
    const formatted = isNaN(d)
      ? c
      : d.toLocaleString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
    set("accCreated", formatted);
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
  window.location.href = "/logout.html";
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
  window.location.href = "/account.html";
}

window.toggleModal = function () {
  window.location.href = "/login.html";
};

window.toggleForm = function () {
  window.location.href = "/register.html";
};

window.toggleForgotPasswordForm = function () {
  window.location.href = "/forgot-password.html";
};

window.backToLoginFromForgot = function () {
  window.location.href = "/login.html";
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