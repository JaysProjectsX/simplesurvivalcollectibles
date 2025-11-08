window.backendUrl = "/api";
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

  // Normalize path:
  //   - lowercase
  //   - strip trailing slash
  //   - derive LAST = last segment without ".html"
  const PATH = location.pathname.toLowerCase().replace(/\/+$/, "");
  const LAST = (PATH.split("/").filter(Boolean).pop() || "index")
               .replace(/\.html$/, "");

  const JUST_LOGGED_OUT = sessionStorage.getItem("justLoggedOut") === "1";

  const IS_LOGOUT_PAGE = LAST === "logout";
  const IS_LOGIN_PAGE  = LAST === "login";
  const HOME_URL       = "/";

  const isProbablyLoggedIn = () =>
    hasCookie("refreshToken") || !!localStorage.getItem("username");

  // If we’re on logout page, or we clearly don’t have an auth cookie,
  // skip hitting /me and /refresh entirely (prevents 401 spam).
  const shouldAttemptSession = !IS_LOGOUT_PAGE && hasCookie("refreshToken");

  async function resolveSession() {
    if (!shouldAttemptSession) return;
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
          localStorage.setItem("user_id", String(u.id || ""));
        }
      } else if (r.status === 401 || r.status === 403) {
        if (r.status === 403) {
          localStorage.clear();
          forceLogoutAndRedirect('deleted');
          return;
        }
      }
    } catch {}
  }

  window.__auth_ready = (async () => {
    await resolveSession();  // /me -> refresh -> /me (only if refresh cookie exists)
    return true;
  })();

  window.waitForAuthReady = function () {
    return (window.__auth_ready || Promise.resolve());
  };

  function hidePreloader() {
    el.style.opacity = "0";
    setTimeout(() => { el.style.display = "none"; }, 250);
  }

  // === Redirect reason handler (global) ===
  window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("redirectReason");

  if (reason === "sessionExpired") {
        showGlobalModal({
        type: "error",
        title: "Session Expired",
        message: "Your session token has expired and you were redirected to the home page.",
        buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-sessionExpired');` }],
        id: "modal-sessionExpired"
          });
  }

  if (reason === "shareExpired") {
      showGlobalModal({
        type: "warning",
        title: "Share Link Expired",
        message: "The shared collection link you were viewing has expired, so you were redirected to the home page.",
        buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-shareExpired')" }],
        id: "modal-shareExpired"
      });
  }

  // Clean up the URL so it doesn't stick around
  if (reason) {
    params.delete("redirectReason");
    window.history.replaceState({}, "", window.location.pathname);
  }
});

  document.addEventListener("DOMContentLoaded", async () => {
    await (window.__auth_ready || Promise.resolve());

    try { updateNavUI(); } catch {}
    try { paintAccountInfo(); } catch {}

    // Redirect rules
    if (IS_LOGIN_PAGE && isProbablyLoggedIn()) {
      window.location.replace(HOME_URL);
      return;
    }
    if (IS_LOGOUT_PAGE && !isProbablyLoggedIn() && !JUST_LOGGED_OUT) {
      window.location.replace(HOME_URL);
      return;
    }

    if (IS_LOGOUT_PAGE && JUST_LOGGED_OUT) {
      sessionStorage.removeItem("justLoggedOut");
    }

    const elapsed = Date.now() - started;
    if (elapsed < MIN_HOLD_MS) setTimeout(hidePreloader, MIN_HOLD_MS - elapsed);
    else hidePreloader();

    // If on logout page and logged in, perform one-shot logout but stay on page to show the static card
    if (IS_LOGOUT_PAGE && isProbablyLoggedIn()) {
      try { await fetch(`${backendUrl}/logout`, { method: "POST", credentials: "include" }); } catch {}
      sessionStorage.setItem("justLoggedOut", "1");
      localStorage.clear();
      try { updateNavUI(); } catch {}
    }

  });

  setTimeout(hidePreloader, SAFETY_TIMEOUT_MS);
})();


const AUTH = (() => {
  let refreshing = null;

  async function refreshOnce() {
    if (!refreshing) {
      refreshing = fetch(`${backendUrl}/refresh`, { method: "POST", credentials: "include" })
      .then(r => r.status)
      .catch(() => 0)
      .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  // fetch that auto-refreshes once on 401, and redirects on hard failures
  async function fetchWithAuth(input, init = {}) {
    const opts = { credentials: 'include', ...(init || {}) };
    const onLogoutPage = location.pathname.replace(/\/+$/, "").toLowerCase().endsWith("/logout");

    const r1 = await fetch(input, opts);

    if (r1.status === 403) {
      if (!onLogoutPage) forceLogoutAndRedirect('forbidden');
      return r1;
    }

    if (r1.status !== 401) return r1;

    const st = await refreshOnce();

    if (st === 401 || st === 403) {
      if (!onLogoutPage) forceLogoutAndRedirect('expired');
      return r1;
    }

    if (st === 0) return r1;

    const r2 = await fetch(input, opts);
    if ((r2.status === 401 || r2.status === 403) && !onLogoutPage) {
      forceLogoutAndRedirect(r2.status === 403 ? 'deleted' : 'expired');
    }
    return r2;
  }

  // expose minimal API
  return { fetchWithAuth, refreshOnce };
})();
window.fetchWithAuth = AUTH.fetchWithAuth;

// === AdminNotify (Polling-Only) =============================================

(() => {
  const TOGGLE_KEY_BASE = 'admin_notify_comments';
  const LAST_TS_BASE    = 'admin_notify_last_ts';
  const POLL_MS         = 10_000;

  function getUserId() {
    return (localStorage.getItem('user_id') || '').trim();
  }
  function toggleKey() {
    const uid = getUserId();
    return uid ? `${TOGGLE_KEY_BASE}:${uid}` : TOGGLE_KEY_BASE;
  }
  function lastTsKey() {
    const uid = getUserId();
    return uid ? `${LAST_TS_BASE}:${uid}` : LAST_TS_BASE;
  }
  function getLastTs() {
    try { return Number(localStorage.getItem(lastTsKey())) || 0; } catch { return 0; }
  }
  function setLastTs(ts) {
    try { localStorage.setItem(lastTsKey(), String(ts || 0)); } catch {}
  }
  function isPrivileged() {
    const r = localStorage.getItem('role');
    return r === 'Admin' || r === 'SysAdmin';
  }
  // Optional: only for init() to read existing pref (we don't save here)
  function loadPref() {
    try { enabled = localStorage.getItem(toggleKey()) === '1'; } catch { enabled = false; }
  }

  let pollTimer = null;
  let enabled   = false;
  let inflightCtrl = null; // NEW: abortable fetch controller

  // --- helpers unchanged (getUserId, isPrivileged, keys, load/save, get/setLastTs) ---

  function showCommentToast(c) {
    if (typeof window.ensureToastRoot === 'function') { try { window.ensureToastRoot(); } catch {} }
    if (typeof window.pcAdminNotifyToast === 'function') {
      window.pcAdminNotifyToast({
        itemName:   c.itemName,
        crateName:  c.crateName || c.crate_name,
        username:   c.byUsername,
        message:    c.message,
        createdAt:  c.createdAt
      });
    } else {
      console.debug('[AdminNotify]', c);
    }
  }

  async function pollOnce() {
    if (!enabled) return; // bail if turned off between intervals

    // Abort any previous request and create a fresh controller
    if (inflightCtrl) inflightCtrl.abort();
    inflightCtrl = new AbortController();

    const since = getLastTs() || (Date.now() - 60_000);
    let r;
    try {
      r = await AUTH.fetchWithAuth(
        `${backendUrl}/admin/comments/updates?since=${since}`,
        { credentials: 'include', signal: inflightCtrl.signal } // <-- abortable
      );
    } catch {
      return; // network/aborted
    }
    if (!r || !r.ok) return;

    let json;
    try { json = await r.json(); } catch { return; }
    const arr = Array.isArray(json?.comments) ? json.comments : [];
    if (!arr.length) return;

    const me = (localStorage.getItem('user_id') || '').trim();
    for (const c of arr) {
      if (me && String(c.byUserId) === String(me)) {
        if (c.createdAt) setLastTs(Math.max(getLastTs(), c.createdAt));
        continue;
      }
      showCommentToast(c);
      if (c.createdAt) setLastTs(Math.max(getLastTs(), c.createdAt));
    }
  }

  function startPolling() {
    if (pollTimer) return;
    if (!getLastTs()) setLastTs(Date.now());
    pollTimer = setInterval(pollOnce, POLL_MS);
    pollOnce();
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (inflightCtrl) { inflightCtrl.abort(); inflightCtrl = null; } // <-- stop the current fetch immediately

    // Defensive: if any legacy SSE is around, close it so it stops retrying
    if (window.__AdminNotifySSE && typeof window.__AdminNotifySSE.close === 'function') {
      try { window.__AdminNotifySSE.close(); } catch {}
      window.__AdminNotifySSE = null;
    }
  }

  function maybeStartStop() {
    if (!enabled || !isPrivileged()) { stopPolling(); return; }
    if (!pollTimer) startPolling();
  }

  function setEnabled(v) {
    enabled = !!v;                     // <-- no savePref here
    if (enabled && !getLastTs()) {
      setLastTs(Date.now());           // seed to avoid replay
    }
    maybeStartStop();                  // start/stop polling as needed
  }

  function init() {
    // Safe default: read once from localStorage using our key if present.
    // (Or leave enabled=false and rely solely on setEnabled from the page.)
    try { enabled = localStorage.getItem(toggleKey()) === '1'; } catch {}
    maybeStartStop();                  // <-- no loadPref call
  }

  function stop() { stopPolling(); }

  window.AdminNotify = { init, stop, setEnabled };
})();


// Initialize once DOM is ready (if you don't already elsewhere)
document.addEventListener('DOMContentLoaded', () => {
  if (window.AdminNotify && typeof window.AdminNotify.init === 'function') {
    window.AdminNotify.init();
  }
});
/* === END AdminNotify === */

// Light idle refresh (sliding session) without spam
let __auth_last_activity = Date.now();
["click","keydown","pointerdown"].forEach(ev => 
  window.addEventListener(ev, () => { __auth_last_activity = Date.now(); }, {passive:true})
);
setInterval(async () => {
  if (!localStorage.getItem("username")) return; // <-- no cookie, don’t ping

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

// === Admin toast renderer (site-wide, used by AdminNotify) ===
(function () {
  const LIFE_MS = 5000;

  function ensurePcToastRoot() {
    let root = document.getElementById("pc-toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "pc-toast-root";
      root.className = "pc-toast-root";
      document.body.appendChild(root);
    }
    return root;
  }

  // Minimal safe escaper
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Inline info-circle SVG (color via CSS)
  const INFO_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a1.25 1.25 0 1 1 0 2.5A1.25 1.25 0 0 1 12 6zm2 11.5h-4v-1.5h1.25V11H10V9.5h3v6H14z"/>
    </svg>`;

  function iconFor(type) {
    return INFO_SVG; // using "info" look for now
  }

  // Called by AdminNotify
  window.pcAdminNotifyToast = function ({
    itemName,
    crateName,
    username,
    message,
    createdAt,
    type = "info"
  }) {
    const root = ensurePcToastRoot();

    // compute ts FIRST so the template can use it
    const ts = (createdAt && !isNaN(new Date(Number(createdAt))))
      ? new Date(Number(createdAt)).toLocaleString()
      : (createdAt && !isNaN(new Date(createdAt)))
        ? new Date(createdAt).toLocaleString()
        : "";

    const toast = document.createElement("div");
    toast.className = `pc-toast ${type}`;
    toast.innerHTML = `
      <button class="x" aria-label="Close" type="button">&times;</button>
      <div class="outer-container">${iconFor(type)}</div>
      <div class="inner-container">
        <p class="t-line1">New comment from: <b>${esc(username)}</b></p>
        <p class="t-line2">${esc(crateName || "Unknown crate")} — ${esc(itemName || "")}</p>
        <p class="t-line3">${esc(message || "")}</p>
        <p class="t-line4">${esc(ts)}</p>
      </div>
    `;

    const close = () => {
      toast.classList.add("toast-exit");
      setTimeout(() => toast.remove(), 300);
    };
    toast.querySelector(".x")?.addEventListener("click", close);

    root.prepend(toast);
    requestAnimationFrame(() => toast.classList.add("toast-enter"));
    setTimeout(close, 5000);
  };

  // Keep this for AdminNotify.showCommentToast() which calls ensureToastRoot()
  window.ensureToastRoot = ensurePcToastRoot;
})();

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

    const p = location.pathname.replace(/\/+$/, "").toLowerCase();
      const onLogout = p.endsWith("/logout");
      const onLogin  = p.endsWith("/login");

      // Never probe /me on login/logout pages; it can 401→refresh→force redirect.
      if (!onLogout && !onLogin && hasCookie("refreshToken")) {
        fetchAccountInfo();
      }

      if (document.getElementById("accUsername")) {
        paintAccountInfo();
        if (!onLogout && !onLogin && hasCookie("refreshToken") && !localStorage.getItem("username")) {
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
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-registerSuccessful'); setTimeout(() => {window.location.href = '/login';}, 100);` }],
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

        const emailInput = this.querySelector('input[type="email"], input[type="text"]');
        const passInput  = this.querySelector('input[type="password"]');
        const email = (emailInput?.value || "").trim();
        const password = passInput?.value || "";

        // Optional: basic front-end guard
        if (!email || !password) {
          showGlobalModal({
            type: "error",
            title: "Missing Info",
            message: "Please enter both email and password.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-missingCreds')` }],
            id: "modal-missingCreds"
          });
          return;
        }

        try {
          const res = await fetch(`${backendUrl}/login`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          const data = await res.json().catch(() => ({}));

          if (res.status === 429) {
            if (data && typeof data.lockoutRemaining === "number") {
              showLockoutModal(data.lockoutRemaining);
              return;
            }
            // Fallback if 429 but no structured payload
            showGlobalModal({
              type: "error",
              title: "Too Many Attempts",
              message: "Please wait a bit before trying again.",
              buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-429')` }],
              id: "modal-429"
            });
            return;
          }

          if (res.ok) {
            // Safari-safe: wait briefly for Set-Cookie, then probe /me without triggering redirects
            async function probeAccountInfoOnce() {
              try {
                const r = await fetch(`${backendUrl}/me`, { credentials: "include" });
                if (!r.ok) return false;
                const u = await r.json().catch(() => null);
                if (!u) return false;
                localStorage.setItem("username", u.username || "");
                localStorage.setItem("email", u.email || "");
                localStorage.setItem("role", u.role || "User");
                localStorage.setItem("verified", u.verified ? "1" : "0");
                localStorage.setItem("created_at", u.created_at || "");
                localStorage.setItem("minecraft_username", u.minecraft_username || "");
                localStorage.setItem("minecraft_uuid", data.minecraft_uuid || "");
                localStorage.setItem("user_id", String(u.id || ""));
                updateNavUI();
                paintAccountInfo();

                return true;
              } catch { return false; }
            }

            // a couple of short retries handles Safari’s cookie commit timing
            for (let i = 0; i < 3; i++) {
              await new Promise(r => setTimeout(r, i === 0 ? 60 : 120));
              if (await probeAccountInfoOnce()) break;
            }

            const username = localStorage.getItem("username");
            showGlobalModal({
              type: "success",
              title: "Successfully Logged In",
              message: `Welcome back, ${username || "User"}!`,
              buttons: [{
                label: "Close",
                onClick: `fadeOutAndRemove('modal-successLogin'); setTimeout(() => { window.location.href = '/'; }, 900);`
              }],
              id: "modal-successLogin"
            });
            return;
          }

          // 403: unverified email
          if (res.status === 403 && data && typeof data.error === "string" &&
              /email\s+not\s+verified/i.test(data.error)) {
            const safeEmail = escapeHtml(email);
            showGlobalModal({
              type: "error",
              title: "Verify Your Email",
              message: `Your account has been created but your email isn’t verified yet.<br>Please click the link we sent to <b>${safeEmail}</b>.`,
              buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-unverified')` }],
              id: "modal-unverified"
            });
            return;
          }

          // Active session error
          if (data && typeof data.error === "string" && data.error.includes("active session")) {
            showGlobalModal({
              type: "error",
              title: "Login Failed",
              message: "This account already has an existing session. Please log out first or wait for the session to expire.",
              buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-sessionFailed')` }],
              id: "modal-sessionFailed"
            });
            return;
          }

          // Generic error fallback
          showGlobalModal({
            type: "error",
            title: "Login Failed",
            message: data && data.error ? String(data.error) : "An error occurred while logging in.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-loginFailed')` }],
            id: "modal-loginFailed"
          });
        } catch (err) {
          showGlobalModal({
            type: "error",
            title: "Login Request Failed",
            message: "A network error occurred while trying to log in.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-loginErrFailed')` }],
            id: "modal-loginErrFailed"
          });
          console.error(err);
        }
      });
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    if (document.getElementById("kpi-total")) {
      computeAccountTotals().catch(() => {});
    }

    // Account page – change password
    const pwForm = document.getElementById("passwordChangeForm");
    if (pwForm) {
      const curEl = document.getElementById("currentPassword");
      const newEl = document.getElementById("newPassword");
      const conEl = document.getElementById("confirmPassword");

      // helpers
      const setFieldState = (el, state /* 'valid' | 'invalid' | 'neutral' */, msg = "") => {
        if (!el) return;
        const wrapper = el.closest(".input-style-1");
        if (!wrapper) return;

        // ensure an error span exists
        let err = wrapper.querySelector(".input-error");
        if (!err) {
          err = document.createElement("div");
          err.className = "input-error";
          wrapper.appendChild(err);
        }

        // reset
        el.classList.remove("is-valid","is-invalid");
        wrapper.classList.remove("invalid");

        if (state === "valid") {
          el.classList.add("is-valid");
          err.textContent = "";
        } else if (state === "invalid") {
          el.classList.add("is-invalid");
          wrapper.classList.add("invalid");
          err.textContent = msg || "Invalid value.";
        } else {
          err.textContent = "";
        }
      };

      const clearOnInput = (el) => {
        if (!el) return;
        el.addEventListener("input", () => setFieldState(el, "neutral"));
      };
      [curEl, newEl, conEl].forEach(clearOnInput);

      pwForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const current = curEl?.value ?? "";
        const newPass = newEl?.value ?? "";
        const confirm = conEl?.value ?? "";

        // ----- Client-side validation -----
        let hasError = false;

        if (!current.trim()) {
          setFieldState(curEl, "invalid", "Please enter your current password.");
          hasError = true;
        }
        if (!newPass.trim()) {
          setFieldState(newEl, "invalid", "Please enter a new password.");
          hasError = true;
        }
        if (!confirm.trim()) {
          setFieldState(conEl, "invalid", "Please confirm your new password.");
          hasError = true;
        }

        // Optional: enforce a minimum length (uncomment if you want it)
        // if (newPass && newPass.length < 8) {
        //   setFieldState(newEl, "invalid", "Use at least 8 characters.");
        //   hasError = true;
        // }

        if (newPass && confirm && newPass !== confirm) {
          setFieldState(conEl, "invalid", "New passwords do not match.");
          hasError = true;
        }

        if (hasError) {
          // focus first invalid field
          const firstInvalid = pwForm.querySelector(".is-invalid");
          if (firstInvalid) firstInvalid.focus();
          return;
        }

        // ----- Server request -----
        try {
          const res = await AUTH.fetchWithAuth(`${backendUrl}/change-password`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
          });

          const data = await res.json().catch(() => ({}));

          if (res.ok) {
            setFieldState(curEl, "valid");
            setFieldState(newEl, "valid");
            setFieldState(conEl, "valid");

            showGlobalModal({
              type: "success",
              title: "Password Changed",
              message: "Your password has been successfully changed.",
              buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-pwChangeSuccess')` }],
              id: "modal-pwChangeSuccess"
            });

            pwForm.reset();
            // clear validity state after reset
            [curEl, newEl, conEl].forEach(el => setFieldState(el, "neutral"));
          } else {
            const errMsg = (data.error || "").toLowerCase();

            // Heuristic: detect incorrect current password from server message
            if (errMsg.includes("current password") && errMsg.includes("incorrect")
            || errMsg.includes("invalid current")
            || errMsg.includes("wrong password")) {
              setFieldState(curEl, "invalid", "Current password is incorrect.");
              curEl?.focus();
            } else if (errMsg.includes("match") || errMsg.includes("confirm")) {
              setFieldState(conEl, "invalid", "New passwords do not match.");
              conEl?.focus();
            } else if (errMsg.includes("too short") || errMsg.includes("length")) {
              setFieldState(newEl, "invalid", data.error);
              newEl?.focus();
            } else {
              // generic failure: show modal and mark new password invalid as a hint
              setFieldState(newEl, "invalid");
              showGlobalModal({
                type: "error",
                title: "Password Change Failed",
                message: data.error || "An error occurred while changing your password. Please try again.",
                buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-pwChangeFailed')` }],
                id: "modal-pwChangeFailed"
              });
            }
          }
        } catch (err) {
          console.error("Password change error:", err);
          showGlobalModal({
            type: "error",
            title: "Server Error",
            message: "An internal error occurred while trying to change your password. Please try again later.",
            buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-pwInternalErr')` }],
            id: "modal-pwInternalErr"
          });
        }
      });

      // Checkbox: show/hide passwords
      const toggleCheckbox = document.getElementById("togglePassword") || document.getElementById("showPw");
      if (toggleCheckbox) {
        toggleCheckbox.addEventListener("change", function () {
          const type = this.checked ? "text" : "password";
          [curEl, newEl, conEl].forEach(el => { if (el) el.type = type; });
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

          const res = await AUTH.fetchWithAuth(`${backendUrl}/forgot-password`, {
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

            const res = await AUTH.fetchWithAuth(`${backendUrl}/reset-password`, {
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
                buttons: [{ label: "Close", onClick: `fadeOutAndRemove('modal-passwordResetComplete'); setTimeout(() => {window.location.href = '/login';}, 100);` }],
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

    function isBanned(item) {
      const pool = []
        .concat(item.tags || [])
        .concat(item.tag_names || [])
        .concat(item.tag_name ? [item.tag_name] : []);
      return pool.some(t => String(t).trim().toLowerCase() === "banned item");
    }

    /* === KPI: Total items collected across ALL crates === */
    async function computeAccountTotals() {
      await (window.__auth_ready || Promise.resolve());

      const totalEl = document.getElementById("kpi-total");
      const pctEl   = document.getElementById("kpi-completion");
      if (!totalEl && !pctEl) return;
      const loggedIn = !!localStorage.getItem("username") || hasCookie("refreshToken");

      try {
        if (totalEl) totalEl.textContent = "—";
        if (pctEl)   pctEl.textContent   = "—";

        // Pull crates list + user progress together
        const [cratesRes, progressRes] = await Promise.all([
          fetch(`${backendUrl}/crates`, { credentials: "include" }),
          loggedIn ? AUTH.fetchWithAuth(`${backendUrl}/user/progress`) : Promise.resolve(new Response(null, { status: 204 }))
        ]);
        if (!cratesRes.ok) throw new Error("Failed to load crates");
        const crates   = await cratesRes.json();
        const progress = progressRes.ok ? await progressRes.json() : {};

        const counts = await Promise.all(
          crates.map(async c => {
            const r = await fetch(`${backendUrl}/crates/${c.id}/items`, { credentials: "include" });
            let items = await r.json().catch(() => []);
            items = (Array.isArray(items) ? items : []).filter(it => !isBanned(it));

            return {
              id: c.id,
              total: items.length,
              allowedIds: new Set(items.map(i => Number(i.id) || i.id))
            };
          })
        );

        let grandTotal = 0;
        let grandOwned = 0;

        for (const c of counts) {
          grandTotal += c.total;
          const picked = (progress[c.id]?.items || []).map(x => Number(x) || x);
          grandOwned += picked.filter(id => c.allowedIds.has(id)).length;
        }

        if (totalEl) totalEl.textContent = `${grandOwned}/${grandTotal} items`;

        const pct = grandTotal ? Math.round((grandOwned / grandTotal) * 100) : 0;
        if (pctEl) pctEl.textContent = `${pct}% complete`;
      } catch (e) {
        console.error("computeAccountTotals error:", e);
        if (totalEl) totalEl.textContent = "—";
        if (pctEl)   pctEl.textContent   = "—";
      }
    }

  async function forceLogoutAndRedirect(cause = 'expired') {
    try {
      await fetch(`${backendUrl}/logout`, { method: 'POST', credentials: 'include' });
    } catch {}

    sessionStorage.setItem('justLoggedOut', '1');   // your preloader already reads this
    localStorage.clear();
    try { updateNavUI(); } catch {}

    // show the static logout card; keep a reason for messaging if you want
    const qs = cause ? `?reason=${encodeURIComponent(cause)}` : '';
    window.location.replace(`/logout${qs}`);
  }
    

  async function fetchAccountInfo() {
    try {
      const res = await AUTH.fetchWithAuth(`${backendUrl}/me`);

      if (res.status === 401) return;
      if (!res.ok) return handleUnauthenticated();

      const text = await res.text();
      const data = JSON.parse(text);
      localStorage.setItem("username", data.username);
      localStorage.setItem("email", data.email);
      localStorage.setItem("role", data.role);
      localStorage.setItem("verified", data.verified);
      localStorage.setItem("created_at", data.created_at);
      localStorage.setItem("minecraft_username", data.minecraft_username || "");
      localStorage.setItem("minecraft_uuid", data.minecraft_uuid || "");
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
          <a href="/account" class="dropdown-item">Account Options</a>
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
    loginItem.innerHTML = `<a href="/login">Login</a>`;
  }
}

function renderMinecraftRow() {
  const list = document.querySelector(".details-list");
  if (!list) return;

  // Find the "Verified Email" row to insert after
  const verifiedRow = Array.from(list.querySelectorAll(".detail-row"))
    .find(li => li.textContent.toLowerCase().includes("verified email"));

  // Build (or reuse) our row
  let row = document.getElementById("mcLinkRow");
  if (!row) {
    row = document.createElement("li");
    row.id = "mcLinkRow";
    row.className = "detail-row";
    if (verifiedRow && verifiedRow.nextSibling) {
      list.insertBefore(row, verifiedRow.nextSibling);
    } else {
      list.appendChild(row);
    }
  } else {
    // keep it positioned directly after Verified Email if layout changes
    if (verifiedRow && row.previousElementSibling !== verifiedRow) {
      list.insertBefore(row, verifiedRow.nextSibling);
    }
  }

  const mcName  = (localStorage.getItem("minecraft_username") || "").trim();
  const isLinked = !!mcName;

  // Right-side control: Link when not linked; Unlink when linked
  const rightHtml = isLinked
    ? `<button id="mcUnlinkBtn" class="mini-btn" type="button">Unlink</button>`
    : `<button id="mcLinkBtn" class="mini-btn" type="button">Link</button>`;

  row.innerHTML = `
    <div class="detail-left">
      <span class="detail-icon"><i class="lni lni-game"></i></span>
      <div class="detail-titles">
        <span class="p-title">Minecraft account linked?</span>
        <em>
          ${isLinked ? "true" : "false"}
          ${isLinked ? `&nbsp;(<span id="accMcName">${escapeHtml(mcName)}</span>)` : ""}
        </em>
      </div>
    </div>
    ${rightHtml}
  `;

  // --- Link button → show “enter code” modal ---
  const linkBtn = document.getElementById("mcLinkBtn");
  if (linkBtn) {
    linkBtn.addEventListener("click", () => {
      // make a little modal with an input
      showGlobalModal({
        type: "info",
        title: "Link your Minecraft account",
        // keep it simple HTML so it matches your existing modals
        message: `
          <p>1) Join <code>auth.aristois.net</code> in Minecraft.<br>
             2) You will be shown a <strong>6-digit code</strong>.<br>
             3) Paste it below within 5 minutes.</p>
          <div class="input-style-1" style="margin-top:.75rem">
            <input id="mcTokenInput" type="text" maxlength="8" placeholder="Enter 6-digit code" />
            <div class="input-error" style="display:none"></div>
          </div>
        `,
        buttons: [
          { label: "Copy server IP", onClick: "navigator.clipboard.writeText('auth.aristois.net')" },
          { label: "Verify",  style: "primary", onClick: "__mc_submitToken('modal-mcLink')" },
          { label: "Cancel",  style: "secondary", onClick: "fadeOutAndRemove('modal-mcLink')" }
        ],
        id: "modal-mcLink"
      });
      // autofocus after it renders
      setTimeout(() => document.getElementById("mcTokenInput")?.focus(), 50);
    });
  }

  // --- Unlink button: clear association on server, repaint UI ---
  const unlinkBtn = document.getElementById("mcUnlinkBtn");
  if (unlinkBtn) {
    unlinkBtn.addEventListener("click", async () => {
      try {
        const r = await AUTH.fetchWithAuth(`${backendUrl}/account/minecraft/unlink`, { method: "POST" });
        if (r.ok) {
          localStorage.removeItem("minecraft_username");
          localStorage.removeItem("minecraft_uuid");
          paintAccountInfo();
          showGlobalModal({
            type: "success",
            title: "Unlinked",
            message: "Your Minecraft account has been unlinked.",
            buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-mcUnlinked')" }],
            id: "modal-mcUnlinked"
          });
        } else {
          showGlobalModal({
            type: "error",
            title: "Unlink failed",
            message: "We couldn’t unlink your Minecraft account. Please try again.",
            buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-mcUnlinkFail')" }],
            id: "modal-mcUnlinkFail"
          });
        }
      } catch {
        showGlobalModal({
          type: "error",
          title: "Unlink failed",
          message: "A network error occurred. Please try again.",
          buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-mcUnlinkErr')" }],
          id: "modal-mcUnlinkErr"
        });
      }
    });
  }
}

window.__mc_submitToken = async function(modalId = 'modal-mcLink') {
  const input = document.getElementById("mcTokenInput");
  const token = (input?.value || "").trim();

  if (!token || token.length < 4) {
    showGlobalModal({
      type: "info",
      title: "Enter in your 6-digit code",
      message: "Please paste the 6-digit code you received in Minecraft.",
      buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-mcMissing')" }],
      id: "modal-mcMissing"
    });
    return;
  }

  try {
    const res = await AUTH.fetchWithAuth(`${backendUrl}/account/minecraft/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: token })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.username) {
      // Remember name locally, repaint, success modal
      localStorage.setItem("minecraft_username", data.username);
      paintAccountInfo();

      fadeOutAndRemove(modalId);
      showGlobalModal({
        type: "success",
        title: "Linked!",
        message: `Your account is now linked as <strong>${escapeHtml(data.username)}</strong>.`,
        buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-mcLinkedOk')" }],
        id: "modal-mcLinkedOk"
      });
    } else {
      const msg = data && (data.error || data.message) ? String(data.error || data.message) : "Could not verify this code.";
      showGlobalModal({
        type: "error",
        title: "Linking failed",
        message: msg,
        buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-mcLinkFail')" }],
        id: "modal-mcLinkFail"
      });
    }
  } catch (e) {
    showGlobalModal({
      type: "error",
      title: "Linking failed",
      message: "A network error occurred. Please try again.",
      buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-mcLinkErr')" }],
      id: "modal-mcLinkErr"
    });
  }
};

// simple HTML escaper used elsewhere in auth.js already
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  renderMinecraftRow();
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

  sessionStorage.setItem("justLoggedOut", "1");

  localStorage.clear();
  updateNavUI();
  window.location.href = "/logout";
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
  window.location.href = "/account";
}

window.toggleModal = function () {
  window.location.href = "/login";
};

window.toggleForm = function () {
  window.location.href = "/register";
};

window.toggleForgotPasswordForm = function () {
  window.location.href = "/forgot-password";
};

window.backToLoginFromForgot = function () {
  window.location.href = "/login";
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

// === Account: Request deletion (user-scoped, safe for non-admins) ===
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("requestDeletionBtn");
  const statusEl = document.getElementById("deletionStatus");
  if (!btn) return;

  initDeletionUI(btn, statusEl).catch(() => {});
});

async function initDeletionUI(btn, statusEl) {

  await (window.__auth_ready || Promise.resolve());

  async function fetchStatus() {
    try {
      const r = await AUTH.fetchWithAuth(`${backendUrl}/account/deletion-status`);
      if (!r.ok) return null;
      return await r.json(); // {status, scheduled_delete_at, requested_at, completed_at} | null
    } catch { return null; }
  }

  async function paintStatus() {
    const s = await fetchStatus();

    // default: user can request
    let label = "Request";
    let disabled = false;
    let tip = "";
    let badge = "";

    if (s) {
      switch (s.status) {
        case "awaiting":
          label = "Awaiting approval";
          disabled = true;
          tip = "Your request is pending review.";
          break;
        case "in_progress":
          label = "Scheduled";
          disabled = true;
          if (s.scheduled_delete_at) {
            const when = new Date(s.scheduled_delete_at).toLocaleString();
            tip = `Scheduled for ${when}`;
            badge = `Scheduled: ${when}`;
          }
          break;
        case "completed":
          label = "Deleted";
          disabled = true;
          tip = "Your account has been deleted.";
          badge = "Completed";
          break;
        case "denied":
        case "cancelled":
          // user can re-request
          label = "Request";
          disabled = false;
          tip = s.status === "denied" ? "Previous request was denied." : "Previous request was cancelled.";
          break;
      }
    }

    btn.textContent = label;
    btn.disabled = disabled;
    btn.title = tip;

    if (statusEl) statusEl.textContent = badge;
  }

  async function onRequest() {
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Requesting...";
    try {
      const res = await AUTH.fetchWithAuth(`${backendUrl}/account/request-deletion`, { method: "POST" });
      if (res.status === 409) {
        showGlobalModal({
          type: "warning",
          title: "Request Already Open",
          message: "You already have an open deletion request.",
          buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-req-open')" }],
          id: "modal-req-open"
        });
      } else if (res.ok) {
        showGlobalModal({
          type: "success",
          title: "Request Submitted",
          message: "Your request is awaiting admin approval.",
          buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-req-ok')" }],
          id: "modal-req-ok"
        });
      } else {
        showGlobalModal({
          type: "error",
          title: "Failed",
          message: "Could not submit your request. Please try again later.",
          buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-req-fail')" }],
          id: "modal-req-fail"
        });
      }
    } catch {
      showToast("Network error.", "error");
    } finally {
      await paintStatus();
    }
  }

  // initial paint + bind click
  await paintStatus();
  // bind once (button becomes disabled once the request is open)
  btn.addEventListener("click", onRequest, { once: true });
}

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