const iconSuccess = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon-svg">
  <path fill-rule="evenodd" d="M12 2.25C6.615 2.25 2.25 6.615 2.25 12S6.615 21.75 12 21.75 21.75 17.385 21.75 12 17.385 2.25 12 2.25ZM16.03 9.28a.75.75 0 00-1.06-1.06l-4.72 4.72-1.72-1.72a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l5.25-5.25Z" clip-rule="evenodd"/>
</svg>`;

const iconError = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon-svg">
  <path fill-rule="evenodd" d="M12 2.25C6.615 2.25 2.25 6.615 2.25 12s4.365 9.75 9.75 9.75S21.75 17.385 21.75 12 17.385 2.25 12 2.25ZM13.06 12l2.72-2.72a.75.75 0 10-1.06-1.06L12 10.94 9.28 8.22a.75.75 0 10-1.06 1.06L10.94 12l-2.72 2.72a.75.75 0 101.06 1.06L12 13.06l2.72 2.72a.75.75 0 101.06-1.06L13.06 12Z" clip-rule="evenodd"/>
</svg>`;

const iconWarning = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon-svg">
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
          <div class="icon">${iconMap[type]}</div>
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
