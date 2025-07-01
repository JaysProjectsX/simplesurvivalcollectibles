const backendUrl1 = "https://simplesurvivalcollectibles.site";
let globalItems = [];

if (document.getElementById("particles-js")) {
  particlesJS("particles-js", {
    particles: {
      number: { value: 80, density: { enable: true, value_area: 800 } },
      color: { value: ["#ff0080", "#ff8c00", "#ffffff"] },
      shape: { type: "circle" },
      opacity: { value: 0.8, random: true },
      size: { value: 3, random: true },
      move: {
        enable: true,
        speed: 1,
        direction: "none",
        out_mode: "out",
        straight: false,
      },
      line_linked: { enable: false },
    }
  });
}

document.addEventListener("mousemove", (event) => {
  const hero = document.querySelector(".hero");
  if (!hero) return;
  let x = (window.innerWidth / 2 - event.pageX) / 150;
  let y = (window.innerHeight / 2 - event.pageY) / 150;
  hero.style.transform = `translate(${x}px, ${y}px)`;
});

const cards = document.querySelectorAll('.knowledge-card');
window.addEventListener('scroll', () => {
  cards.forEach(card => {
    const cardTop = card.getBoundingClientRect().top;
    if (cardTop < window.innerHeight - 100) {
      card.classList.add('reveal');
    }
  });
});

const crateTableContainer = document.getElementById("crate-table-container");
const dropdownContainer = document.getElementById("crate-dropdown-container");

let crateList = [];
let currentItems = [];

if (dropdownContainer && crateTableContainer) {
  fetch(`${backendUrl1}/api/crates`)
    .then(res => res.json())
    .then(crates => {
      crateList = crates;
      populateCrateDropdown(crateList);
    });

  fetch(`${backendUrl1}/api/tags`)
    .then(res => res.json())
    .then(tags => {
      populateTagDropdown(tags);
    });

  fetch(`${backendUrl1}/api/items`)
    .then(res => res.json())
    .then(items => {
      globalItems = items;
      renderGroupedTables(globalItems, 1, 3);
    });

    selected.querySelector("span").textContent = "All Crates";
    renderGroupedTables(globalItems, 1, 3);

  function populateCrateDropdown(crateList) {
    const selected = dropdownContainer.querySelector(".selected-option");
    const optionsList = dropdownContainer.querySelector(".dropdown-options");

    optionsList.innerHTML = "";

    const allCratesOption = document.createElement("li");
    allCratesOption.textContent = "All Crates";
    allCratesOption.dataset.id = "all";
    allCratesOption.classList.add("active");
    optionsList.appendChild(allCratesOption);

    allCratesOption.addEventListener("click", () => {
      selected.querySelector("span").textContent = "All Crates";
      optionsList.querySelectorAll("li").forEach(opt => opt.classList.remove("active"));
      allCratesOption.classList.add("active");
      dropdownContainer.classList.remove("open");

      currentItems = [];
      const activeTag = document.querySelector("#tag-dropdown-container li.active")?.dataset.value || "";
      const query = document.getElementById("item-search").value.trim();
      const results = filterItems(globalItems, query, activeTag);
      renderGroupedTables(results, 1, 3);
    });

    crateList.forEach(crate => {
      const li = document.createElement("li");
      li.textContent = formatCrateName(crate.crate_name);
      li.dataset.id = crate.id;

      li.addEventListener("click", () => {
        selected.querySelector("span").previousSibling.textContent = formatCrateName(crate.crate_name) + " ";
        optionsList.querySelectorAll("li").forEach(opt => opt.classList.remove("active"));
        li.classList.add("active");
        dropdownContainer.classList.remove("open");

        fetch(`${backendUrl1}/api/crates/${crate.id}/items`)
          .then(res => res.json())
          .then(items => {
            currentItems = items;
            const activeTag = document.querySelector("#tag-dropdown-container li.active")?.dataset.value || "";
            const query = document.getElementById("item-search").value.trim();
            const results = filterItems(currentItems, query, activeTag);
            renderGroupedTables(results, 1, 3);
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

    tags.forEach(tag => {
      const li = document.createElement("li");
      li.textContent = tag;
      li.dataset.value = tag;
      optionsList.appendChild(li);
    });

    optionsList.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => {
        selected.querySelector("span").previousSibling.textContent = li.textContent + " ";
        optionsList.querySelectorAll("li").forEach(opt => opt.classList.remove("active"));
        li.classList.add("active");
        tagContainer.classList.remove("open");

        const tag = li.dataset.value;
        const query = document.getElementById("item-search").value.trim();
        const baseItems = currentItems.length > 0 ? currentItems : globalItems;
        const results = filterItems(baseItems, query, tag);
        renderGroupedTables(results, 1, 3);
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
    return raw
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  function filterItems(items, query, selectedTag) {
    return items.filter(item => {
      const matchesTag = !selectedTag || item.tags?.includes(selectedTag);
      const matchesSearch = !query || item.item_name.toLowerCase().includes(query.toLowerCase());
      return matchesTag && matchesSearch;
    });
  }

  function renderGroupedTables(items, page = 1, itemsPerPage = 3) {
    const crateTableWrapper = document.getElementById("crate-table-container");
    if (!items.length) {
      crateTableWrapper.innerHTML = `<p class="no-results">No items found.</p>`;
      return;
    }

    const grouped = {};
    items.forEach(item => {
      if (!grouped[item.set_name]) grouped[item.set_name] = [];
      grouped[item.set_name].push(item);
    });

    const sets = Object.keys(grouped);
    const totalPages = Math.ceil(sets.length / itemsPerPage);
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedSets = sets.slice(start, end);

    let html = `<div class="crate-tables-grid">`;
    for (const set of paginatedSets) {
      html += generateTable(set, grouped[set]);
    }
    html += `</div>`;

    html += generatePaginationControls(page, totalPages);
    crateTableWrapper.innerHTML = html;

    document.querySelectorAll(".pagination-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const newPage = parseInt(btn.dataset.page, 10);
        renderGroupedTables(items, newPage, itemsPerPage);
      });
    });
  }

  function generatePaginationControls(currentPage, totalPages) {
    if (totalPages <= 1) return "";

    let buttons = "";
    for (let i = 1; i <= totalPages; i++) {
      buttons += `<button class="pagination-btn${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
    }

    return `<div class="pagination-controls">${buttons}</div>`;
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

    crateItems.forEach(item => {
      const tagHTML = item.tags?.length
        ? item.tags.map(tag => `<span class="tag">${tag}</span>`).join(" ")
        : "";
      const tooltipAttr = item.tooltip ? `data-tooltip="${item.tooltip.replace(/^"+|"+$/g, '')}"` : "";

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
      const baseItems = currentItems.length > 0 ? currentItems : globalItems;
      const results = filterItems(baseItems, query, activeTag);
      renderGroupedTables(results, 1, 3);
    });
  }
}

fetch(`${backendUrl1}/api/changelog`)
  .then(res => res.json())
  .then(entries => {
    const changelogContainer = document.getElementById("changelog");
    const overlay = document.getElementById("changelog-modal-overlay");
    const fullContainer = document.getElementById("full-changelog");

    if (!changelogContainer || !overlay || !fullContainer) return;

    const limited = entries.slice(0, 3);
    const remainder = entries.slice(3);

    changelogContainer.innerHTML = limited.map(entry => `
      <div class="changelog-entry">
        <p><strong>${entry.username || "Admin"}</strong> 
          <span class="role-tag ${entry.role}">${entry.role}</span> – 
          ${new Date(entry.timestamp).toLocaleString()}</p>
        <p>${entry.message || entry.action}</p>
      </div>
    `).join("");

    if (remainder.length > 0) {
      changelogContainer.insertAdjacentHTML("beforeend", `<button id="view-all-changelog" class="view-all-btn">View All</button>`);

      const viewAllBtn = document.getElementById("view-all-changelog");
      const closeBtn = document.getElementById("close-changelog");

      function closeModalWithFade() {
        overlay.classList.add("fade-out");
        setTimeout(() => overlay.classList.remove("active", "fade-out"), 300);
      }

      viewAllBtn.addEventListener("click", () => {
        fullContainer.innerHTML = remainder.map(entry => `
          <div class="changelog-entry">
            <p><strong>${entry.username || "Admin"}</strong> – ${new Date(entry.timestamp).toLocaleString()}</p>
            <p>${entry.message || entry.action}</p>
          </div>
        `).join("");
        overlay.classList.add("active");
      });

      closeBtn.addEventListener("click", closeModalWithFade);
      overlay.addEventListener("click", e => {
        if (e.target === overlay) closeModalWithFade();
      });
    }
  })
  .catch(err => {
    console.error("Failed to load changelog:", err);
  });

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
  const tooltipHeight = globalTooltip.offsetHeight || 40;
  let top = rect.top + scrollTop - tooltipHeight - 10;
  if (top < scrollTop) top = rect.bottom + scrollTop + 10;

  globalTooltip.style.top = `${top}px`;
  globalTooltip.style.left = `${rect.left + rect.width / 2}px`;
  globalTooltip.style.transform = "translateX(-50%)";
});

document.addEventListener("mouseout", (e) => {
  if (e.target.closest("td[data-tooltip]")) {
    globalTooltip.style.display = "none";
  }
});
