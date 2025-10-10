const backendUrl1 = "/api";
let globalItems = [];
let currentItems = [];

if (document.getElementById("particles-js")) {
  particlesJS("particles-js", {
    particles: {
      number: { value: 80, density: { enable: true, value_area: 800 } },
      color: { value: ["#ff0080", "#ff8c00", "#ffffff"] },
      shape: { type: "circle" },
      opacity: { value: 0.8, random: true },
      size: { value: 3, random: true },
      move: { enable: true, speed: 1, direction: "none", out_mode: "out", straight: false },
      line_linked: { enable: false },
    },
  });
}

document.addEventListener("mousemove", (event) => {
  const hero = document.querySelector(".hero");
  if (!hero) return;
  let x = (window.innerWidth / 2 - event.pageX) / 150;
  let y = (window.innerHeight / 2 - event.pageY) / 150;
  hero.style.transform = `translate(${x}px, ${y}px)`;
});

const cards = document.querySelectorAll(".knowledge-card");
window.addEventListener("scroll", () => {
  cards.forEach((card) => {
    const cardTop = card.getBoundingClientRect().top;
    if (cardTop < window.innerHeight - 100) {
      card.classList.add("reveal");
    }
  });
});

const crateTableContainer = document.getElementById("crate-table-container");
const dropdownContainer = document.getElementById("crate-dropdown-container");

function showCrateDataError(customMessage = "Failed to load crate data") {
  const crateTableContainer = document.getElementById("crate-table-container");

  if (crateTableContainer) {
    crateTableContainer.innerHTML = `
      <div class="error-message" style="
        padding: 20px;
        background: rgba(255, 0, 0, 0.1);
        border: 1px solid rgba(255, 0, 0, 0.3);
        border-radius: 10px;
        color: #ff5c5c;
        font-weight: bold;
        margin-top: 1rem;
      ">
        ⚠️ Error: ${customMessage}. Please contact the developer.<br>
        <small>Diagnostic Code: <code>LOAD_FAIL_${Date.now()}</code></small>
      </div>
    `;
  }
}

if (dropdownContainer && crateTableContainer) {
  fetch(`${backendUrl1}/crates/cosmetic`)
    .then((res) => res.json())
    .then((crates) => {
      populateCrateDropdown(crates);
    })
    .catch((error) => {
      console.error("Failed to load crates:", error);
      showCrateDataError("Failed to load crate list");
    });

  fetch(`${backendUrl1}/tags?type=cosmetic`)
    .then((res) => res.json())
    .then((tags) => {
      populateTagDropdown(tags);
    })
    .catch((error) => {
      console.error("Failed to load tags:", error);
      showCrateDataError("Failed to load tag list");
    });

  fetch(`${backendUrl1}/items`)
    .then((res) => res.json())
    .then((items) => {
      globalItems = items;
      currentItems = items;

      const activeTag = document.querySelector("#tag-dropdown-container li.active")?.dataset.value || "";
      const query = document.getElementById("item-search").value.trim();
      const filtered = filterItems(currentItems, query, activeTag);
      renderGroupedTables(filtered);
    })
    .catch((error) => {
      console.error("Failed to load items:", error);
      showCrateDataError("Failed to load crate items");
    });


    function filterAndSearchItems(data, searchTerm, selectedTag) {
      const results = [];

      data.forEach((item) => {
        const matchesTag = !selectedTag || (item.tags || []).includes(selectedTag);
        const matchesSearch = !searchTerm || item.item_name.toLowerCase().includes(searchTerm.toLowerCase());

        if (matchesTag && matchesSearch) {
          results.push(item);
        }
      });

      return results;
    }


  function populateCrateDropdown(crateList) {
    const selected = dropdownContainer.querySelector(".selected-option");
    const optionsList = dropdownContainer.querySelector(".dropdown-options");

    optionsList.innerHTML = "";

    crateList.forEach((crate) => {
      const li = document.createElement("li");
      li.textContent = formatCrateName(crate.crate_name);
      li.dataset.id = crate.id;

      li.addEventListener("click", () => {
        selected.querySelector("span").previousSibling.textContent = li.textContent + " ";
        optionsList.querySelectorAll("li").forEach((opt) => opt.classList.remove("active"));
        li.classList.add("active");
        dropdownContainer.classList.remove("open");

        fetch(`${backendUrl1}/crates/${crate.id}/items`)
          .then((res) => res.json())
          .then((items) => {
            currentItems = items; // Store crate-specific items
            const activeTag = document.querySelector("#tag-dropdown-container li.active")?.dataset.value || "";
            const query = document.getElementById("item-search").value.trim();
            const filtered = filterItems(currentItems, query, activeTag);
            renderGroupedTables(filtered);
          });
      });

      optionsList.appendChild(li);
    });

    selected.addEventListener("click", () => {
      dropdownContainer.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (!dropdownContainer.contains(e.target)) {
        dropdownContainer.classList.remove("open");
      }
    });
  }

  function populateTagDropdown(tags) {
    const tagContainer = document.getElementById("tag-dropdown-container");
    const selected = tagContainer.querySelector(".selected-option");
    const optionsList = tagContainer.querySelector(".dropdown-options");

    optionsList.innerHTML = "";

    const defaultOpt = document.createElement("li");
    defaultOpt.textContent = "All Tags";
    defaultOpt.dataset.value = "";
    defaultOpt.classList.add("active");
    optionsList.appendChild(defaultOpt);

    tags.forEach((tag) => {
      const li = document.createElement("li");
      li.textContent = tag;
      li.dataset.value = tag;
      optionsList.appendChild(li);
    });

    optionsList.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        selected.querySelector("span").previousSibling.textContent = li.textContent + " ";
        optionsList.querySelectorAll("li").forEach((opt) => opt.classList.remove("active"));
        li.classList.add("active");
        tagContainer.classList.remove("open");

        const tag = li.dataset.value;
        const query = document.getElementById("item-search").value.trim();
        const results = filterItems(currentItems, query, tag);
        renderGroupedTables(results);
      });
    });

    selected.addEventListener("click", () => {
      tagContainer.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (!tagContainer.contains(e.target)) {
        tagContainer.classList.remove("open");
      }
    });
  }

  function formatCrateName(raw) {
    return raw.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase()).trim();
  }

  function filterItems(items, query, selectedTag) {
    return items.filter((item) => {
      const matchesTag = !selectedTag || item.tags?.includes(selectedTag);
      const matchesSearch = !query || item.item_name.toLowerCase().includes(query.toLowerCase());
      return matchesTag && matchesSearch;
    });
  }

  function renderGroupedTables(items) {
    const crateTableWrapper = document.getElementById("crate-table-container");
    if (!items.length) {
      crateTableWrapper.innerHTML = `<p class="no-results">No items found.</p>`;
      return;
    }

    const grouped = {};
    items.forEach((item) => {
      if (!grouped[item.set_name]) grouped[item.set_name] = [];
      grouped[item.set_name].push(item);
    });

    let html = `<div class="crate-tables-grid">`;
    for (const set in grouped) {
      html += generateTable(set, grouped[set]);
    }
    html += `</div>`;

    crateTableWrapper.innerHTML = html;
  }

  function generateTable(label, crateItems) {
    if (!crateItems || crateItems.length === 0) return "";

    let tableHTML = `
      <div class="crate-table-wrapper">
        <h3 class="table-label">${label}</h3>
        <table class="crate-table">
          <thead>
            <tr>
              <th>Item Type</th>
              <th>Item Name</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
    `;

    crateItems.forEach((item) => {
      const tagHTML = item.tags?.length ? item.tags.map((tag) => `<span class="tag">${tag}</span>`).join(" ") : "";
      const tooltipAttr = item.tooltip ? `data-tooltip="${item.tooltip.replace(/^"+|"+$/g, "")}"` : "";

      tableHTML += `
        <tr>
          <td><img src="${item.icon_url}" alt="${item.item_name}" /></td>
          <td ${tooltipAttr}>${item.item_name}</td>
          <td>${tagHTML}</td>
        </tr>
      `;
    });

    tableHTML += `
          </tbody>
        </table>
      </div>
    `;

    return tableHTML;
  }

  const searchInput = document.getElementById("item-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const tagContainer = document.getElementById("tag-dropdown-container");
        const activeTag = tagContainer.querySelector("li.active")?.dataset.value || "";
        const query = searchInput.value.trim();
        const results = filterItems(currentItems, query, activeTag);
        renderGroupedTables(results);
      });
    }

      function closeModalWithFade() {
        overlay.classList.add("fade-out");
        setTimeout(() => overlay.classList.remove("active", "fade-out"), 300);
      }

  // Floating tooltip logic (for long tooltips outside the table)
    const globalTooltip = document.getElementById("global-tooltip");

    document.addEventListener("mouseover", (e) => {
      const td = e.target.closest("td[data-tooltip]");
      if (!td) return;

      const tooltipText = td.getAttribute("data-tooltip");
      if (!tooltipText) return;

      globalTooltip.textContent = tooltipText;
      globalTooltip.style.display = "block";

      const rect = td.getBoundingClientRect();
      const scrollTop = window.scrollY || document.documentElement.scrollTop;

      // Position tooltip above or below depending on space
      const tooltipHeight = globalTooltip.offsetHeight || 40;
      let top = rect.top + scrollTop - tooltipHeight - 10;
      if (top < scrollTop) {
        top = rect.bottom + scrollTop + 10;
      }

      globalTooltip.style.top = `${top}px`;
      globalTooltip.style.left = `${rect.left + rect.width / 2}px`;
      globalTooltip.style.transform = "translateX(-50%)";
    });

    document.addEventListener("mouseout", (e) => {
      const td = e.target.closest("td[data-tooltip]");
      if (td) {
        globalTooltip.style.display = "none";
      }
    });

}

  /* Changelog modal logic */
  function openChangelogModal() {
    const modal = document.getElementById("changelogModal");
    const card = modal.querySelector(".changelog-modal-card");

    modal.classList.remove("hidden");
    card.classList.remove("fade-out");
    card.classList.add("fade-in");

    loadChangelog("cosmetic");
  }

  function closeChangelogModal() {
    const modal = document.getElementById("changelogModal");
    const card = modal.querySelector(".changelog-modal-card");

    card.classList.remove("fade-in");
    card.classList.add("fade-out");

    setTimeout(() => {
      modal.classList.add("hidden");
    }, 300); // Match animation duration
  }

  async function loadChangelog(page = "cosmetic", currentPage = 1, itemsPerPage = 4) {
    try {
      const res = await fetch(`${backendUrl1}/changelog?page=${page}`);
      const logs = await res.json();
      const modalBody = document.getElementById("changelogModalBody");
      const pagination = document.getElementById("changelogPagination");

      if (!modalBody || !pagination || !Array.isArray(logs)) return;

      // Pagination logic
      const totalPages = Math.ceil(logs.length / itemsPerPage);
      const startIndex = (currentPage - 1) * itemsPerPage;
      const visibleLogs = logs.slice(startIndex, startIndex + itemsPerPage);

      modalBody.innerHTML = visibleLogs.map(entry => `
        <li>
          <span class="line"></span>
          <i class="icon ${entry.role === 'SysAdmin' ? 'fas fa-shield-alt' : 'fas fa-user'}"></i>
          <div class="changelog-text-block">
            <div class="user-info">
              <span class="role-tag ${entry.role}">${entry.role}</span>
              <strong>${entry.username}</strong>
            </div>
            <div class="message">${entry.message}</div>
            <small class="timestamp">${new Date(entry.timestamp).toLocaleString()}</small>
          </div>
        </li>
      `).join("");

      // Pagination buttons
      pagination.innerHTML = '';
      if (totalPages > 1) {
        for (let i = 1; i <= totalPages; i++) {
          const btn = document.createElement("button");
          btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
          btn.textContent = i;
          btn.onclick = () => loadChangelog(page, i, itemsPerPage);
          pagination.appendChild(btn);
        }
      }

    } catch (err) {
      console.error("Failed to load changelog:", err);
    }
  }

