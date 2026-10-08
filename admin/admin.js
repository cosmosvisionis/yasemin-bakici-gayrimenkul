// Yönetim paneli. Tüm metinler Türkçe. Veriler textContent ile yazılır (innerHTML kullanılmaz).
(function () {
  "use strict";

  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");
  var options = null;
  var toastTimer = null;
  var leaveGuard = null; // set by the form while there are unsaved changes

  // ---------- küçük yardımcılar ----------
  function h(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function button(label, cls, onClick) {
    var b = h("button", cls, label);
    b.type = "button";
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  function toast(message, isError) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = "show" + (isError ? " error" : "");
    toastTimer = setTimeout(function () {
      toastEl.className = "";
    }, isError ? 6000 : 2800);
  }

  function formatPrice(listing) {
    return String(listing.price).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " ₺" + (listing.status === "kiralik" ? " / ay" : "");
  }

  function digits(value) {
    return String(value == null ? "" : value).replace(/\D/g, "");
  }

  function groupDigits(value) {
    return digits(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function render() {
    app.replaceChildren.apply(app, arguments);
    window.scrollTo(0, 0);
  }

  // ---------- API ----------
  var TOKEN_KEY = "yb_token";
  var API = (window.YB_CONFIG && window.YB_CONFIG.api) || "";
  var BASE = (window.YB_CONFIG && window.YB_CONFIG.base) || "";

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setToken(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  // url is written as "/api/<route>"; the API host comes from site.config.json.
  function api(method, url, body) {
    var init = { method: method, headers: {} };
    var token = getToken();
    if (token) init.headers["Authorization"] = "Bearer " + token;
    if (typeof Blob !== "undefined" && body instanceof Blob) {
      init.body = body;
      init.headers["Content-Type"] = body.type;
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers["Content-Type"] = "application/json";
    }
    return fetch(API + url.replace(/^\/api/, ""), init).then(
      function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (res.ok) return data;
            if (res.status === 401 && url.indexOf("/api/auth/") !== 0) {
              setToken(null);
              showLogin();
            }
            var err = new Error(data.message || "Bir sorun oluştu. Lütfen tekrar deneyin.");
            err.status = res.status;
            err.fields = data.fields;
            throw err;
          });
      },
      function () {
        var err = new Error("İnternet bağlantısı yok ya da çok zayıf. Lütfen tekrar deneyin.");
        err.network = true;
        throw err;
      },
    );
  }

  // ---------- onay penceresi ----------
  function confirmModal(opts) {
    return new Promise(function (resolve) {
      var bg = h("div", "modal-bg");
      var box = h("div", "modal");
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.appendChild(h("h2", null, opts.title));
      box.appendChild(h("p", null, opts.text));
      function close(answer) {
        bg.remove();
        resolve(answer);
      }
      var cancel = button(opts.cancelLabel || "Vazgeç", "btn", function () {
        close(false);
      });
      var ok = button(opts.confirmLabel, "btn " + (opts.danger ? "btn--danger" : "btn--ghost"), function () {
        close(true);
      });
      box.append(cancel, ok);
      bg.appendChild(box);
      bg.addEventListener("click", function (e) {
        if (e.target === bg) close(false);
      });
      document.body.appendChild(bg);
      cancel.focus();
    });
  }

  // ---------- giriş ----------
  function showLogin() {
    leaveGuard = null;
    document.title = "Giriş | Yönetim Paneli";
    var box = h("form", "login");
    box.appendChild(h("h1", null, "Yönetim Paneli"));
    box.appendChild(h("p", null, "Yasemin Bakıcı Gayrimenkul"));

    var field = h("div", "field");
    var label = h("label", null, "Şifre");
    label.htmlFor = "pw";
    var input = h("input");
    input.id = "pw";
    input.type = "password";
    input.autocomplete = "current-password";
    input.required = true;
    var err = h("div", "field-error");
    err.hidden = true;
    field.append(label, input, err);

    var show = button("Şifreyi göster", "link-btn", function () {
      var visible = input.type === "text";
      input.type = visible ? "password" : "text";
      show.textContent = visible ? "Şifreyi göster" : "Şifreyi gizle";
    });

    var submit = h("button", "btn", "Giriş yap");
    submit.type = "submit";
    box.append(field, show, submit);

    box.addEventListener("submit", function (e) {
      e.preventDefault();
      err.hidden = true;
      submit.disabled = true;
      submit.textContent = "Giriş yapılıyor…";
      api("POST", "/api/auth/login", { password: input.value })
        .then(function (res) {
          setToken(res.token);
          start();
        })
        .catch(function (ex) {
          err.textContent = ex.message;
          err.hidden = false;
          submit.disabled = false;
          submit.textContent = "Giriş yap";
          input.focus();
        });
    });

    render(box);
  }

  // ---------- ilan listesi ----------
  function showList() {
    leaveGuard = null;
    document.title = "İlanlarım | Yönetim Paneli";
    var wrap = h("div", "wrap");
    var top = h("div", "topbar");
    top.appendChild(h("h1", null, "İlanlarım"));
    top.appendChild(
      button("Çıkış", "link-btn", function () {
        setToken(null);
        showLogin();
      }),
    );
    var add = h("a", "btn", "+ Yeni ilan ekle");
    add.href = "#/yeni";
    var stats = h("a", "btn btn--ghost", "📊 İstatistik");
    stats.href = "#/istatistik";
    stats.style.marginTop = "10px";
    var site = h("a", "link-btn", "Siteyi görüntüle");
    site.href = BASE + "/ilanlar";
    site.target = "_blank";
    site.rel = "noopener";

    var list = h("div");
    list.style.marginTop = "16px";
    list.appendChild(h("p", "empty", "Yükleniyor…"));
    wrap.append(top, add, stats, site, list);
    render(wrap);

    api("GET", "/api/admin/listings")
      .then(function (data) {
        if (!data.listings.length) {
          list.replaceChildren(h("p", "empty", "Henüz ilanınız yok. Başlamak için “Yeni ilan ekle” düğmesine dokunun."));
          return;
        }
        list.replaceChildren.apply(list, data.listings.map(listRow));
      })
      .catch(function (ex) {
        list.replaceChildren(h("p", "empty", ex.message));
      });
  }

  function listRow(l) {
    var a = h("a", "listing-row");
    a.href = "#/duzenle/" + l.id;
    if (l.cover) {
      var img = h("img", "thumb");
      img.src = l.cover;
      img.alt = "";
      img.loading = "lazy";
      a.appendChild(img);
    } else {
      a.appendChild(h("div", "thumb"));
    }
    var info = h("div", "info");
    info.appendChild(h("div", "name", l.title));
    info.appendChild(h("div", "sub", l.district + " · " + formatPrice(l)));
    var tags = h("div", "tags");
    tags.appendChild(h("span", "tag " + (l.published ? "tag--live" : "tag--draft"), l.published ? "Yayında" : "Taslak"));
    if (l.featured) tags.appendChild(h("span", "tag", "Öne çıkan"));
    var closed = { satildi: "Satıldı", kiralandi: "Kiralandı", rezerve: "Rezerve" }[l.availability];
    if (closed) tags.appendChild(h("span", "tag tag--closed", closed));
    if (!l.photo_count) tags.appendChild(h("span", "tag", "Fotoğraf yok"));
    info.appendChild(tags);
    a.appendChild(info);
    return a;
  }

  // ---------- ilan formu ----------
  function showForm(id) {
    document.title = (id ? "İlanı düzenle" : "Yeni ilan") + " | Yönetim Paneli";
    var wrap = h("div", "wrap");
    wrap.appendChild(h("p", "empty", "Yükleniyor…"));
    render(wrap);

    var load = id ? api("GET", "/api/admin/listings/" + id) : Promise.resolve(null);
    load
      .then(function (res) {
        buildForm(id, res && res.listing);
      })
      .catch(function (ex) {
        var box = h("div", "wrap");
        box.appendChild(h("p", "empty", ex.message));
        var back = h("a", "btn btn--ghost", "İlanlarıma dön");
        back.href = "#/";
        box.appendChild(back);
        render(box);
      });
  }

  function buildForm(id, listing) {
    var closedStates = ["satildi", "kiralandi"];
    var data = listing
      ? {
          title: listing.title,
          status: listing.status,
          type: listing.type,
          district: listing.district,
          price: digits(listing.price),
          rooms: listing.rooms || "",
          gross_m2: listing.gross_m2 == null ? "" : String(listing.gross_m2),
          net_m2: listing.net_m2 == null ? "" : String(listing.net_m2),
          floor: listing.floor || "",
          building_age: listing.building_age == null ? "" : String(listing.building_age),
          heating: listing.heating || "",
          description: listing.description || "",
          featured: !!listing.featured,
          published: !!listing.published,
          closed: closedStates.indexOf(listing.availability) !== -1,
          reserved: listing.availability === "rezerve",
        }
      : {
          title: "", status: "satilik", type: "daire", district: "", price: "", rooms: "", gross_m2: "", net_m2: "",
          floor: "", building_age: "", heating: "", description: "", featured: false, published: false, closed: false, reserved: false,
        };

    var dirty = false;
    var saving = false;
    var fieldEls = {};
    var wrap = h("div", "wrap");

    var top = h("div", "topbar");
    top.appendChild(button("← İlanlarım", "link-btn", leave));
    wrap.appendChild(top);
    wrap.appendChild(h("h1", null, id ? "İlanı düzenle" : "Yeni ilan"));
    wrap.lastChild.style.cssText = "font-size:1.5rem;margin:0 0 16px";

    function markDirty() {
      dirty = true;
      dirtyNote.hidden = false;
      leaveGuard = leave;
    }

    function clearError(key) {
      var f = fieldEls[key];
      if (!f) return;
      f.classList.remove("has-error");
      var e = f.querySelector(".field-error");
      if (e) e.remove();
    }

    function setErrors(fields) {
      var first = null;
      Object.keys(fields).forEach(function (key) {
        var f = fieldEls[key];
        if (!f) return;
        clearError(key);
        f.classList.add("has-error");
        f.appendChild(h("div", "field-error", fields[key]));
        if (!first) first = f;
      });
      if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    function wrapField(key, label, control, hint) {
      var f = h("div", "field");
      var l = h("label", null, label);
      if (control.id) l.htmlFor = control.id;
      f.append(l, control);
      if (hint) f.appendChild(h("div", "hint", hint));
      fieldEls[key] = f;
      return f;
    }

    function textInput(key, label, o) {
      o = o || {};
      var input = o.multiline ? h("textarea") : h("input");
      input.id = "f-" + key;
      if (!o.multiline) input.type = "text";
      if (o.numeric) input.inputMode = "numeric";
      if (o.placeholder) input.placeholder = o.placeholder;
      input.autocomplete = "off";
      input.value = o.format ? o.format(data[key]) : data[key];
      input.addEventListener("input", function () {
        data[key] = o.numeric ? digits(input.value) : input.value;
        if (o.format) input.value = o.format(data[key]);
        clearError(key);
        markDirty();
      });
      return wrapField(key, label, input, o.hint);
    }

    function selectInput(key, label, choices, placeholder, onChange) {
      var select = h("select");
      select.id = "f-" + key;
      var empty = h("option", null, placeholder);
      empty.value = "";
      select.appendChild(empty);
      choices.forEach(function (c) {
        var o = h("option", null, c.label);
        o.value = c.value;
        select.appendChild(o);
      });
      select.value = data[key];
      select.addEventListener("change", function () {
        data[key] = select.value;
        clearError(key);
        markDirty();
        if (onChange) onChange();
      });
      return wrapField(key, label, select);
    }

    function plain(list) {
      return list.map(function (x) {
        return { value: x, label: x };
      });
    }

    // Temel bilgiler
    var basics = h("div", "card");
    basics.appendChild(h("h2", null, "Temel bilgiler"));
    basics.appendChild(textInput("title", "İlan başlığı", { placeholder: "Örn. Deniz manzaralı 3+1 daire" }));

    var statusField = h("div", "field");
    statusField.appendChild(h("div", "label", "İlan türü"));
    var seg = h("div", "segmented");
    var segButtons = {};
    [["satilik", "Satılık"], ["kiralik", "Kiralık"]].forEach(function (pair) {
      var b = button(pair[1], null, function () {
        data.status = pair[0];
        markDirty();
        syncStatus();
      });
      segButtons[pair[0]] = b;
      seg.appendChild(b);
    });
    statusField.appendChild(seg);
    fieldEls.status = statusField;
    basics.appendChild(statusField);

    var typeChoices = Object.keys(options.types).map(function (k) {
      return { value: k, label: options.types[k] };
    });
    basics.appendChild(selectInput("type", "Mülk türü", typeChoices, "Seçin", syncType));
    basics.appendChild(selectInput("district", "Bölge (mahalle)", plain(options.districts), "Seçin"));
    var priceField = textInput("price", "Fiyat (₺)", { numeric: true, format: groupDigits, placeholder: "Örn. 6.850.000" });
    var priceHint = h("div", "hint");
    priceField.appendChild(priceHint);
    basics.appendChild(priceField);
    wrap.appendChild(basics);

    // Özellikler
    var props = h("div", "card");
    props.appendChild(h("h2", null, "Özellikler"));
    var roomsField = selectInput("rooms", "Oda sayısı", plain(options.rooms), "Seçin");
    props.appendChild(roomsField);
    var areas = h("div", "row2");
    areas.appendChild(textInput("gross_m2", "Brüt m²", { numeric: true }));
    areas.appendChild(textInput("net_m2", "Net m²", { numeric: true }));
    props.appendChild(areas);
    var more = h("div", "row2");
    more.appendChild(textInput("floor", "Bulunduğu kat", { placeholder: "Örn. 3" }));
    more.appendChild(textInput("building_age", "Bina yaşı", { numeric: true }));
    props.appendChild(more);
    props.appendChild(selectInput("heating", "Isıtma", plain(options.heating), "Seçin"));
    wrap.appendChild(props);

    // Açıklama
    var desc = h("div", "card");
    desc.appendChild(h("h2", null, "Açıklama"));
    desc.appendChild(textInput("description", "İlan açıklaması", { multiline: true, hint: "Paragraflar arasında boş satır bırakabilirsiniz." }));
    wrap.appendChild(desc);

    // Fotoğraflar
    wrap.appendChild(photosSection(id, listing ? listing.photos : [], options.maxPhotos));

    // Durum
    var state = h("div", "card");
    state.appendChild(h("h2", null, "Durum"));
    function toggle(key, title, detail) {
      var row = h("label", "switch-row");
      var text = h("span");
      var t = h("span", "t", title);
      var d = h("span", "d", detail);
      text.append(t, d);
      var cb = h("input");
      cb.type = "checkbox";
      cb.checked = data[key];
      cb.addEventListener("change", function () {
        data[key] = cb.checked;
        markDirty();
      });
      row.append(text, cb);
      return { row: row, title: t };
    }
    var published = toggle("published", "Yayında", "Açıkken ilan sitede görünür. Kapalıysa taslak olarak kalır.");
    var featured = toggle("featured", "Ana sayfada öne çıkar", "En fazla 6 ilan ana sayfada gösterilir.");
    var closed = toggle("closed", "Satıldı", "İşaretlenirse ilan sitede kalır, üzerinde rozet görünür.");
    state.append(published.row, featured.row, closed.row);
    wrap.appendChild(state);

    // Sil
    if (id) {
      var del = h("div", "card");
      del.appendChild(h("h2", null, "İlanı sil"));
      del.appendChild(h("p", "hint", "Silmek yerine “Yayında” düğmesini kapatarak ilanı sitede gizleyebilirsiniz."));
      del.appendChild(button("İlanı sil", "btn btn--danger", deleteListing));
      wrap.appendChild(del);
    }

    // Kaydet çubuğu
    var bar = h("div", "savebar");
    var inner = h("div", "savebar-inner");
    var dirtyNote = h("div", "dirty", "Kaydedilmemiş değişiklikler var");
    dirtyNote.hidden = true;
    var save = button(id ? "Kaydet" : "İlanı kaydet", "btn", doSave);
    inner.append(dirtyNote, save);
    bar.appendChild(inner);
    wrap.appendChild(bar);

    function syncStatus() {
      Object.keys(segButtons).forEach(function (k) {
        segButtons[k].setAttribute("aria-pressed", String(data.status === k));
      });
      closed.title.textContent = data.status === "kiralik" ? "Kiralandı" : "Satıldı";
      priceHint.textContent = data.status === "kiralik" ? "Aylık kira tutarını yazın." : "";
      clearError("status");
    }

    function syncType() {
      roomsField.hidden = options.noRoomTypes.indexOf(data.type) !== -1;
    }

    function clientCheck() {
      var errors = {};
      if (!data.title.trim()) errors.title = "Başlık yazın.";
      if (!data.type) errors.type = "Mülk türünü seçin.";
      if (!data.district) errors.district = "Bölgeyi listeden seçin.";
      if (!data.price || Number(data.price) < 1) errors.price = "Fiyatı rakamla yazın.";
      return Object.keys(errors).length ? errors : null;
    }

    function payload() {
      return {
        title: data.title,
        status: data.status,
        type: data.type,
        district: data.district,
        price: data.price,
        rooms: data.rooms,
        gross_m2: data.gross_m2,
        net_m2: data.net_m2,
        floor: data.floor,
        building_age: data.building_age,
        heating: data.heating,
        description: data.description,
        featured: data.featured,
        published: data.published,
        availability: data.closed ? (data.status === "kiralik" ? "kiralandi" : "satildi") : data.reserved ? "rezerve" : "aktif",
      };
    }

    function doSave() {
      if (saving) return;
      var problems = clientCheck();
      if (problems) {
        setErrors(problems);
        toast("Lütfen işaretli alanları doldurun.", true);
        return;
      }
      saving = true;
      save.disabled = true;
      save.textContent = "Kaydediliyor…";
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

      var request = id ? api("PUT", "/api/admin/listings/" + id, payload()) : api("POST", "/api/admin/listings", payload());
      request
        .then(function (res) {
          dirty = false;
          leaveGuard = null;
          dirtyNote.hidden = true;
          if (!id) {
            sessionStorage.setItem("yb-new", "1");
            location.hash = "#/duzenle/" + res.id;
            toast("Kaydedildi ✓ Şimdi fotoğraf ekleyebilirsiniz.");
          } else {
            toast("Kaydedildi ✓");
          }
        })
        .catch(function (ex) {
          if (ex.fields) setErrors(ex.fields);
          toast("Kaydedilemedi. " + ex.message, true);
        })
        .then(function () {
          saving = false;
          save.disabled = false;
          save.textContent = id ? "Kaydet" : "İlanı kaydet";
        });
    }

    function leave() {
      if (!dirty) {
        leaveGuard = null;
        location.hash = "#/";
        return;
      }
      confirmModal({
        title: "Kaydedilmemiş değişiklikler var",
        text: "Çıkarsanız yaptığınız değişiklikler kaybolur.",
        confirmLabel: "Kaydetmeden çık",
        cancelLabel: "Burada kal",
        danger: true,
      }).then(function (yes) {
        if (yes) {
          dirty = false;
          leaveGuard = null;
          location.hash = "#/";
        }
      });
    }

    function deleteListing() {
      confirmModal({
        title: "Bu ilan silinsin mi?",
        text: "“" + data.title + "” ilanı ve tüm fotoğrafları silinecek.",
        confirmLabel: "Devam et",
        danger: true,
      })
        .then(function (yes) {
          if (!yes) return null;
          return confirmModal({
            title: "Emin misiniz?",
            text: "Bu işlem geri alınamaz. İlan ve fotoğrafları kalıcı olarak silinecek.",
            confirmLabel: "Evet, kalıcı olarak sil",
            danger: true,
          });
        })
        .then(function (yes) {
          if (!yes) return;
          return api("DELETE", "/api/admin/listings/" + id).then(function () {
            dirty = false;
            leaveGuard = null;
            location.hash = "#/";
            toast("İlan silindi.");
          });
        })
        .catch(function (ex) {
          toast("Silinemedi. " + ex.message, true);
        });
    }

    syncStatus();
    syncType();
    render(wrap);
    if (id && sessionStorage.getItem("yb-new")) {
      sessionStorage.removeItem("yb-new");
    }
  }

  // ---------- fotoğraflar ----------
  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(resolve, type, quality);
    });
  }

  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () {
        return viaImage(file);
      });
    }
    return viaImage(file);
  }

  function viaImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Fotoğraf açılamadı."));
      };
      img.src = url;
    });
  }

  // Max 2000px on the long edge. WebP where the browser can encode it, otherwise JPEG
  // (Safari cannot encode WebP from a canvas).
  function prepareImage(file) {
    return loadBitmap(file).then(function (bitmap) {
      var w = bitmap.width;
      var hgt = bitmap.height;
      var scale = Math.min(1, 2000 / Math.max(w, hgt));
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(hgt * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (bitmap.close) bitmap.close();
      return toBlob(canvas, "image/webp", 0.82)
        .then(function (blob) {
          return blob && blob.type === "image/webp" ? blob : toBlob(canvas, "image/jpeg", 0.85);
        })
        .then(function (blob) {
          canvas.width = canvas.height = 0;
          if (!blob) throw new Error("Fotoğraf hazırlanamadı.");
          return blob;
        });
    });
  }

  function photosSection(listingId, photos, max) {
    var card = h("div", "card");
    var title = h("h2");
    card.appendChild(title);

    if (!listingId) {
      card.appendChild(h("p", "hint", "Fotoğraf eklemek için önce ilanı kaydedin. Kaydettikten sonra bu bölümden fotoğraf yükleyebilirsiniz."));
      title.textContent = "Fotoğraflar";
      return card;
    }

    card.appendChild(
      h("p", "hint", "Fotoğraflar anında kaydedilir. İlk fotoğraf kapak olur. Sırayı değiştirmek için ↕ simgesini basılı tutup sürükleyin ya da “Kapak yap” düğmesine dokunun."),
    );
    var grid = h("div", "photo-grid");
    grid.style.marginTop = "12px";
    var picker = h("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.multiple = true;
    picker.hidden = true;
    var add = button("📷 Fotoğraf ekle", "btn", function () {
      picker.click();
    });
    card.append(grid, add, picker);

    var queue = [];
    var working = false;
    var uploadedInBatch = 0;
    var failedInBatch = 0;

    function tiles() {
      return Array.prototype.slice.call(grid.querySelectorAll(".photo-tile"));
    }

    function updateTitle() {
      title.textContent = "Fotoğraflar (" + tiles().length + "/" + max + ")";
    }

    function refresh() {
      tiles().forEach(function (tile, i) {
        var tag = tile.querySelector(".cover-tag");
        var coverBtn = tile.querySelector(".make-cover");
        if (tag) tag.hidden = i !== 0;
        if (coverBtn) {
          coverBtn.disabled = i === 0;
          coverBtn.textContent = i === 0 ? "Kapak ✓" : "Kapak yap";
        }
      });
      updateTitle();
    }

    function ids() {
      return tiles()
        .filter(function (t) {
          return t.dataset.id;
        })
        .map(function (t) {
          return Number(t.dataset.id);
        });
    }

    function persistOrder() {
      return api("PUT", "/api/admin/listings/" + listingId + "/photos", { order: ids() }).then(
        function () {
          toast("Sıra kaydedildi ✓");
        },
        function (ex) {
          toast("Sıra kaydedilemedi. " + ex.message, true);
          reload();
        },
      );
    }

    function reload() {
      return api("GET", "/api/admin/listings/" + listingId).then(function (res) {
        grid.replaceChildren.apply(grid, res.listing.photos.map(realTile));
        refresh();
      });
    }

    function uploading() {
      return working || queue.length > 0;
    }

    function realTile(p) {
      var tile = h("div", "photo-tile");
      tile.dataset.id = p.id;
      var img = h("img");
      img.src = p.url;
      img.alt = "İlan fotoğrafı";
      img.loading = "lazy";
      tile.appendChild(img);
      tile.appendChild(h("span", "cover-tag", "Kapak"));
      var handle = button("↕", "drag-handle");
      handle.setAttribute("aria-label", "Sırayı değiştirmek için basılı tutup sürükleyin");
      tile.appendChild(handle);

      var actions = h("div", "photo-actions");
      var cover = button("Kapak yap", "make-cover", function () {
        if (uploading()) return toast("Yükleme bitince sıralayabilirsiniz.", true);
        var first = tiles()[0];
        if (first && first !== tile) {
          grid.insertBefore(tile, first);
          refresh();
          persistOrder();
        }
      });
      var remove = button("Sil", "del", function () {
        confirmModal({ title: "Fotoğraf silinsin mi?", text: "Bu fotoğraf ilandan kalıcı olarak silinecek.", confirmLabel: "Evet, sil", danger: true })
          .then(function (yes) {
            if (!yes) return;
            return api("DELETE", "/api/admin/photos/" + p.id).then(function () {
              tile.remove();
              refresh();
              toast("Fotoğraf silindi.");
            });
          })
          .catch(function (ex) {
            toast("Silinemedi. " + ex.message, true);
          });
      });
      actions.append(cover, remove);
      tile.appendChild(actions);
      return tile;
    }

    function placeholder(text) {
      var tile = h("div", "photo-tile");
      var status = h("div", "status");
      status.appendChild(h("span", "spinner"));
      status.appendChild(h("span", null, text));
      tile.appendChild(status);
      return tile;
    }

    function setStatus(tile, text) {
      var s = tile.querySelector(".status span:last-child");
      if (s) s.textContent = text;
    }

    function pump() {
      if (working) return;
      var job = queue.shift();
      if (!job) {
        if (uploadedInBatch) toast(uploadedInBatch + " fotoğraf yüklendi ✓");
        else if (failedInBatch) toast("Bazı fotoğraflar yüklenemedi. “Tekrar dene” düğmesine dokunun.", true);
        uploadedInBatch = 0;
        failedInBatch = 0;
        return;
      }
      working = true;
      var step = job.blob ? Promise.resolve(job.blob) : (setStatus(job.tile, "Hazırlanıyor…"), prepareImage(job.file));
      step
        .then(function (blob) {
          job.blob = blob;
          setStatus(job.tile, "Yükleniyor…");
          return api("POST", "/api/admin/listings/" + listingId + "/photos", blob);
        })
        .then(function (res) {
          var real = realTile(res.photo);
          job.tile.replaceWith(real);
          uploadedInBatch++;
          refresh();
        })
        .catch(function (ex) {
          failedInBatch++;
          markFailed(job, ex.message);
        })
        .then(function () {
          working = false;
          pump();
        });
    }

    function markFailed(job, message) {
      job.tile.className = "photo-tile failed";
      var s = h("div", "status");
      s.appendChild(h("span", null, message));
      s.appendChild(
        button("Tekrar dene", null, function () {
          job.tile.className = "photo-tile";
          var st = h("div", "status");
          st.appendChild(h("span", "spinner"));
          st.appendChild(h("span", null, "Sırada…"));
          job.tile.replaceChildren(st);
          queue.push(job);
          pump();
        }),
      );
      var drop = button("Vazgeç", null, function () {
        job.tile.remove();
        refresh();
      });
      s.appendChild(drop);
      job.tile.replaceChildren(s);
    }

    picker.addEventListener("change", function () {
      var files = Array.prototype.slice.call(picker.files || []);
      picker.value = "";
      if (!files.length) return;
      var room = max - tiles().length;
      if (room <= 0) return toast("Bir ilana en fazla " + max + " fotoğraf eklenebilir.", true);
      if (files.length > room) {
        toast("En fazla " + max + " fotoğraf eklenebilir. İlk " + room + " fotoğraf yüklenecek.", true);
        files = files.slice(0, room);
      }
      files.forEach(function (file) {
        var tile = placeholder("Sırada…");
        grid.appendChild(tile);
        queue.push({ file: file, tile: tile });
      });
      refresh();
      pump();
    });

    // Sürükle-bırak sıralama (dokunmatik ve fare)
    grid.addEventListener("pointerdown", function (e) {
      var handle = e.target.closest(".drag-handle");
      if (!handle) return;
      if (uploading()) return toast("Yükleme bitince sıralayabilirsiniz.", true);
      var tile = handle.closest(".photo-tile");
      e.preventDefault();
      tile.classList.add("dragging");
      grid.setPointerCapture(e.pointerId);
      var before = ids().join();

      function move(ev) {
        var under = document.elementFromPoint(ev.clientX, ev.clientY);
        var target = under && under.closest(".photo-tile[data-id]");
        if (!target || target === tile || target.parentNode !== grid) return;
        var all = tiles();
        if (all.indexOf(tile) < all.indexOf(target)) target.after(tile);
        else target.before(tile);
        refresh();
      }
      function end() {
        grid.removeEventListener("pointermove", move);
        grid.removeEventListener("pointerup", end);
        grid.removeEventListener("pointercancel", end);
        tile.classList.remove("dragging");
        if (ids().join() !== before) persistOrder();
      }
      grid.addEventListener("pointermove", move);
      grid.addEventListener("pointerup", end);
      grid.addEventListener("pointercancel", end);
    });

    grid.replaceChildren.apply(grid, photos.map(realTile));
    refresh();
    return card;
  }

  // ---------- istatistik ----------
  function dayList(today, days) {
    var out = [];
    var end = Date.parse(today + "T12:00:00Z");
    for (var i = days - 1; i >= 0; i--) out.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
    return out;
  }

  function dayLabel(day, long) {
    return new Date(day + "T12:00:00Z").toLocaleDateString("tr-TR", long ? { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
  }

  function showStats(days) {
    leaveGuard = null;
    days = days || 30;
    document.title = "İstatistik | Yönetim Paneli";
    var wrap = h("div", "wrap");
    var top = h("div", "topbar");
    var back = h("a", "link-btn", "← İlanlarım");
    back.href = "#/";
    top.appendChild(back);
    wrap.appendChild(top);
    var title = h("h1", null, "İstatistik");
    title.style.cssText = "font-size:1.5rem;margin:0 0 16px";
    wrap.appendChild(title);

    var seg = h("div", "segmented seg3");
    [7, 30, 90].forEach(function (n) {
      var b = button("Son " + n + " gün", null, function () {
        showStats(n);
      });
      b.setAttribute("aria-pressed", String(n === days));
      seg.appendChild(b);
    });
    wrap.appendChild(seg);

    var body = h("div");
    body.style.marginTop = "16px";
    body.appendChild(h("p", "empty", "Yükleniyor…"));
    wrap.appendChild(body);
    render(wrap);

    api("GET", "/api/admin/stats?days=" + days)
      .then(function (data) {
        body.replaceChildren.apply(body, statsBody(data));
      })
      .catch(function (ex) {
        body.replaceChildren(h("p", "empty", ex.message));
      });
  }

  function statCard(label, value, note) {
    var c = h("div", "stat");
    c.appendChild(h("div", "stat-value", groupDigits(value)));
    c.appendChild(h("div", "stat-label", label));
    if (note) c.appendChild(h("div", "hint", note));
    return c;
  }

  function statsBody(data) {
    var byDay = {};
    data.daily.forEach(function (d) {
      byDay[d.day] = d;
    });
    var list = dayList(data.today, data.days).map(function (day) {
      return byDay[day] || { day: day, views: 0, visitors: 0, contacted: 0, whatsapp: 0, calls: 0, shares: 0 };
    });
    var sum = function (key) {
      return list.reduce(function (t, d) {
        return t + Number(d[key]);
      }, 0);
    };
    var visitors = sum("visitors");
    var views = sum("views");
    var whatsapp = sum("whatsapp");
    var calls = sum("calls");
    var out = [];

    if (!views && !whatsapp && !calls) {
      out.push(h("p", "empty", "Henüz veri yok. Ziyaretçiler geldikçe burada görünecek. Kendi ziyaretleriniz (panele giriş yapmışken) sayılmaz."));
      return out;
    }

    var today = list[list.length - 1];
    var todayCard = h("div", "card");
    todayCard.appendChild(h("h2", null, "Bugün"));
    var tg = h("div", "stat-grid");
    tg.append(statCard("Ziyaretçi", today.visitors), statCard("WhatsApp", today.whatsapp));
    todayCard.appendChild(tg);
    out.push(todayCard);

    var sumCard = h("div", "card");
    sumCard.appendChild(h("h2", null, "Son " + data.days + " gün"));
    var grid = h("div", "stat-grid");
    grid.append(
      statCard("Ziyaretçi", visitors, "Her gün ayrı sayılır"),
      statCard("Sayfa görüntüleme", views),
      statCard("WhatsApp tıklaması", whatsapp),
      statCard("Arama tıklaması", calls),
    );
    sumCard.appendChild(grid);
    if (visitors) {
      var rate = Math.min(100, Math.round((sum("contacted") / visitors) * 100));
      sumCard.appendChild(h("p", "hint", "Ziyaretçilerin yaklaşık %" + rate + "’i WhatsApp’a veya telefona tıkladı."));
    }
    out.push(sumCard);

    // Daily visitors bar chart
    var chart = h("div", "card");
    chart.appendChild(h("h2", null, "Günlük ziyaretçi"));
    var max = Math.max.apply(null, list.map(function (d) {
      return Number(d.visitors);
    }).concat([1]));
    var bars = h("div", "bars");
    list.forEach(function (d) {
      var b = h("div", "bar");
      b.style.height = Math.max((Number(d.visitors) / max) * 100, d.visitors > 0 ? 3 : 0) + "%";
      b.title = dayLabel(d.day) + ": " + d.visitors + " ziyaretçi, " + d.whatsapp + " WhatsApp";
      if (Number(d.whatsapp) > 0) b.classList.add("bar--contact");
      bars.appendChild(b);
    });
    chart.appendChild(bars);
    var axis = h("div", "bars-axis");
    axis.append(h("span", null, dayLabel(list[0].day)), h("span", null, dayLabel(list[list.length - 1].day)));
    chart.appendChild(axis);
    chart.appendChild(h("p", "hint", "Koyu renkli çubuklar: o gün WhatsApp tıklaması olan günler."));
    out.push(chart);

    // Last 7 days table
    var recent = h("div", "card");
    recent.appendChild(h("h2", null, "Son 7 gün"));
    list
      .slice(-7)
      .reverse()
      .forEach(function (d) {
        var row = h("div", "line");
        row.appendChild(h("span", null, dayLabel(d.day, true)));
        row.appendChild(h("strong", null, d.visitors + " ziyaretçi · " + d.whatsapp + " WhatsApp"));
        recent.appendChild(row);
      });
    out.push(recent);

    if (data.topListings.length) {
      var topCard = h("div", "card");
      topCard.appendChild(h("h2", null, "En çok bakılan ilanlar"));
      data.topListings.forEach(function (l) {
        var a = h("a", "line line--link");
        a.href = "#/duzenle/" + l.id;
        a.appendChild(h("span", null, l.title));
        a.appendChild(h("strong", null, l.views + " görüntüleme · " + l.contacts + " iletişim"));
        topCard.appendChild(a);
      });
      out.push(topCard);
    }

    if (data.sources.length) {
      var src = h("div", "card");
      src.appendChild(h("h2", null, "Ziyaretçiler nereden geliyor?"));
      var total = data.sources.reduce(function (t, s) {
        return t + Number(s.n);
      }, 0);
      data.sources.forEach(function (s) {
        var row = h("div", "meter-row");
        var label = h("div", "line");
        label.append(h("span", null, s.label), h("strong", null, s.n + " (%" + Math.round((s.n / total) * 100) + ")"));
        var meter = h("div", "meter");
        var fill = h("div", "meter-fill");
        fill.style.width = (s.n / total) * 100 + "%";
        meter.appendChild(fill);
        row.append(label, meter);
        src.appendChild(row);
      });
      out.push(src);
    }

    var mob = Number(data.devices["mobil"] || 0);
    var desk = Number(data.devices["masaüstü"] || 0);
    if (mob + desk) {
      var dev = h("div", "card");
      dev.appendChild(h("h2", null, "Cihaz"));
      dev.appendChild(h("p", null, "Telefon %" + Math.round((mob / (mob + desk)) * 100) + " · Bilgisayar %" + Math.round((desk / (mob + desk)) * 100)));
      out.push(dev);
    }
    return out;
  }

  // ---------- yönlendirme ----------
  function route() {
    var hash = location.hash.replace(/^#/, "") || "/";
    var m = hash.match(/^\/duzenle\/(\d+)$/);
    if (hash === "/") showList();
    else if (hash === "/istatistik") showStats();
    else if (hash === "/yeni") showForm(null);
    else if (m) showForm(Number(m[1]));
    else location.hash = "#/";
  }

  var lastHash = location.hash;
  window.addEventListener("hashchange", function () {
    if (leaveGuard && location.hash !== lastHash) {
      var target = location.hash;
      history.replaceState(null, "", lastHash || "#/");
      leaveGuard();
      void target;
      return;
    }
    lastHash = location.hash;
    route();
  });

  window.addEventListener("beforeunload", function (e) {
    if (leaveGuard) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  function start() {
    if (!getToken()) return showLogin();
    api("GET", "/api/admin/options")
      .then(function (opts) {
        options = opts;
        route();
      })
      .catch(function (ex) {
        if (ex.status === 401) return; // giriş ekranı zaten gösterildi
        var box = h("div", "wrap");
        box.appendChild(h("p", "empty", ex.message));
        box.appendChild(button("Tekrar dene", "btn", start));
        render(box);
      });
  }

  start();
})();
