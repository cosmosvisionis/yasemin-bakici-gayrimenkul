// First-party, cookieless analytics: page views plus WhatsApp / call / share taps, sent to our own API.
// Skipped for the owner (signed in to the admin on this browser) and for Do Not Track / Global Privacy Control.
(function () {
  var cfg = window.YB_CONFIG || {};
  if (!cfg.api) return;
  try {
    if (localStorage.getItem("yb_token")) return;
  } catch (e) {}
  if (navigator.doNotTrack === "1" || navigator.globalPrivacyControl) return;

  var base = cfg.base || "";

  function page() {
    var p = location.pathname;
    if (base && p.indexOf(base) === 0) p = p.slice(base.length);
    p = p.replace(/\/index\.html$/, "/").replace(/\/+$/, "") || "/";
    var m = p.match(/^\/ilan\/(\d+)$/);
    if (m) return { p: "/ilan", l: Number(m[1]) };
    if (p === "/ilan") {
      var q = location.search.match(/[?&]id=(\d+)/);
      return { p: "/ilan", l: q ? Number(q[1]) : null };
    }
    return { p: p, l: null };
  }

  function send(kind, referrer) {
    var info = page();
    var body = { k: kind, p: info.p };
    if (info.l) body.l = info.l;
    if (referrer) body.r = referrer;
    try {
      // text/plain keeps this a "simple" request (no CORS preflight); keepalive survives navigation.
      fetch(cfg.api + "/collect", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain" }, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  send("pageview", document.referrer);

  document.addEventListener(
    "click",
    function (e) {
      var a = e.target.closest && e.target.closest("a, button");
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (href.indexOf("https://wa.me/") === 0) send("whatsapp");
      else if (href.indexOf("tel:") === 0) send("call");
      else if (a.hasAttribute("data-share")) send("share");
    },
    true,
  );
})();
