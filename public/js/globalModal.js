const iconSuccess = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
        <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clip-rule="evenodd" />
      </svg>`;

const iconError = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
        <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clip-rule="evenodd"></path>
      </svg>`;

const iconWarning = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
  <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-.75 6a.75.75 0 0 1 1.5 0v4.5a.75.75 0 0 1-1.5 0V8.25Zm.75 7.875a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" clip-rule="evenodd" />
</svg>`;


function showGlobalModal({ type = "success", title = "", message = "", buttons = [], id = "globalModal" }) {
  const iconMap = {
    success: iconSuccess,
    error: iconError,
    warning: iconWarning
  };

  const modalHtml = `
    <div class="global-modal-container" id="${id}">
      <div class="global-modal ${type}">
        <div class="modal-header">
          <svg xmlns="http://www.w3.org/2000/svg" class="close" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </div>
        <div class="modal-body">
        ${iconMap[type]}
          <div>
            <h3>${title}</h3>
            <p>${message}</p>
          </div>
        </div>
        <div class="modal-footer">
          ${buttons.map(btn => `<button class="btn" onclick="${btn.onClick}">${btn.label}</button>`).join("")}
        </div>
      </div>
    </div>
  `;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = modalHtml;
  document.body.appendChild(wrapper);

  const container = wrapper.querySelector(".global-modal-container");

  wrapper.querySelector(".close").onclick = () => {
    container.classList.add("fadeOut");
    setTimeout(() => wrapper.remove(), 300); // Matches the CSS animation duration
  };
}


