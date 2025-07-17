let currentPage = 1;
const logsPerPage = 10;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("https://simplesurvivalcollectibles.site/me", {
      credentials: "include",
    });

    if (res.status === 401) {
      // Try refreshing the token
      const refreshRes = await fetch("https://simplesurvivalcollectibles.site/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (refreshRes.ok) {
        // Retry /me after refresh
        const retry = await fetch("https://simplesurvivalcollectibles.site/me", {
          credentials: "include",
        });
        const retryData = await retry.json();

        if (retry.ok && retryData.role && (retryData.role === "Admin" || retryData.role === "SysAdmin")) {
          document.getElementById("adminContent").style.display = "block";
          initializeAdminPanel(retryData.role);
        } else {
          throw new Error("Retry failed or role invalid");
        }
      } else {
        throw new Error("Token refresh failed");
      }
    } else {
      const data = await res.json();
      if (!data.role || (data.role !== "Admin" && data.role !== "SysAdmin")) throw new Error("Unauthorized");

      document.getElementById("adminContent").style.display = "block";
      initializeAdminPanel(data.role);
    }
  } catch (err) {
    console.error("Auth check failed:", err);
    document.body.innerHTML = "";
    window.location.href = "404";
  }
});

function isLockedOut(user) {
  if (!user || user.failed_attempts === undefined || !user.last_failed_login) return false;

  const failedAttempts = parseInt(user.failed_attempts, 10);
  const lastFailed = new Date(user.last_failed_login);
  const now = new Date();
  const diff = now - lastFailed;

  return failedAttempts >= 3 && diff < 10 * 60 * 1000;
}

function lockoutRemaining(user) {
  if (!user.last_failed_login) return "00:00";

  const lastFailed = new Date(user.last_failed_login);
  if (isNaN(lastFailed.getTime())) return "00:00"; // invalid date

  const now = new Date();
  const elapsed = Math.floor((now - lastFailed) / 1000); // seconds
  const remaining = Math.max(0, 10 * 60 - elapsed); // 10 min lockout

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}



function initializeAdminPanel(role) {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabContents.forEach(tab => tab.style.display = "none");
      tabButtons.forEach(b => b.classList.remove("active"));
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.style.display = "block";
      btn.classList.add("active");
    });
  });

  tabContents.forEach(tab => tab.style.display = "none");
  tabButtons.forEach(b => b.classList.remove("active"));
  const activeUsersBtn = document.querySelector('[data-tab="usersTab"]');
  const activeUsersTab = document.getElementById("usersTab");
  if (activeUsersBtn && activeUsersTab) {
    activeUsersBtn.classList.add("active");
    activeUsersTab.style.display = "block";
  }

  if (role === "SysAdmin") {
    const sysadminTab = document.getElementById("sysadminTab");
    const rolesTabBtn = document.getElementById("rolesTabBtn");
    const auditTabBtn = document.getElementById("auditTabBtn");

    if (sysadminTab) sysadminTab.style.display = "inline-block";
    if (rolesTabBtn) rolesTabBtn.style.display = "inline-block";
    if (auditTabBtn) auditTabBtn.style.display = "inline-block";

    loadAuditLogs(currentPage);
  }

  // Load Active Users
  fetch("https://simplesurvivalcollectibles.site/admin/active-users", {
    credentials: "include"
  })
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById("activeUserList");
      list.innerHTML = "";
      data.forEach(user => {
        const li = document.createElement("li");
        li.innerHTML = role === "SysAdmin"
          ? `${user.username} (IP: ${user.last_ip}, Location: ${user.last_location}) <span class="role-tag ${user.role}">${user.role}</span>`
          : `${user.username} <span class="role-tag ${user.role}">${user.role}</span>`;
        list.appendChild(li);
      });
    });

  if (role === "SysAdmin") {
    fetch("https://simplesurvivalcollectibles.site/admin/all-users", {
      credentials: "include"
    })
      .then(res => res.json())
      .then(data => {
        const tableBody = document.getElementById("accountList");
        tableBody.innerHTML = data.map(user => {
          const locked = isLockedOut(user);
          const lastFailed = new Date(user.last_failed_login);
          const now = Date.now();
          const diffInSeconds = Math.floor((now - lastFailed) / 1000);
          const remainingTime = Math.max(0, 600 - diffInSeconds);

          return `
            <tr>
              <td>${user.id}</td>
              <td>${user.username}</td>
              <td>${user.email}</td>
              <td>${user.verified ? "Yes" : "No"}</td>
              <td>
                <button class="admin-action-btn verify" onclick="verifyUser(${user.id})">Verify</button>
                <button class="admin-action-btn delete" onclick="deleteUser(${user.id})">Delete</button>
              </td>
              <td>
                ${locked ? `<span class="lockout-timer" data-seconds="${remainingTime}">${remainingTime}</span>` : 'Not locked out'}
                ${locked && user.role !== 'SysAdmin' ? `<button class="unlock-btn" data-user-id="${user.id}">Unlock</button>` : ''}
              </td>
            </tr>
          `;
        }).join("");
        startLockoutTimers();
      });

    fetch("https://simplesurvivalcollectibles.site/admin/all-users", {
      credentials: "include"
    })
      .then(res => res.json())
      .then(data => {
        const roleList = document.getElementById("roleManagementList");
        roleList.innerHTML = data.map(user => `
          <tr>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>
              <select class="role-select" id="role-${user.id}">
                <option value="User" ${user.role === 'User' ? 'selected' : ''}>User</option>
                <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                <option value="SysAdmin" ${user.role === 'SysAdmin' ? 'selected' : ''}>SysAdmin</option>
              </select>
            </td>
            <td><button class="admin-action-btn verify" onclick="changeRole(${user.id})">Update</button></td>
          </tr>
        `).join("");
      });
  }
}

function loadCratesAndItems() {
  Promise.all([
    fetch("https://simplesurvivalcollectibles.site/admin/crates", {
      credentials: "include"
    }).then((res) => res.json()),
    fetch("https://simplesurvivalcollectibles.site/admin/items", {
      credentials: "include"
    }).then((res) => res.json()),
  ])
    .then(([crates, items]) => {
      const selector = document.getElementById("crate-selector");
      const form = document.getElementById("crate-edit-form");

      // Populate crate dropdown
      selector.innerHTML =
        "<option disabled selected>Select a crate to edit</option>";
      crates.forEach((crate) => {
        const option = document.createElement("option");
        option.value = crate.id;
        option.textContent = crate.crate_name;
        selector.appendChild(option);
      });

      // Attach event to update view based on selected crate
      selector.addEventListener("change", () => {
        const selectedCrateId = parseInt(selector.value);
        const selectedCrate = crates.find((c) => c.id === selectedCrateId);
        const relatedItems = items.filter(
          (i) => i.crate_id === selectedCrateId
        );

        const form = document.getElementById("crate-edit-form");
        form.innerHTML = `
          <button class="admin-action-btn add-item-btn" onclick="openAddItemModal(${
            selectedCrate.id
          })">Add New Item to Crate</button>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Crate Name</th>
                  <th>Crate Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${selectedCrate.id}</td>
                  <td>${selectedCrate.crate_name}</td>
                  <td>${
                    selectedCrate.is_cosmetic ? "Cosmetic" : "Non-Cosmetic"
                  }</td>
                  <td>
                    <button class="admin-action-btn" onclick="editCrate(${
                      selectedCrate.id
                    })">✏️</button>
                    ${
                      localStorage.getItem("role") === "SysAdmin"
                        ? `<button class="admin-action-btn delete" onclick="deleteCrate(${selectedCrate.id})">🗑️</button>`
                        : ""
                    }
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4>Items in Crate</h4>
          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Set</th>
                  <th>Icon</th>
                  <th>Tags</th>
                  <th>Tooltip</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${relatedItems
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.id}</td>
                    <td>${item.item_name}</td>
                    <td>${item.set_name}</td>
                    <td><img src="${
                      item.icon_url
                    }" alt="icon" class="item-icon" /></td>
                    <td>${(item.tags || [])
                      .map((t) => `<span class='tag'>${t}</span>`)
                      .join(" ")}</td>
                    <td>${item.tooltip || ""}</td>
                    <td>
                      <button class="admin-action-btn" onclick="editItem(${
                        item.id
                      })">✏️</button>
                      ${
                        localStorage.getItem("role") === "SysAdmin"
                          ? `<button class="admin-action-btn delete" onclick="deleteItem(${item.id})">🗑️</button>`
                          : ""
                      }
                    </td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      });
    })
    .catch((err) => {
      console.error("Failed to load crates or items:", err);
    });
}

function editCrate(crateId) {
  fetch("https://simplesurvivalcollectibles.site/admin/crates", {
    credentials: "include"
  })
    .then((res) => res.json())
    .then((crates) => {
      const crate = crates.find((c) => c.id === crateId);
      if (!crate) return showToast("Crate not found.");

      // Pre-fill modal inputs
      document.getElementById("edit-crate-id").value = crate.id;
      document.getElementById("edit-crate-name").value = crate.crate_name;
      document.getElementById("edit-crate-type").value = crate.is_cosmetic
        ? "1"
        : "0";

      // Show modal
      const modal = document.getElementById("editCrateModalAdmin");
      modal.classList.remove("hidden");
      modal.querySelector(".modal-content-admin").classList.remove("fadeOut");
      modal.querySelector(".modal-content-admin").classList.add("fadeIn");
    })
    .catch(() => showToast("Failed to load crate data."));
}

function closeEditCrateModal() {
  const modal = document.getElementById("editCrateModalAdmin");
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeIn");
  content.classList.add("fadeOut");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

function editItem(itemId) {
  fetch(`https://simplesurvivalcollectibles.site/admin/items`, {
    credentials: "include"
  })
    .then((res) => res.json())
    .then((items) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return showToast("Item not found.");

      document.getElementById("edit-item-id").value = item.id;
      document.getElementById("edit-item-name").value = item.item_name || "";
      document.getElementById("edit-set-name").value = item.set_name || "";
      document.getElementById("edit-icon-url").value = item.icon_url || "";
      document.getElementById("edit-tags").value = (item.tags || []).join(", ");
      document.getElementById("edit-tooltip").value = item.tooltip || "";

      const modal = document.getElementById("editItemModalAdmin");
      modal.classList.remove("hidden");
      modal.querySelector(".modal-content-admin").classList.remove("fadeOut");
      modal.querySelector(".modal-content-admin").classList.add("fadeIn");
    });
}

function closeEditModal() {
  const modal = document.getElementById("editItemModalAdmin");
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeIn");
  content.classList.add("fadeOut");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

document
  .getElementById("editCrateForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const id = document.getElementById("edit-crate-id").value;
    const updatedData = {
      crate_name: document.getElementById("edit-crate-name").value,
      is_cosmetic: parseInt(document.getElementById("edit-crate-type").value),
    };

    fetch(`https://simplesurvivalcollectibles.site/admin/crates/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedData),
    })
      .then((res) => res.json())
      .then(() => {
        showToast("Crate updated successfully");
        closeEditCrateModal();
        loadCratesAndItems();
      })
      .catch(() => showToast("Failed to update crate"));
  });

document
  .getElementById("editItemForm")
  .addEventListener("submit", function (e) {
    e.preventDefault();

    const id = document.getElementById("edit-item-id").value;
    const updatedData = {
      item_name: document.getElementById("edit-item-name").value,
      set_name: document.getElementById("edit-set-name").value,
      icon_url: document.getElementById("edit-icon-url").value,
      tags: document
        .getElementById("edit-tags")
        .value.split(",")
        .map((t) => t.trim()),
      tooltip: document.getElementById("edit-tooltip").value,
    };

    fetch(`https://simplesurvivalcollectibles.site/admin/items/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedData),
    })
      .then((res) => res.json())
      .then(() => {
        showToast("Item updated successfully");
        closeEditModal();
        loadCratesAndItems();
      })
      .catch(() => showToast("Failed to update item"));
  });

function openAddItemModal(crateId) {
  document.getElementById("add-crate-id").value = crateId;

  const selector = document.getElementById("crate-selector");
  const crateName = selector.options[selector.selectedIndex].text;
  document.getElementById(
    "add-item-crate-label"
  ).textContent = `Selected Crate: ${crateName}`;

  const modal = document.getElementById("addItemModalAdmin");
  modal.classList.remove("hidden");
  modal.querySelector(".modal-content-admin").classList.remove("fadeOut");
  modal.querySelector(".modal-content-admin").classList.add("fadeIn");
}

function closeAddItemModal() {
  const modal = document.getElementById("addItemModalAdmin");
  const content = modal.querySelector(".modal-content-admin");
  content.classList.remove("fadeIn");
  content.classList.add("fadeOut");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

document.getElementById("addItemForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const crate_id = document.getElementById("add-crate-id").value;
  const item_name = document.getElementById("add-item-name").value;
  const set_name = document.getElementById("add-set-name").value;
  const icon_url = document.getElementById("add-icon-url").value;
  const tags = document
    .getElementById("add-tags")
    .value.split(",")
    .map((t) => t.trim());
  const tooltip = document.getElementById("add-tooltip").value;

  fetch("https://simplesurvivalcollectibles.site/admin/items", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      crate_id,
      item_name,
      set_name,
      icon_url,
      tags,
      tooltip,
    }),
  })
    .then((res) => res.json())
    .then(() => {
      showToast("Item added successfully!");
      closeAddItemModal();
      loadCratesAndItems();
    })
    .catch(() => showToast("Failed to add item."));
});

function deleteCrate(crateId) {
  const modalId = `deleteCrateModal-${crateId}`;
  showGlobalModal({
    type: "warning",
    title: "Delete Crate",
    message: "Are you sure you want to permanently delete this crate?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Delete",
        onClick: `confirmDeleteCrate(${crateId}, '${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmDeleteCrate(crateId, modalId) {
  fetch(`https://simplesurvivalcollectibles.site/admin/crates/${crateId}`, {
    method: "DELETE",
    credentials: "include"
  }).then(() => {
    showToast("Crate deleted successfully.");
    loadCratesAndItems();
    fadeOutAndRemove(modalId);
  });
}

function deleteItem(itemId) {
  const modalId = `deleteItemModal-${itemId}`;
  showGlobalModal({
    type: "warning",
    title: "Delete Item",
    message: "Are you sure you want to permanently delete this item?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Delete",
        onClick: `confirmDeleteItem(${itemId}, '${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmDeleteItem(itemId, modalId) {
  fetch(`https://simplesurvivalcollectibles.site/admin/items/${itemId}`, {
    method: "DELETE",
    credentials: "include"
  }).then(() => {
    showToast("Item deleted successfully.");
    loadCratesAndItems();
    fadeOutAndRemove(modalId);
  });
}

let items = [];

function nextStep(step) {
  // Step 1: Validate crate name
  if (step === 2) {
    const crateName = document.getElementById("crate-name").value.trim();
    if (!crateName) {
      showGlobalModal({
        type: "error",
        title: "Incomplete Item",
        message: "Please insert a crate name before proceeding.",
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-badItem')" }],
        id: "modal-badItem"
      });
      return;
    }
  }

  // Step 2 → Step 3: Validate item entries before showing summary
if (step === 3) {
  if (!validateItems()) return;

  const crateName = document.getElementById("crate-name").value.trim();
  document.getElementById("crate-dropdown-title").textContent = crateName;

  const dropdownContent = document.getElementById("crate-dropdown-content");
  dropdownContent.classList.remove("hidden");
  dropdownContent.style.maxHeight = dropdownContent.scrollHeight + "px";

  const tableBody = document.getElementById("crate-items-table-body");
  tableBody.innerHTML = "";

  items.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${item.set}</td>
      <td><img src="${item.icon}" alt="icon" style="width: 20px; height: 20px;" /></td>
      <td>${item.tags}</td>
      <td>${item.tooltip || ""}</td>
    `;
    tableBody.appendChild(row);
  });
}

  // Show target step
  document.querySelectorAll(".wizard-step").forEach(el => el.classList.add("hidden"));
  const target = document.getElementById(`step-${step}`);
  if (target) target.classList.remove("hidden");
}

function prevStep(step) {
  document.querySelectorAll('.wizard-step').forEach(el => el.classList.add('hidden'));
  const prev = document.getElementById(`step-${step}`);
  if (prev) prev.classList.remove('hidden');
}

function addItem() {
  const itemsContainer = document.getElementById("items-container");
  const id = Date.now();

  const itemHTML = `
    <div class="item-dropdown">
      <button class="crate-dropdown-btn" onclick="toggleItemDropdown(${id})">
        <span id="item-button-text-${id}">New Item</span>
        <span class="arrow">▼</span>
      </button>
      <div class="crate-dropdown-content hidden" id="item-content-${id}">
        <div class="nice-form-group">
          <label>Item Name:</label>
          <input type="text" name="itemName" placeholder="Enter item name"oninput="updateItemButtonText(${id}, this.value)" />
        </div>
        <div class="nice-form-group">
          <label>Set Name:</label>
          <input type="text" name="setName" placeholder="Enter set name"/>
        </div>
        <div class="nice-form-group">
          <label>Icon:</label>
          <input type="text" name="icon" placeholder="Enter icon URL"/>
          <small class="hint-text icons-url" onclick="window.open('https://mc.nerothe.com/')">To view usable item icons, click here</small>
        </div>
        <div class="nice-form-group">
          <label>Tags (comma-separated):</label>
          <input type="text" name="tags" placeholder="Example: Cosmetic, Wings"/>
        </div>
        <div class="nice-form-group">
          <label>Tooltip:</label>
          <textarea name="tooltip" placeholder="Optional tooltip"></textarea>
        </div>
        <button class="modal-btn" onclick="this.closest('.item-dropdown').remove()">Remove Item</button>
      </div>
    </div>
  `;

  itemsContainer.insertAdjacentHTML("beforeend", itemHTML);

    items.push({
    id,
    name: "",
    set: "",
    icon: "",
    tags: "",
    tooltip: ""
  });
}

function toggleItemDropdown(id) {
  const content = document.getElementById(`item-content-${id}`);
  const arrow = document.querySelector(`#item-button-text-${id}`).nextElementSibling;

  if (content.classList.contains("hidden")) {
    content.classList.remove("hidden");
    content.style.maxHeight = content.scrollHeight + "px";
    arrow.style.transform = "rotate(180deg)";
  } else {
    content.style.maxHeight = "0";
    arrow.style.transform = "rotate(0deg)";
    setTimeout(() => content.classList.add("hidden"), 300);
  }
}

function updateItemButtonText(id, value) {
  document.getElementById(`item-button-text-${id}`).innerText = value || "New Item";
}

function removeItem(id) {
  document.querySelector(`.item-form[data-id="${id}"]`)?.remove();
}

function toggleDropdown(button) {
  const dropdown = button.nextElementSibling;
  const arrow = button.querySelector(".arrow");

  if (dropdown.classList.contains("hidden")) {
    dropdown.classList.remove("hidden");
    dropdown.style.maxHeight = dropdown.scrollHeight + "px";
    arrow.style.transform = "rotate(180deg)";
  } else {
    dropdown.style.maxHeight = "0";
    arrow.style.transform = "rotate(0deg)";
    setTimeout(() => dropdown.classList.add("hidden"), 500);
  }
}

function validateItems() {
  const itemElements = document.querySelectorAll(".item-dropdown");
  items = [];

  for (const el of itemElements) {
    const get = name => el.querySelector(`[name="${name}"]`)?.value.trim() || "";
    const item = {
      name: get("itemName"),
      set: get("setName"),
      icon: get("icon"),
      tags: get("tags"),
      tooltip: get("tooltip")
    };

    if (!item.name || !item.set || !item.icon || !item.tags) {
      showGlobalModal({
        type: "error",
        title: "Incomplete Item",
        message: "Each item must have a name, set, icon, and tags. Tooltip is optional.",
        buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-badItem')" }],
        id: "modal-badItem"
      });
      return false;
    }

    items.push(item);
  }

  return true;
}

function submitCrate() {
  const crateName = document.getElementById("crate-name").value.trim();
  const crateType = document.querySelector('input[name="crate-type"]:checked')?.value;

  // Validate crate name
  if (!crateName) {
    showGlobalModal({
      type: "error",
      title: "Missing Crate Name",
      message: "Please enter a crate name before submitting.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-crateName')" }],
      id: "modal-crateName"
    });
    return;
  }

  // Validate crate type
  if (!crateType) {
    showGlobalModal({
      type: "error",
      title: "Missing Crate Type",
      message: "Please select a crate type.",
      buttons: [{ label: "OK", onClick: "fadeOutAndRemove('modal-crateType')" }],
      id: "modal-crateType"
    });
    return;
  }

  // Validate items
  if (!validateItems()) return;

  // Submit crate
  fetch("https://simplesurvivalcollectibles.site/admin/crates", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      crate_name: crateName,
      is_cosmetic: parseInt(crateType)
    })
  })
    .then(res => res.json())
    .then(crate => {
      // Submit all items with the returned crate ID
      const promises = items.map(item =>
        fetch("https://simplesurvivalcollectibles.site/admin/items", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            crate_id: crate.id,
            item_name: item.name,
            set_name: item.set,
            icon_url: item.icon,
            tags: item.tags.split(",").map(t => t.trim()),
            tooltip: item.tooltip
          })
        })
      );

      return Promise.all(promises);
    })
    .then(() => {
      showGlobalModal({
        type: "success",
        title: "Crate Created",
        message: "Your crate and items were successfully saved!",
        buttons: [{
          label: "Awesome!",
          onClick: "fadeOutAndRemove('modal-crateSuccess')"
        }],
        id: "modal-crateSuccess"
      });

      // Reset wizard and clear data
      document.getElementById("crate-name").value = "";
      document.querySelector('input[name="crate-type"][value="1"]').checked = true;
      document.getElementById("items-container").innerHTML = "";
      items = [];

      // Go back to step 1
      document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
      document.getElementById("step-1").classList.remove("hidden");

      // Optional: reload UI
      loadCratesAndItems();
    })
    .catch(err => {
      console.error("Crate creation failed:", err);
      showGlobalModal({
        type: "error",
        title: "Submission Failed",
        message: "There was an error creating the crate. Please try again.",
        buttons: [{ label: "Close", onClick: "fadeOutAndRemove('modal-submitError')" }],
        id: "modal-submitError"
      });
    });
}

// Call loader when switching to DB tab
const dbTabBtn = document.querySelector('[data-tab="dbTab"]');
if (dbTabBtn) {
  dbTabBtn.addEventListener("click", () => {
    loadCratesAndItems();
  });
}

function loadAuditLogs(page = 1) {
  fetch(
    `https://simplesurvivalcollectibles.site/admin/audit-logs?page=${page}&limit=10`,
    {
      credentials: "include",
    }
  )
    .then((res) => res.json())
    .then(({ logs, total }) => {
      const tbody = document.getElementById("auditLogTable");
      const pagination = document.getElementById("auditPagination");
      tbody.innerHTML = "";

      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No audit logs found.</td></tr>';
        pagination.innerHTML = "";
        return;
      }

      logs.forEach((log) => {
        const tr = document.createElement("tr");
        const formattedDate = new Date(log.timestamp).toLocaleString();
        tr.innerHTML = `
          <td>${log.user_id}</td>
          <td>${log.action}</td>
          <td>${formattedDate}</td>
          <td><button class="delete-log-btn" onclick="deleteLog(${log.id})">🗑</button></td>
        `;
        tbody.appendChild(tr);
      });

      const totalPages = Math.ceil(total / logsPerPage);
      pagination.innerHTML = "";

      if (totalPages > 1) {
        for (let i = 1; i <= totalPages; i++) {
          const btn = document.createElement("button");
          btn.textContent = i;
          btn.className = "page-btn";
          btn.disabled = i === page;
          btn.onclick = () => {
            currentPage = i;
            loadAuditLogs(currentPage);
          };
          pagination.appendChild(btn);
        }
      }
    })
    .catch((err) => {
      console.error("Failed to load audit logs:", err);
      document.getElementById("auditLogTable").innerHTML =
        '<tr><td colspan="4">Failed to load logs.</td></tr>';
    });
}

function deleteLog(logId) {
  const modalId = `deleteLogModal-${logId}`;
  showGlobalModal({
    type: "warning",
    title: "Delete Log Entry",
    message: "Are you sure you want to delete this audit log entry?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Delete",
        onClick: `confirmDeleteLog(${logId}, '${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmDeleteLog(logId, modalId) {
  fetch(`https://simplesurvivalcollectibles.site/admin/audit-logs/${logId}`, {
    method: "DELETE",
    credentials: "include"
  }).then(() => {
    showToast("Log entry deleted.");
    loadAuditLogs(currentPage);
    fadeOutAndRemove(modalId);
  });
}

function clearAuditLogs() {
  const modalId = `clearAuditModal`;
  showGlobalModal({
    type: "warning",
    title: "Clear Audit Logs",
    message: "This action cannot be undone. Clear the entire audit log?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Confirm",
        onClick: `confirmClearAuditLogs('${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmClearAuditLogs(modalId) {
  fetch("https://simplesurvivalcollectibles.site/admin/audit-logs", {
    method: "DELETE",
    credentials: "include"
  }).then(() => {
    showToast("Audit log successfully cleared.");
    loadAuditLogs(1);
    fadeOutAndRemove(modalId);
  });
}


function verifyUser(userId) {
  fetch("https://simplesurvivalcollectibles.site/admin/verify-user", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId }),
  }).then(() => {
    showToast("User verified successfully");
    setTimeout(() => location.reload(), 1000);
  });
}

function deleteUser(userId) {
  const modalId = `deleteUserModal-${userId}`;
  showGlobalModal({
    type: "warning",
    title: "Delete User",
    message: "Are you sure you want to permanently delete this user?",
    buttons: [
      {
        label: "Cancel",
        onClick: `fadeOutAndRemove('${modalId}')`
      },
      {
        label: "Delete",
        onClick: `confirmDeleteUser(${userId}, '${modalId}')`
      }
    ],
    id: modalId
  });
}

function confirmDeleteUser(userId, modalId) {
  fetch("https://simplesurvivalcollectibles.site/admin/delete-user", {
    method: "DELETE",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ userId })
  }).then(() => {
    showToast("User deleted successfully.");
    setTimeout(() => location.reload(), 1000);
    fadeOutAndRemove(modalId);
  });
}

function changeRole(userId) {
  const newRole = document.getElementById(`role-${userId}`).value;
  fetch("https://simplesurvivalcollectibles.site/admin/change-role", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, newRole }),
  })
    .then((res) => res.json())
    .then(() => {
      showToast("User role updated successfully!");
      const row = document.getElementById(`role-${userId}`).closest("tr");
      row.style.backgroundColor = "#2a2a2a";
      setTimeout(() => (row.style.backgroundColor = ""), 1000);
    })
    .catch(() => showToast("Failed to update user role"));
}

// Horizontal subtab behavior inside Database Config tab
document.querySelectorAll(".db-subtab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".db-subtab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const tabId = btn.dataset.tab;
    document.querySelectorAll(".db-subtab-content").forEach((tab) => {
      tab.style.display = tab.id === `db-tab-${tabId}` ? "block" : "none";
    });
  });
});

function startLockoutTimers() {
  const timers = document.querySelectorAll('.lockout-timer');

  timers.forEach(timer => {
    let remaining = parseInt(timer.getAttribute('data-seconds'));

    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        timer.textContent = "Unlocked";
        clearInterval(interval);
        timer.parentElement.querySelector('button')?.remove();
        return;
      }
      timer.textContent = formatCountdown(remaining);
    }, 1000);
  });
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function exportAuditLogsAsCSV() {
  fetch("https://simplesurvivalcollectibles.site/admin/audit-logs?page=1&limit=10000", {
    credentials: "include"
  })
    .then((res) => res.json())
    .then(({ logs }) => {
      if (!logs || logs.length === 0) {
        const modalId = "csvExportNoneModal";
        showGlobalModal({
          type: "error",
          title: "No Logs to Export",
          message: "There are currently no audit logs available for export.",
          buttons: [
            {
              label: "Close",
              onClick: `fadeOutAndRemove('${modalId}')`
            }
          ],
          id: modalId
        });
        return;
      }

      const csvRows = [["User ID", "Action", "Timestamp"]];
      logs.forEach((log) => {
        csvRows.push([
          `"${log.user_id}"`,
          `"${log.action}"`,
          `"${new Date(log.timestamp).toLocaleString()}"`
        ]);
      });

      const csvContent = csvRows.map((row) => row.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const modalId = "csvExportSuccessModal";
      showGlobalModal({
        type: "success",
        title: "Audit Log Exported",
        message: "Audit logs were exported successfully as a CSV file.",
        buttons: [
          {
            label: "Close",
            onClick: `fadeOutAndRemove('${modalId}')`
          }
        ],
        id: modalId
      });
    })
    .catch(() => {
      const modalId = "csvExportErrorModal";
      showGlobalModal({
        type: "error",
        title: "Export Failed",
        message: "An error occurred while exporting audit logs. Please try again later.",
        buttons: [
          {
            label: "Close",
            onClick: `fadeOutAndRemove('${modalId}')`
          }
        ],
        id: modalId
      });
    });
}

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

document.addEventListener("click", function (e) {
  if (e.target.classList.contains("unlock-btn")) {
    const userId = e.target.getAttribute("data-user-id");
    fetch(`https://simplesurvivalcollectibles.site/admin/unlock-user/${userId}`, {
      method: "POST",
      credentials: "include"
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        showToast("User unlocked successfully.");
        e.target.parentElement.querySelector('.lockout-timer').textContent = '';
        e.target.remove();
      } else {
        showToast(data.error || "Failed to unlock user.", "error");
      }
    })
    .catch(err => {
      showToast("Request failed.", "error");
      console.error(err);
    });
  }
});
