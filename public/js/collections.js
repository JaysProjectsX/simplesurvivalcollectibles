const collectionsContainer = document.getElementById("collectionsContainer");
const modal = document.getElementById("crateModal");
const modalTitle = document.getElementById("crateTitle");
const modalTable = document.getElementById("crateItemsTableBody");

let userProgress = {}; // fetched per user
const backendUrl2 = "https://simplesurvivalcollectibles.site";

// Fetch crates and their items
async function fetchCratesWithItems() {
  const res = await fetch(`${backendUrl2}/api/crates`);
  const crates = await res.json();

  const cratesWithItems = await Promise.all(
    crates.map(async (crate) => {
      const itemRes = await fetch(`${backendUrl2}/api/crates/${crate.id}/items`);
      const items = await itemRes.json();

      return {
        id: crate.id,
        name: crate.crate_name,
        items
      };
    })
  );

  return cratesWithItems;
}

// Fetch per-user progress
async function fetchUserProgress() {
  try {
    const res = await fetch(`${backendUrl2}/api/user/progress`, { credentials: "include" });

    if (!res.ok) {
      if (res.status === 401) {
        document.getElementById("preloader").style.display = "none";

        // Show full-page error
        document.body.innerHTML = `
          <div class="unauthorized-container">
            <h2>Unauthorized</h2>
            <p>Your session has expired or you are not logged in.</p>
            <p>Redirecting to home page in <span id="redirectTimer">5</span> seconds...</p>
          </div>
        `;

        // Countdown + redirect
        let countdown = 5;
        const timer = setInterval(() => {
          countdown--;
          document.getElementById("redirectTimer").textContent = countdown;
          if (countdown <= 0) {
            clearInterval(timer);
            window.location.href = "/index.html";
          }
        }, 1000);

        throw new Error("Unauthorized - stopping further execution");
      }
      throw new Error(`HTTP error! Status: ${res.status}`);
    }

    userProgress = await res.json();
  } catch (err) {
    console.error("Error fetching user progress:", err);
    throw err; // so the calling code won't try to render crates
  }
}

// Determine progress bar percentage and tag class
function calculateProgress(crateId, itemCount) {
  const collected = userProgress[crateId]?.items?.length || 0;
  const percent = Math.round((collected / itemCount) * 100);

  let tagClass = "tag-not-started";
  if (percent === 100) tagClass = "tag-complete";
  else if (percent > 0) tagClass = "tag-incomplete";

  return { percent, tagClass };
}

// Utility to format crate names like "valentinesCrate" -> "Valentines Crate"
function formatCrateName(rawName) {
  return rawName
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase
    .replace(/_/g, ' ') // replace underscores with space
    .replace(/\b\w/g, char => char.toUpperCase()); // capitalize first letter of each word
}

// Render cards for each crate
function renderCrates(crates) {
  collectionsContainer.innerHTML = ""; // clear before rendering

  crates.forEach(crate => {
    const { percent, tagClass } = calculateProgress(crate.id, crate.items.length);
    const lastSaved = userProgress[crate.id]?.updatedAt || "Never";

    const collectedCount = userProgress[crate.id]?.items?.length || 0;
    const totalCount = crate.items.length;

    const card = document.createElement("div");
    card.className = "crate-card";

    card.innerHTML = `
      <div class="card-tag ${tagClass}">
        ${tagClass === "tag-complete" ? "Completed" : tagClass === "tag-incomplete" ? "Incomplete" : "Not Started"}
      </div>
      <h3>${formatCrateName(crate.name)}</h3>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: ${percent}%">${percent}%</div>
      </div>
      <div class="crate-date">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 5px;">
          <path d="M12 1a11 11 0 1 0 11 11A11.013 11.013 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9a9.01 9.01 0 0 1-9 9Zm.5-9.793V7a1 1 0 0 0-2 0v5a1 1 0 0 0 .293.707l3.5 3.5a1 1 0 0 0 1.414-1.414Z"/>
        </svg>
        ${lastSaved !== "Never" ? new Date(lastSaved).toLocaleDateString() : "Never"}
      </div>
      <div class="crate-count">${collectedCount}/${totalCount} items</div>
    `;

    card.addEventListener("click", () => openCrateModal(crate));
    collectionsContainer.appendChild(card);
  });
}

// Open modal with crate items
function openCrateModal(crate) {
  modalTitle.textContent = crate.name;
  modalTable.innerHTML = "";

  crate.items.forEach(item => {
    const isChecked = userProgress[crate.id]?.items?.includes(item.id);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${item.item_name}</td>
      <td>${item.set_name}</td>
      <td><img src="${item.icon_url}" alt="${item.item_name}"></td>
      <td><input type="checkbox" data-crate-id="${crate.id}" data-item-id="${item.id}" ${isChecked ? "checked" : ""}></td>
    `;

    modalTable.appendChild(tr);
  });

  modal.classList.add("show");
}

function closeModal() {
  modal.classList.remove("show");
}

// Initialize the page
(async () => {
  await fetchUserProgress();
  const crates = await fetchCratesWithItems();
  collectionsContainer.innerHTML = "";
  renderCrates(crates);
  document.getElementById("preloader").style.display = "none";
})();

// Modal save/cancel buttons
const saveButton = document.getElementById("saveProgressBtn");
const cancelButton = document.getElementById("cancelProgressBtn");

saveButton.addEventListener("click", async () => {
  document.getElementById("modalSavingOverlay").style.display = "flex";

  const checkboxes = modalTable.querySelectorAll("input[type='checkbox']");
  const savePromises = [];

  for (const checkbox of checkboxes) {
    const crateId = checkbox.dataset.crateId;
    const itemId = checkbox.dataset.itemId;
    const checked = checkbox.checked;

    savePromises.push(
      fetch(`${backendUrl2}/api/user/progress`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crateId, itemId, checked }),
      })
    );
  }

  await Promise.all(savePromises);

  // Hide overlay, refresh data
  document.getElementById("modalSavingOverlay").style.display = "none";
  modal.classList.add("hidden");
  await fetchUserProgress();
  console.log("userProgress after save:", userProgress);
  const crates = await fetchCratesWithItems();
  collectionsContainer.innerHTML = "";
  renderCrates(crates);
});

cancelButton.addEventListener("click", async () => {
  modal.classList.remove("show");
  await fetchUserProgress();
  const crates = await fetchCratesWithItems();
  collectionsContainer.innerHTML = "";
  renderCrates(crates);
});
