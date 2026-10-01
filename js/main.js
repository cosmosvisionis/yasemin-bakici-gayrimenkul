(function () {
  var WA_NUMBER = "905324643192";
  var TEL = "+905324643192";

  function waLink(message) {
    return "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(message);
  }

  function setWa(el, message) {
    el.href = waLink(message);
    el.target = "_blank";
    el.rel = "noopener";
  }

  var cfg = window.YB_CONFIG || { api: "", base: "" };
  window.YB = { WA_NUMBER: WA_NUMBER, TEL: TEL, waLink: waLink, setWa: setWa, api: cfg.api, base: cfg.base, siteUrl: cfg.siteUrl };

  // Any element with data-wa="<message>" becomes a wa.me deep link with Turkish prefilled text.
  document.querySelectorAll("[data-wa]").forEach(function (el) {
    setWa(el, el.getAttribute("data-wa"));
  });

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
