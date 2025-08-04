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
  const res = await fetch(`${backendUrl2}/api/user/progress`, { credentials: "include" });
  userProgress = await res.json();
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

// Render cards for each crate
function renderCrates(crates) {
  crates.forEach(crate => {
    const { percent, tagClass } = calculateProgress(crate.id, crate.items.length);
    const lastSaved = userProgress[crate.id]?.updatedAt || "Never";

    const card = document.createElement("div");
    card.className = "crate-card";
    card.innerHTML = `
      <div class="card-tag ${tagClass}">${tagClass === "tag-complete" ? "Completed" : tagClass === "tag-incomplete" ? "Incomplete" : "Not Started"}</div>
      <h3>${crate.name}</h3>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: ${percent}%">${percent}%</div>
      </div>
      <div class="crate-date">Last saved: ${new Date(lastSaved).toLocaleDateString()}</div>
      <div class="crate-count">${crate.items.length} items</div>
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
