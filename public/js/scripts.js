const backendUrl1 = "https://simplesurvivalcollectibles.site";
let globalItems = [];
let currentItems = [];
let selectedCrateId = "all";

if (document.getElementById("particles-js")) {
  particlesJS("particles-js", {
    particles: {
      number: { value: 80, density: { enable: true, value_area: 800 } },
      color: { value: ["#ff0080", "#ff8c00", "#ffffff"] },
      shape: { type: "circle" },
      opacity: { value: 0.8, random: true },
      size: { value: 3, random: true },
      move: { enable: true, speed: 1, direction: "none", out_mode: "out" },
      line_linked: { enable: false }
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

const crateTableContainer = document.getElementById("crate-table-container");
const dropdownContainer = document.getElementById("crate-dropdown-container");
const tagContainer = document.getElementById("tag-dropdown-container");

if (dropdownContainer && crateTableContainer) {
  Promise.all([
    fetch(`${backendUrl1}/api/crates`).then(res => res.json()),
    fetch(`${backendUrl1}/api/tags`).then(res => res.json()),
    fetch(`${backendUrl1}/api/items`).then(res => res.json())
  ]).then(([crates, tags, items]) => {
    globalItems = items;
    currentItems = [];
    populateCrateDropdown(crates);
    populateTagDropdown(tags);
    updateAndRenderTables();
    dropdownContainer.querySelector(".selected-option span").textContent = "All Crates";
  });

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
      selectedCrateId = "all";
      currentItems = [];
      updateAndRenderTables();
    });

    crateList.forEach(crate => {
      const li = document.createElement("li");
      li.textContent = formatCrateName(crate.crate_name);
      li.dataset.id = crate.id;

      li.addEventListener("click", () => {
        selected.querySelector("span").textContent = li.textContent;
        optionsList.querySelectorAll("li").forEach(opt => opt.classList.remove("active"));
        li.classList.add("active");
        dropdownContainer.classList.remove("open");
        selectedCrateId = crate.id;

        fetch(`${backendUrl1}/api/crates/${crate.id}/items`)
          .then(res => res.json())
          .then(items => {
            currentItems = items;
            updateAndRenderTables();
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
        selected.querySelector("span").textContent = li.textContent;
        optionsList.querySelectorAll("li").forEach(opt => opt.classList.remove("active"));
        li.classList.add("active");
        tagContainer.classList.remove("open");
        updateAndRenderTables();
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
    return raw.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase()).trim();
  }

  function filterItems(items, query, tag) {
    return items.filter(item => {
      const matchesTag = !tag || item.tags?.includes(tag);
      const matchesSearch = !query || item.item_name.toLowerCase().includes(query.toLowerCase());
      return matchesTag && matchesSearch;
    });
  }

  function updateAndRenderTables(page = 1) {
    const tag = tagContainer.querySelector("li.active")?.dataset.value || "";
    const query = document.getElementById("item-search")?.value.trim() || "";
    const baseItems = selectedCrateId === "all" ? globalItems : currentItems;
    const filtered = filterItems(baseItems, query, tag);
    renderGroupedTables(filtered, page, 3);
  }

  function renderGroupedTables(items, page = 1, itemsPerPage = 3) {
    const wrapper = document.getElementById("crate-table-container");
    if (!items.length) {
      wrapper.innerHTML = `<p class="no-results">No items found.</p>`;
      return;
    }

    const grouped = {};
    items.forEach(item => {
      if (!grouped[item.set_name]) grouped[item.set_name] = [];
      grouped[item.set_name].push(item);
    });

    const sets = Object.keys(grouped);
    const totalPages = Math.ceil(sets.length / itemsPerPage);
    const paginated = sets.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    let html = `<div class="crate-tables-grid">`;
    for (const set of paginated) {
      html += generateTable(set, grouped[set]);
    }
    html += `</div>` + generatePaginationControls(page, totalPages);
    wrapper.innerHTML = html;

    document.querySelectorAll(".pagination-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const newPage = parseInt(btn.dataset.page, 10);
        updateAndRenderTables(newPage);
      });
    });
  }

  function generatePaginationControls(current, total) {
    if (total <= 1) return "";
    let buttons = "";
    for (let i = 1; i <= total; i++) {
      buttons += `<button class="pagination-btn view-all-btn${i === current ? ' active' : ''}" data-page="${i}">${i}</button>`;
    }
    return `<div class="pagination-controls">${buttons}</div>`;
  }

  function generateTable(label, items) {
    let html = `
      <div class="crate-table-wrapper">
        <h3 class="table-label">${label}</h3>
        <table class="crate-table">
          <thead><tr><th>Item Type</th><th>Item Name</th><th>Tags</th></tr></thead>
          <tbody>
    `;
    items.forEach(item => {
      const tags = item.tags?.map(tag => `<span class="tag">${tag}</span>`).join(" ") || "";
      const tooltip = item.tooltip ? `data-tooltip="${item.tooltip.replace(/^"+|"+$/g, '')}"` : "";
      html += `<tr><td><img src="${item.icon_url}" alt="${item.item_name}"/></td><td ${tooltip}>${item.item_name}</td><td>${tags}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
  }

  const searchInput = document.getElementById("item-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => updateAndRenderTables(1));
  }
}

// Tooltip
const globalTooltip = document.getElementById("global-tooltip");
document.addEventListener("mouseover", (e) => {
  const td = e.target.closest("td[data-tooltip]");
  if (!td) return;
  globalTooltip.textContent = td.getAttribute("data-tooltip");
  globalTooltip.style.display = "block";
  const rect = td.getBoundingClientRect();
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const top = Math.max(rect.top + scrollTop - 50, scrollTop);
  globalTooltip.style.top = `${top}px`;
  globalTooltip.style.left = `${rect.left + rect.width / 2}px`;
  globalTooltip.style.transform = "translateX(-50%)";
});
document.addEventListener("mouseout", (e) => {
  if (e.target.closest("td[data-tooltip]")) {
    globalTooltip.style.display = "none";
  }
});
