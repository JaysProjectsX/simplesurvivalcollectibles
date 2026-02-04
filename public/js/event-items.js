(function () {
  const items = Array.isArray(window.EVENT_ITEMS) ? window.EVENT_ITEMS : [];

  function hidePreloader() {
    const preloader = document.getElementById("preloader");
    if (preloader) preloader.style.display = "none";
  }

  function safeText(v) {
    return (v ?? "").toString();
  }

  function renderTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return "";
    return tags.map(t => `<span class="event-tag">${safeText(t)}</span>`).join("");
  }

  function renderIcon(url, alt) {
    const src = safeText(url) || "/assets/placeholder.png";
    return `<img class="event-item-icon" src="${src}" alt="${safeText(alt)}" onerror="this.src='/assets/placeholder.png'">`;
  }

  function rarityLine(rarity) {
    const r = safeText(rarity).toLowerCase();
    if (r === "common") return `<div class="mc-line muted">Rarity: Common</div>`;
    if (r === "uncommon") return `<div class="mc-line good">Rarity: Uncommon</div>`;
    if (r === "rare") return `<div class="mc-line accent">Rarity: Rare</div>`;
    if (r === "epic") return `<div class="mc-line warn">Rarity: Epic</div>`;
    return `<div class="mc-line muted">Rarity: ${safeText(rarity) || "Unknown"}</div>`;
  }

  function updateTooltip(item) {
    const tooltip = document.getElementById("mcTooltip");
    if (!tooltip) return;

    if (!item) {
      tooltip.innerHTML = `
        <div class="mc-title-row">
          <img class="mc-icon" src="/assets/placeholder.png" alt="" />
          <div class="mc-title-wrap">
            <div class="mc-title">Select an item</div>
            <div class="mc-sub">Click an item from the table.</div>
          </div>
          <span class="mc-pill">INFO</span>
        </div>
        <div class="mc-divider"></div>
        <div class="mc-lines">
          <div class="mc-line muted">No item selected.</div>
        </div>
      `;
      return;
    }

    const name = safeText(item.name);
    const type = safeText(item.type);
    const eventName = safeText(item.event);
    const itemId = safeText(item.itemId);
    const desc = safeText(item.description);
    const obtainedFrom = safeText(item.obtainedFrom);
    const dates = safeText(item.dates);
    const notes = Array.isArray(item.notes) ? item.notes : [];
    const tags = Array.isArray(item.tags) ? item.tags : [];

    tooltip.innerHTML = `
      <div class="mc-title-row">
        <img class="mc-icon" src="${safeText(item.iconUrl) || "/assets/placeholder.png"}" alt="${name}" onerror="this.src='/assets/placeholder.png'"/>
        <div class="mc-title-wrap">
          <div class="mc-title">${name}</div>
          <div class="mc-sub">${type || "Item"} • ${eventName || "Event Item"}</div>
        </div>
        <span class="mc-pill">${(type || "ITEM").toUpperCase()}</span>
      </div>

      <div class="mc-divider"></div>

      <div class="mc-lines">
        ${rarityLine(item.rarity)}
        ${itemId ? `<div class="mc-line muted">${itemId}</div>` : ""}
        ${desc ? `<div class="mc-line">${desc}</div>` : ""}
        ${obtainedFrom ? `<div class="mc-line muted">Obtained: ${obtainedFrom}</div>` : ""}
        ${dates ? `<div class="mc-line muted">Available: ${dates}</div>` : ""}
        ${tags.length ? `<div class="mc-line muted">Tags: ${tags.map(t => safeText(t)).join(", ")}</div>` : ""}
        ${notes.length ? `<div class="mc-divider"></div>` : ""}
        ${notes.map(n => `<div class="mc-line muted">• ${safeText(n)}</div>`).join("")}
      </div>
    `;
  }

  function initTable() {
    if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.DataTable) {
      console.error("DataTables not loaded.");
      return;
    }

    const tableData = items.map(i => ({
      icon: renderIcon(i.iconUrl, i.name),
      name: safeText(i.name),
      event: safeText(i.event),
      tagsHtml: renderTags(i.tags),
      _raw: i
    }));

    const dt = jQuery("#eventItemsTable").DataTable({
      data: tableData,
      columns: [
        { data: "icon", title: "Icon", orderable: false },
        { data: "name", title: "Item" },
        { data: "event", title: "Event" },
        { data: "tagsHtml", title: "Tags", orderable: false }
      ],
      createdRow: function (row, data) {
        row.dataset.itemKey = data._raw?.key || "";
      },
      paging: true,
      pageLength: 8,
      lengthChange: false,
      info: false,
      autoWidth: false,
      responsive: true,
      order: [[1, "asc"]],
      language: {
        search: "Search:",
        emptyTable: "No event items found."
      }
    });

    jQuery("#eventItemsTable tbody").on("click", "tr", function () {
      const rowData = dt.row(this).data();
      if (!rowData) return;

      jQuery("#eventItemsTable tbody tr").removeClass("row-selected");
      jQuery(this).addClass("row-selected");

      updateTooltip(rowData._raw);
    });

    if (tableData.length) {
      const firstRow = jQuery("#eventItemsTable tbody tr").first();
      firstRow.addClass("row-selected");
      updateTooltip(tableData[0]._raw);
    } else {
      updateTooltip(null);
    }
  }

  window.addEventListener("load", function () {
    hidePreloader();
    initTable();
  });
})();
