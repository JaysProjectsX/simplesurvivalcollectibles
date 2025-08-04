const collectionsContainer = document.getElementById("collectionsContainer");
const modal = document.getElementById("crateModal");
const modalTitle = document.getElementById("crateTitle");
const modalTable = document.getElementById("crateItemsTableBody");

let userProgress = {}; // fetched per user

async function fetchCrates() {
  const res = await fetch("/api/crates/all");
  return res.json();
}

async function fetchUserProgress() {
  const res = await fetch("/api/user/progress", { credentials: "include" });
  userProgress = await res.json();
}

function calculateProgress(crateId, itemCount) {
  const collected = userProgress[crateId]?.length || 0;
  const percent = Math.round((collected / itemCount) * 100);

  let tagClass = "tag-not-started";
  if (percent === 100) tagClass = "tag-complete";
  else if (percent > 0) tagClass = "tag-incomplete";

  return { percent, tagClass };
}

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
    `;

    card.addEventListener("click", () => openCrateModal(crate));
    collectionsContainer.appendChild(card);
  });
}

function openCrateModal(crate) {
  modalTitle.textContent = crate.name;
  modalTable.innerHTML = "";

  crate.items.forEach(item => {
    const isChecked = userProgress[crate.id]?.includes(item.id);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.set}</td>
      <td><img src="${item.icon_url}" alt="${item.name}"/></td>
      <td><input type="checkbox" ${isChecked ? "checked" : ""} onchange="updateProgress('${crate.id}', '${item.id}', this.checked)" /></td>
    `;

    modalTable.appendChild(tr);
  });

  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
}

async function updateProgress(crateId, itemId, checked) {
  await fetch("/api/user/progress", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ crateId, itemId, checked }),
  });
}

(async () => {
  await fetchUserProgress();
  const crates = await fetchCrates();
  renderCrates(crates);
})();
