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
