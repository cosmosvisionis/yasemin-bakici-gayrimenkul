// Public listing pages: home featured, /ilanlar grid, /ilan/:id detail.
// All listing data is rendered with textContent (never innerHTML) because it is admin-entered.
(function () {
  var STATUS = { satilik: "Satılık", kiralik: "Kiralık" };
  var TYPE = { daire: "Daire", villa: "Villa", mustakil: "Müstakil", arsa: "Arsa", isyeri: "İşyeri" };
  var AVAILABILITY = { rezerve: "Rezerve", satildi: "Satıldı", kiralandi: "Kiralandı" };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatPrice(listing) {
    var n = String(listing.price).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return n + " ₺" + (listing.status === "kiralik" ? " / ay" : "");
  }

  function metaLine(l) {
    var parts = [TYPE[l.type]];
    if (l.rooms) parts.push(l.rooms);
    var m2 = l.gross_m2 || l.net_m2;
    if (m2) parts.push(m2 + " m²");
    return parts.filter(Boolean).join(" · ");
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) {
        var err = new Error("http " + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  }

  function cover(url, alt, cls) {
    if (!url) return el("div", cls + " cover-placeholder");
    var img = el("img", cls);
    img.src = url;
    img.alt = alt;
    img.loading = "lazy";
    img.decoding = "async";
    return img;
  }

  function badges(l) {
    var wrap = el("div", "badges");
    wrap.appendChild(el("span", "badge badge--" + l.status, STATUS[l.status]));
    if (AVAILABILITY[l.availability]) wrap.appendChild(el("span", "badge badge--state", AVAILABILITY[l.availability]));
    return wrap;
  }

  function card(l) {
    var a = el("a", "card" + (AVAILABILITY[l.availability] && l.availability !== "rezerve" ? " card--closed" : ""));
    a.href = YB.base + "/ilan/?id=" + l.id;
    var media = el("div", "card-img");
    media.appendChild(cover(l.cover, l.title, "card-photo"));
    media.appendChild(badges(l));
    var body = el("div", "card-body");
    body.appendChild(el("span", "meta", l.district + " · " + metaLine(l)));
    body.appendChild(el("h3", null, l.title));
    body.appendChild(el("span", "price", formatPrice(l)));
    a.appendChild(media);
    a.appendChild(body);
    return a;
  }

  function renderCards(container, listings) {
    container.replaceChildren.apply(container, listings.map(card));
  }

  // ---------- Home: featured ----------
  function initHome() {
    var section = document.getElementById("one-cikan");
    var grid = document.getElementById("featured-grid");
    if (!section || !grid) return;
    fetchJson(YB.api + "/listings?featured=1&sirala=yeni&limit=6")
      .then(function (data) {
        if (!data.listings.length) return;
        renderCards(grid, data.listings);
        section.hidden = false;
      })
      .catch(function () {});
  }

  // ---------- /ilanlar ----------
  function initList() {
    var form = document.getElementById("filters");
    var grid = document.getElementById("listing-grid");
    var state = document.getElementById("listing-state");
    var count = document.getElementById("result-count");
    if (!form || !grid) return;

    var FIELDS = ["durum", "tip", "ilce", "oda", "min", "max", "sirala"];
    var timer;

    function params() {
      var sp = new URLSearchParams();
      FIELDS.forEach(function (name) {
        var v = form.elements[name].value.trim();
        if (name === "min" || name === "max") v = v.replace(/[.\s]/g, "");
        if (v) sp.set(name, v);
      });
      return sp;
    }

    function setState(text) {
      state.textContent = text || "";
      state.hidden = !text;
    }

    function load() {
      var sp = params();
      history.replaceState(null, "", sp.toString() ? "?" + sp : location.pathname);
      count.textContent = "";
      fetchJson(YB.api + "/listings?" + sp)
        .then(function (data) {
          renderCards(grid, data.listings);
          var n = data.listings.length;
          count.textContent = n ? n + " ilan" : "";
          setState(n ? "" : "Bu kriterlere uygun ilan bulunamadı. Filtreleri değiştirmeyi deneyin.");
        })
        .catch(function () {
          grid.replaceChildren();
          setState("İlanlar yüklenemedi. Lütfen sayfayı yenileyin.");
        });
    }

    function fillOptions(select, values) {
      values.forEach(function (v) {
        var o = el("option", null, v);
        o.value = v;
        select.appendChild(o);
      });
    }

    var saved = new URLSearchParams(location.search);
    function restore() {
      FIELDS.forEach(function (name) {
        if (saved.has(name)) form.elements[name].value = saved.get(name);
      });
    }

    fetchJson(YB.api + "/facets")
      .then(function (f) {
        fillOptions(form.elements.ilce, f.districts);
        fillOptions(form.elements.oda, f.rooms);
      })
      .catch(function () {})
      .then(function () {
        restore();
        load();
      });

    form.addEventListener("change", load);
    form.addEventListener("input", function (e) {
      if (e.target.name === "min" || e.target.name === "max") {
        clearTimeout(timer);
        timer = setTimeout(load, 400);
      }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
    });
    document.getElementById("filters-reset").addEventListener("click", function () {
      form.reset();
      load();
    });
  }

  // ---------- /ilan/:id ----------
  function initDetail() {
    var root = document.getElementById("detail");
    var state = document.getElementById("detail-state");
    if (!root || !state) return;

    // Detail pages are /ilan?id=N (static hosting has no rewrites); the legacy /ilan/N form is still read.
    var m = location.search.match(/[?&]id=(\d+)/) || location.pathname.match(/\/ilan\/(\d+)\/?$/);
    if (!m) return notFound();

    function notFound() {
      state.textContent = "Bu ilan bulunamadı.";
      var back = el("a", "btn btn--ghost", "Tüm ilanlar");
      back.href = YB.base + "/ilanlar";
      root.appendChild(back);
    }

    fetchJson(YB.api + "/listings/" + m[1])
      .then(function (data) {
        render(data.listing);
      })
      .catch(function (err) {
        if (err.status === 404) notFound();
        else state.textContent = "İlan yüklenemedi. Lütfen sayfayı yenileyin.";
      });

    function gallery(l) {
      var wrap = el("div", "gallery");
      if (!l.photos.length) {
        wrap.appendChild(el("div", "gallery-slide cover-placeholder"));
        return wrap;
      }
      var track = el("div", "gallery-track");
      track.tabIndex = 0;
      l.photos.forEach(function (url, i) {
        var img = el("img", "gallery-slide");
        img.src = url;
        img.alt = l.title + " — fotoğraf " + (i + 1);
        if (i > 0) img.loading = "lazy";
        track.appendChild(img);
      });
      wrap.appendChild(track);
      if (l.photos.length > 1) {
        var counter = el("span", "gallery-count", "1 / " + l.photos.length);
        track.addEventListener("scroll", function () {
          var i = Math.round(track.scrollLeft / track.clientWidth);
          counter.textContent = i + 1 + " / " + l.photos.length;
        });
        wrap.appendChild(counter);
      }
      return wrap;
    }

    function facts(l) {
      var rows = [
        ["Durum", STATUS[l.status]],
        ["Tür", TYPE[l.type]],
        ["İl", YB.location.il],
        ["İlçe", YB.location.ilce],
        ["Mahalle", l.district],
        // ada/parsel are shown when the listing carries them (no such fields exist in the schema yet)
        ["Ada", l.ada ? String(l.ada) : null],
        ["Parsel", l.parsel ? String(l.parsel) : null],
        ["Oda sayısı", l.rooms],
        ["Brüt alan", l.gross_m2 ? l.gross_m2 + " m²" : null],
        ["Net alan", l.net_m2 ? l.net_m2 + " m²" : null],
        ["Bulunduğu kat", l.floor],
        ["Bina yaşı", l.building_age !== null && l.building_age !== undefined ? String(l.building_age) : null],
        ["Banyo", l.bathrooms ? String(l.bathrooms) : null],
        ["Isıtma", l.heating],
      ].filter(function (r) {
        return r[1];
      });
      var dl = el("dl", "facts-grid");
      rows.forEach(function (r) {
        var d = el("div");
        d.appendChild(el("dt", null, r[0]));
        d.appendChild(el("dd", null, r[1]));
        dl.appendChild(d);
      });
      return dl;
    }

    function render(l) {
      document.title = l.title + " | Yasemin Bakıcı Gayrimenkul";
      var canonicalUrl = (YB.siteUrl || location.origin + YB.base) + "/ilan/" + l.id + "/";
      var wrap = el("div", "detail-grid");

      var left = el("div");
      left.appendChild(gallery(l));

      var right = el("div", "detail-side");
      right.appendChild(badges(l));
      right.appendChild(el("h1", "detail-title", l.title));
      right.appendChild(el("p", "meta", l.district + " · " + metaLine(l)));
      right.appendChild(el("p", "detail-price", formatPrice(l)));

      var actions = el("div", "detail-actions");
      var wa = el("a", "btn", "WhatsApp ile sorun");
      YB.setWa(wa, "Merhaba, " + l.id + " numaralı \"" + l.title + "\" ilanı hakkında bilgi almak istiyorum.");
      var call = el("a", "btn btn--ghost", "Ara");
      call.href = "tel:" + YB.TEL;
      var share = el("button", "btn btn--ghost", "Paylaş");
      share.type = "button";
      share.setAttribute("data-share", "");
      share.addEventListener("click", function () {
        var url = canonicalUrl;
        if (navigator.share) {
          navigator.share({ title: l.title, url: url }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            share.textContent = "Bağlantı kopyalandı";
          });
        }
      });
      actions.append(wa, call, share);
      right.appendChild(actions);

      wrap.append(left, right);

      var below = el("div", "detail-below");
      below.appendChild(el("h2", null, "İlan bilgileri"));
      below.appendChild(facts(l));
      if (l.description) {
        below.appendChild(el("h2", null, "Açıklama"));
        l.description.split(/\n{2,}/).forEach(function (p) {
          if (p.trim()) below.appendChild(el("p", null, p.trim()));
        });
      }

      root.replaceChildren(wrap, below);
    }
  }

  initHome();
  initList();
  initDetail();
})();
