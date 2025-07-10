const iconSuccess = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
        <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clip-rule="evenodd"></path>
      </svg>`;

const iconError = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
        <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-1.72 6.97a.75.75 0 1 0-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06L12 13.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L13.06 12l1.72-1.72a.75.75 0 1 0-1.06-1.06L12 10.94l-1.72-1.72Z" clip-rule="evenodd"></path>
      </svg>`;

const iconWarning = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon">
  <path d="M1 21h22L12 2 1 21zM12 16v2h0v-2h0zm0-6v4h0v-4h0z"/>
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

  wrapper.querySelector(".close").onclick = () => wrapper.remove();
}
