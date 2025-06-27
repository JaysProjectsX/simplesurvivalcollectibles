const backendUrl = import.meta.env?.VITE_BACKEND_URL || "http://localhost:3001";

document
  .getElementById("registerForm")
  .addEventListener("submit", async function (e) {
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
        document.getElementById("registrationConfirmation").style.display =
          "block";
      } else {
        alert(data.error || "Registration failed.");
      }
    } catch (err) {
      alert("Registration request failed.");
      console.error(err);
    }
  });

document
  .getElementById("loginForm")
  .addEventListener("submit", async function (e) {
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
        alert(`Welcome ${data.username}!`);
      } else {
        alert(data.error || "Login failed");
      }
    } catch (err) {
      alert("Login request failed");
      console.error(err);
    }
  });

// Modal toggle logic
function toggleModal() {
  const modal = document.getElementById("authModal");
  modal.style.display = modal.style.display === "block" ? "none" : "block";
}

function toggleForm() {
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
}

// Close modal when clicking outside it
window.onclick = function (event) {
  const modal = document.getElementById("authModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
};
