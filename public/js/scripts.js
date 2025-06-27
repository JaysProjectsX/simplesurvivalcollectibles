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
  if (!hero) return;  // Add this line to prevent the error
  let x = (window.innerWidth / 2 - event.pageX) / 150;
  let y = (window.innerHeight / 2 - event.pageY) / 150;
  hero.style.transform = `translate(${x}px, ${y}px)`;
});

const cards = document.querySelectorAll('.knowledge-card');
window.addEventListener('scroll', () => {
  cards.forEach(card => {
    const cardTop = card.getBoundingClientRect().top;
    if(cardTop < window.innerHeight - 100) {
      card.classList.add('reveal');
    }
  });
});

const dropdownContainer = document.getElementById("crate-dropdown-container");
const crateTableContainer = document.getElementById("crate-table-container");

if (dropdownContainer && crateTableContainer) {
    // Placeholder content for each crate
    let crateData = {}; // To hold the fetched crates

    fetch(
      "https://raw.githubusercontent.com/JaysProjectsX/simplesurvival-crates-data/refs/heads/main/crates.json"
    ) // or GitHub raw link if hosted externally
      .then((response) => response.json())
      .then((data) => {
        crateData = data;
        console.log("Crate data loaded:", crateData);

        populateCrateDropdown(crateData); // NEW: populate the dropdown

        // Extract and populate unique tags into the dropdown
        const searchInput = document.getElementById("item-search");

        function getAllUniqueTags(data) {
          const tagSet = new Set();
          Object.values(data).forEach((items) => {
            items.forEach((item) => {
              (item.tags || []).forEach((tag) => tagSet.add(tag));
            });
          });
          return Array.from(tagSet).sort();
        }

        function populateTagDropdown(tags) {
          const tagContainer = document.getElementById("tag-dropdown-container");
          const selected = tagContainer.querySelector(".selected-option");
          const optionsList = tagContainer.querySelector(".dropdown-options");
        
          optionsList.innerHTML = "";
        
          // Default "All Tags" option
          const defaultOpt = document.createElement("li");
          defaultOpt.textContent = "All Tags";
          defaultOpt.dataset.value = "";
          optionsList.appendChild(defaultOpt);
        
          tags.forEach((tag) => {
            const opt = document.createElement("li");
            opt.textContent = tag;
            opt.dataset.value = tag;
            optionsList.appendChild(opt);
          });
        
          optionsList.querySelectorAll("li").forEach((li) => {
            li.addEventListener("click", () => {
              selected.querySelector("span").previousSibling.textContent = li.textContent + " ";
              optionsList.querySelectorAll("li").forEach(opt => opt.classList.remove("active"));
              li.classList.add("active");
              tagContainer.classList.remove("open");
        
              const tag = li.dataset.value;
              const query = document.getElementById("item-search").value.trim();
              const results = filterAndSearchItems(crateData, query, tag);
              renderSearchResults(results);
            });
          });
        
          // Dropdown toggle
          selected.addEventListener("click", () => {
            tagContainer.classList.toggle("open");
          });
        
          document.addEventListener("click", (e) => {
            if (!tagContainer.contains(e.target)) {
              tagContainer.classList.remove("open");
            }
          });
        }

        populateTagDropdown(getAllUniqueTags(crateData));

        function filterAndSearchItems(data, searchTerm, selectedTag) {
          const results = [];
        
          Object.entries(data).forEach(([crateName, items]) => {
            items.forEach(item => {
              const matchesTag = !selectedTag || (item.tags || []).includes(selectedTag);
              const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase());
        
              if (matchesTag && matchesSearch) {
                results.push({ ...item, crateName });
              }
            });
          });
        
          return results;
        }
        
        function formatCrateName(name) {
          return name
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, str => str.toUpperCase())
            .trim();
        }

        function renderSearchResults(results) {
          if (results.length === 0) {
            crateTableContainer.innerHTML = `<p class="no-results">No items found.</p>`;
            return;
          }
        
          const groupedByCrate = {};
          results.forEach(item => {
            if (!groupedByCrate[item.crateName]) groupedByCrate[item.crateName] = [];
            groupedByCrate[item.crateName].push(item);
          });
        
          let html = "";
          for (const crate in groupedByCrate) {
            html += generateTable(crate, groupedByCrate[crate]);
          }
        
          crateTableContainer.innerHTML = `<div class="crate-tables-grid">${html}</div>`;
        }
        
        searchInput.addEventListener("input", () => {
          const tagContainer = document.getElementById("tag-dropdown-container");
          const activeTag = tagContainer.querySelector("li.active")?.dataset.value || "";
          const query = searchInput.value.trim();
          const results = filterAndSearchItems(crateData, query, activeTag);
          renderSearchResults(results);
        });              

      })
        .catch((error) => {
          console.error("Failed to load crate data:", error);

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
                ⚠️ Error: Failed to load crate data. Please contact the developer.<br>
                <small>Diagnostic Code: <code>LOAD_FAIL_${Date.now()}</code></small>
              </div>
            `;
          }
        });

      function populateCrateDropdown(crateData) {
        const dropdownContainer = document.getElementById("crate-dropdown-container");
        const selected = dropdownContainer.querySelector(".selected-option");
        const optionsList = dropdownContainer.querySelector(".dropdown-options");
      
        // Clear previous items
        optionsList.innerHTML = "";
      
        Object.entries(crateData).forEach(([crateName]) => {
          const li = document.createElement("li");
          const formattedName = crateName.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase());
          li.innerHTML = `${formattedName}`;
          li.dataset.value = crateName;
      
          li.addEventListener("click", () => {
            selected.querySelector("span").previousSibling.textContent = li.textContent + " ";
            optionsList.querySelectorAll("li").forEach(opt => opt.classList.remove("active"));
            li.classList.add("active");
            dropdownContainer.classList.remove("open");
      
            const crateItems = crateData[crateName];
            if (!crateItems) return;
      
            const groupedBySet = {};
            crateItems.forEach((item) => {
              if (!groupedBySet[item.set]) groupedBySet[item.set] = [];
              groupedBySet[item.set].push(item);
            });
      
            let tablesHTML = "";
            for (const setName in groupedBySet) {
              if (groupedBySet[setName].length > 0) {
                tablesHTML += generateTable(setName, groupedBySet[setName]);
              }
            }
      
            crateTableContainer.innerHTML = `<div class="crate-tables-grid">${tablesHTML}</div>`;
          });
      
          optionsList.appendChild(li);
        });
      
        // Close if clicking outside
        document.addEventListener("click", (e) => {
          if (!dropdownContainer.contains(e.target)) {
            dropdownContainer.classList.remove("open");
          }
        });
      }

    // Helper to format crate names nicely (optional)
    function formatCrateName(name) {
      // Example: "valentinesCrate" -> "Valentines Crate"
      return name
        .replace(/([A-Z])/g, " $1") // Add space before capital letters
        .replace(/^./, (str) => str.toUpperCase()); // Capitalize first letter
    }

    function generateTable(label, crateItems) {
      if (!crateItems || crateItems.length === 0) return "";

      let tableHTML = `
        <div class="crate-table-wrapper">
          <h3 class="table-label">${formatCrateName(label)}</h3>
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
        const tagHTML =
          item.tags && item.tags.length
            ? item.tags
                .map((tag) => `<span class="tag">${tag}</span>`)
                .join(" ")
            : "";

        // Check if item has a tooltip
        const tooltipAttr = item.tooltip
          ? `data-tooltip="${item.tooltip}"`
          : "";

        tableHTML += `
      <tr>
        <td><img src="${item.icon}" alt="${item.name}" /></td>
        <td ${tooltipAttr}>${item.name}</td>
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
  }

  // Changelog section (fetch latest crate.json commit messages)
  fetch("https://api.github.com/repos/JaysProjectsX/simplesurvival-crates-data/commits?path=crates.json")
  .then((res) => res.json())
  .then((commits) => {
    const changelogContainer = document.getElementById("changelog");
    const overlay = document.getElementById("changelog-modal-overlay");
    const fullContainer = document.getElementById("full-changelog");
    
    if (!changelogContainer || !overlay || !fullContainer) return;

    const excludedMessages = [
      "fixed json data", 
      "update", 
      "added the rest", 
      "add files via upload", 
      "updated crates.json", 
      "ignore this", 
      "cleanup"
    ];

    const filteredCommits = commits
      .filter((commit) => {
        const msg = commit.commit.message.toLowerCase();
        return !excludedMessages.some((bad) => msg.includes(bad));
      });

    // Inject first 3 into sidebar
    changelogContainer.innerHTML = filteredCommits
      .slice(0, 3)
      .map(
        (commit) => `
        <div class="changelog-entry">
          <p><strong>YooEm</strong> – ${new Date(
            commit.commit.author.date
          ).toLocaleString()}</p>
          <p>${commit.commit.message}</p>
        </div>
      `
      )
      .join("");

      const visibleCommits = filteredCommits.slice(0, 3);
      const hiddenCommits = filteredCommits.slice(3);

      // Only show View All if there are hidden entries
      if (hiddenCommits.length > 0) {
        const buttonHTML = `
          <button id="view-all-changelog" class="view-all-btn">View All</button>
        `;
        changelogContainer.insertAdjacentHTML("beforeend", buttonHTML);

        // Re-select elements after inserting button
        const viewAllBtn = document.getElementById("view-all-changelog");
        const closeBtn = document.getElementById("close-changelog");

        function closeModalWithFade() {
          overlay.classList.add("fade-out");
      
          setTimeout(() => {
            overlay.classList.remove("active", "fade-out");
          }, 300); // Match CSS animation duration
        }
        
        viewAllBtn.addEventListener("click", () => {
          fullContainer.innerHTML = hiddenCommits
            .map(
              (commit) => `
                <div class="changelog-entry">
                  <p><strong>YooEm</strong> – ${new Date(commit.commit.author.date).toLocaleString()}</p>
                  <p>${commit.commit.message}</p>
                </div>
              `
            )
            .join("");
          overlay.classList.add("active");
        });

        closeBtn.addEventListener("click", closeModalWithFade);

        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) closeModalWithFade();
        });
      }
  })

  .catch((err) => {
    console.error("Failed to load changelog:", err);
  })
  
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
