const collectionsContainer = document.getElementById("collectionsContainer");
const modal = document.getElementById("crateModal");
const modalTitle = document.getElementById("crateTitle");
const modalTable = document.getElementById("crateItemsTableBody");

const modalContentEl = document.getElementById("crateModalContent");
const accordionContainer = document.getElementById("accordionContainer");
let openCrateId = null; // track which crate is open

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
            window.location.href = "/";
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

// Utility to format crate names
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

    // Set the bottom border color based on tagClass
    let borderColor;
    if (tagClass === "tag-complete") borderColor = "rgb(66, 210, 157)"; // green
    else if (tagClass === "tag-incomplete") borderColor = "#f7c800"; // yellow
    else borderColor = "rgb(250, 90, 120)"; // red
    card.style.borderBottom = `3px solid ${borderColor}`;

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
  openCrateId = crate.id;
  modalTitle.textContent = formatCrateName(crate.name);

  // Group items by set_name
  const groups = crate.items.reduce((acc, item) => {
    const key = item.set_name || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  // Sort group names A->Z
  const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  // Clear old accordion content
  accordionContainer.innerHTML = "";

  // Build each accordion group
  groupNames.forEach((groupName, idx) => {
    // Sort items by item_name within group
    groups[groupName].sort((a, b) => a.item_name.localeCompare(b.item_name));

    const accItem = document.createElement("div");
    accItem.className = "acc-item";

    // Header button
    const btn = document.createElement("button");
    btn.className = "acc-btn";
    btn.setAttribute("type", "button");

    // Count checked in this group
    const total = groups[groupName].length;
    const checkedCount = groups[groupName].filter(it =>
      userProgress[crate.id]?.items?.includes(it.id)
    ).length;

    btn.innerHTML = `
      <span class="acc-title">${groupName}</span>
      <span class="acc-meta">${checkedCount}/${total}</span>
      <span class="acc-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M7 10l5 5 5-5z"></path>
        </svg>
      </span>
    `;

    // Panel with table
    const panel = document.createElement("div");
    panel.className = "acc-panel";
    const inner = document.createElement("div");
    inner.className = "acc-panel-inner";

    // Build the table
    const table = document.createElement("table");
    table.className = "acc-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Item Name</th>
          <th>Item Set</th>
          <th>Icon</th>
          <th>Collected</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    groups[groupName].forEach(item => {
      const isChecked = userProgress[crate.id]?.items?.includes(item.id);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${item.item_name}</td>
        <td>${item.set_name || ""}</td>
        <td><img src="${item.icon_url}" alt="${item.item_name}"></td>
        <td><input type="checkbox"
                   data-crate-id="${crate.id}"
                   data-item-id="${item.id}"
                   ${isChecked ? "checked" : ""}></td>
      `;
      tbody.appendChild(tr);
    });

    inner.appendChild(table);
    panel.appendChild(inner);

    // Toggle logic
    btn.addEventListener("click", () => {
      const isOpen = panel.classList.contains("open");
      if (isOpen) {
        panel.classList.remove("open");
        panel.style.maxHeight = null;
        btn.classList.remove("active");
      } else {
        panel.classList.add("open");
        panel.style.maxHeight = panel.scrollHeight + "px";
        btn.classList.add("active");
      }
    });

    // Default: keep all collapsed (optional: open first one)
    // if (idx === 0) btn.click();

    accItem.appendChild(btn);
    accItem.appendChild(panel);
    accordionContainer.appendChild(accItem);
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
const selectAllBtn = document.getElementById("selectAllBtn");

selectAllBtn.addEventListener("click", () => {
  const checkboxes = modalContentEl.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach(cb => { cb.checked = true; });
});

saveButton.addEventListener("click", async () => {
  document.getElementById("modalSavingOverlay").style.display = "flex";

  const checkboxes = modalContentEl.querySelectorAll("input[type='checkbox']");
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

  // Refresh userProgress and crate data once
  await fetchUserProgress();
  const allCrates = await fetchCratesWithItems();

  // Update the specific crate card in real-time
  const crateId = checkboxes[0]?.dataset.crateId;
  if (crateId) {
    const crateData = allCrates.find(c => c.id == crateId);
    const crateCard = [...document.querySelectorAll(".crate-card")]
      .find(card => card.querySelector("h3").textContent === formatCrateName(crateData.name));

    if (crateCard) {
      const { percent, tagClass } = calculateProgress(crateId, crateData.items.length);

      // Update tag
      const tagEl = crateCard.querySelector(".card-tag");
      tagEl.className = `card-tag ${tagClass}`;
      tagEl.textContent =
        tagClass === "tag-complete" ? "Completed" :
        tagClass === "tag-incomplete" ? "Incomplete" : "Not Started";

      // Update progress bar
      const progressFill = crateCard.querySelector(".progress-bar-fill");
      progressFill.style.width = `${percent}%`;
      progressFill.textContent = `${percent}%`;

      // Update last saved date
      const dateEl = crateCard.querySelector(".crate-date");
      dateEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 5px;">
          <path d="M12 1a11 11 0 1 0 11 11A11.013 11.013 0 0 0 12 1Zm0 20a9 9 0 1 1 9-9a9.01 9.01 0 0 1-9 9Zm.5-9.793V7a1 1 0 0 0-2 0v5a1 1 0 0 0 .293.707l3.5 3.5a1 1 0 0 0 1.414-1.414Z"/>
        </svg>
        ${new Date(userProgress[crateId]?.updatedAt || Date.now()).toLocaleDateString()}
      `;

      // Update collected count
      const collectedCount = userProgress[crateId]?.items?.length || 0;
      crateCard.querySelector(".crate-count").textContent =
        `${collectedCount}/${crateData.items.length} items`;

      // Update border color
      let borderColor;
      if (tagClass === "tag-complete") borderColor = "rgb(66, 210, 157)";
      else if (tagClass === "tag-incomplete") borderColor = "#f7c800";
      else borderColor = "rgb(250, 90, 120)";
      crateCard.style.borderBottom = `3px solid ${borderColor}`;
    }
  }

  // Hide overlay & modal
  document.getElementById("modalSavingOverlay").style.display = "none";
  closeModal();
});

cancelButton.addEventListener("click", async () => {
  modal.classList.remove("show");
  await fetchUserProgress();
  const crates = await fetchCratesWithItems();
  collectionsContainer.innerHTML = "";
  renderCrates(crates);
});
