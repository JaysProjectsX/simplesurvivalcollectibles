(() => {
  const SLIDESHOW_ENDPOINT = "/slideshow";

  const api = (path, init = {}) => {
    const base = "/api";
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

    if (window.AUTH && typeof window.AUTH.fetchWithAuth === "function") {
      return window.AUTH.fetchWithAuth(url, init);
    }

    // Fallback (public pages)
    return fetch(url, {
      credentials: "include",
      ...init,
      headers: { ...(init.headers || {}) },
    });
  };

  const escAttr = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const escText = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  window.initHomeSlideshow = function initHomeSlideshow() {
    let currentIndex = 0;

    const slider = document.getElementById("slider");
    const dotsContainer = document.getElementById("dots");
    if (!slider || !dotsContainer) return;

    const getSlides = () => Array.from(document.querySelectorAll(".slide"));

    // Prevent multiple timers if re-initialized
    if (window.__homeSlideshowTimer) {
      clearInterval(window.__homeSlideshowTimer);
      window.__homeSlideshowTimer = null;
    }

    const updateDots = () => {
      const slides = getSlides();
      dotsContainer.innerHTML = "";

      slides.forEach((_, i) => {
        const dot = document.createElement("span");
        dot.classList.toggle("active", i === currentIndex);
        dot.addEventListener("click", () => showSlide(i));
        dotsContainer.appendChild(dot);
      });
    };

    const showSlide = (index) => {
      const slides = getSlides();
      if (!slides.length) return;

      if (index >= slides.length) currentIndex = 0;
      else if (index < 0) currentIndex = slides.length - 1;
      else currentIndex = index;

      slider.style.transform = `translateX(-${currentIndex * 100}%)`;
      updateDots();
    };

    const moveSlide = (step) => showSlide(currentIndex + step);

    window.moveSlide = moveSlide;

    // Init
    showSlide(0);

    // Auto-advance
    window.__homeSlideshowTimer = setInterval(() => moveSlide(1), 6000);
  };

  async function loadSlidesFromBackend() {
    const slider = document.getElementById("slider");
    if (!slider) return;

    try {
      const res = await api(SLIDESHOW_ENDPOINT, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const images = await res.json();

      if (!Array.isArray(images) || images.length === 0) {
        window.initHomeSlideshow?.();
        return;
      }

      slider.innerHTML = images
        .map((img) => {
          const url = escAttr(img.url);
          const alt = escAttr(img.alt || "");
          const caption = escText(img.caption || "");
          return `
            <div class="slide">
              <img src="${url}" alt="${alt}">
              <div class="caption">${caption}</div>
            </div>
          `.trim();
        })
        .join("");

      window.initHomeSlideshow?.();
    } catch (err) {
      console.error("[slideshow] Failed to load backend slideshow:", err);
      window.initHomeSlideshow?.();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadSlidesFromBackend();
  });
})();
