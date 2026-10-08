// Pre-renders one static page per published listing (own title, description, OG image, JSON-LD) and sitemap.xml.
// Why: the site is static, but WhatsApp/Google link previews and crawlers read the raw HTML, so each listing
// needs its own head tags. The page still loads live data client-side, so visitors always see fresh content.
//
// Usage: node prerender.mjs <site root>      (the folder containing ilan/index.html and js/config.js)
// Runs at deploy time (scripts/deploy-site.mjs) and every 30 minutes in GitHub Actions (ci/refresh.yml).
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const STATUS = { satilik: "Satılık", kiralik: "Kiralık" };
const TYPE = { daire: "Daire", villa: "Villa", mustakil: "Müstakil", arsa: "Arsa", isyeri: "İşyeri" };
const ABOUT_TYPE = { daire: "Apartment", villa: "House", mustakil: "SingleFamilyResidence", arsa: "Place", isyeri: "Place" };
const SOLD = ["satildi", "kiralandi"];

export const esc = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const formatPrice = (l) => String(l.price).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " ₺" + (l.status === "kiralik" ? " / ay" : "");

export function describe(l) {
  const facts = [l.rooms, l.gross_m2 || l.net_m2 ? `${l.gross_m2 || l.net_m2} m²` : null].filter(Boolean).join(", ");
  const head = `${STATUS[l.status]} ${TYPE[l.type]}, ${l.district}, Kuşadası.${facts ? " " + facts + "." : ""} ${formatPrice(l)}.`;
  const extra = (l.description ?? "").replace(/\s+/g, " ").trim();
  const text = extra ? `${head} ${extra}` : head;
  return text.length > 200 ? text.slice(0, 197).trimEnd() + "…" : text;
}

export function listingLd(l, siteUrl) {
  const url = `${siteUrl}/ilan/${l.id}/`;
  const about = { "@type": ABOUT_TYPE[l.type], address: { "@type": "PostalAddress", addressLocality: `${l.district}, Kuşadası`, addressRegion: "Aydın", addressCountry: "TR" } };
  const area = l.gross_m2 || l.net_m2;
  if (area) about.floorSize = { "@type": "QuantitativeValue", value: area, unitCode: "MTK" };
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: l.title,
    url,
    description: describe(l),
    datePosted: String(l.created_at).slice(0, 10),
    ...(l.photos?.length ? { image: l.photos } : {}),
    about,
    offers: {
      "@type": "Offer",
      price: l.price,
      priceCurrency: "TRY",
      availability: SOLD.includes(l.availability) ? "https://schema.org/SoldOut" : l.availability === "rezerve" ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock",
      seller: { "@id": `${siteUrl}/#agent` },
    },
  };
}

export function renderListing(template, l, siteUrl) {
  const url = `${siteUrl}/ilan/${l.id}/`;
  const title = `${l.title} | Yasemin Bakıcı Gayrimenkul`;
  const desc = describe(l);
  const image = l.photos?.[0] ?? `${siteUrl}/img/og-image.png`;
  const ld = JSON.stringify(listingLd(l, siteUrl)).replace(/</g, "\\u003c");
  const summary = `<h1>${esc(l.title)}</h1><p>${esc(`${STATUS[l.status]} ${TYPE[l.type]} · ${l.district}, Kuşadası`)}</p><p>${esc(formatPrice(l))}</p>`;

  const out = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">\n<link rel="canonical" href="${url}">`)
    .replace(/<meta name="robots" content="noindex">\n?/, "")
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(image)}">`)
    .replace(/<meta property="og:image:width" content="[^"]*">\n?/, "")
    .replace(/<meta property="og:image:height" content="[^"]*">\n?/, "")
    .replace(/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="${esc(l.title)}">`)
    .replace("</head>", `<script type="application/ld+json">${ld}</script>\n</head>`)
    .replace(/<p class="state" id="detail-state">[^<]*<\/p>/, `<div id="detail-state">${summary}</div>`);
  return out;
}

export function sitemap(siteUrl, listings) {
  const urls = [
    ...["/", "/ilanlar", "/hakkimda", "/iletisim"].map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`),
    ...listings.map((l) => `  <url><loc>${siteUrl}/ilan/${l.id}/</loc><lastmod>${String(l.updated_at).slice(0, 10)}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// The public API answers are cached for 60 s; a unique query value makes every pre-render read fresh data.
async function getJson(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}fresh=${Date.now()}`);
      if (res.ok) return await res.json();
      last = new Error(`${url} -> HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last;
}

async function main(root) {
  const config = JSON.parse(readFileSync(join(root, "js", "config.js"), "utf8").match(/=\s*(\{[\s\S]*\})\s*;?\s*$/)[1]);
  const { api, siteUrl } = config;
  const template = readFileSync(join(root, "ilan", "index.html"), "utf8");

  // Fail before touching any file if the API is unreachable, so a bad run never wipes existing pages.
  const { listings: summaries } = await getJson(`${api}/listings?limit=60`);
  const listings = [];
  for (const s of summaries) listings.push((await getJson(`${api}/listings/${s.id}`)).listing);

  const keep = new Set(listings.map((l) => String(l.id)));
  for (const name of readdirSync(join(root, "ilan"))) if (/^\d+$/.test(name) && !keep.has(name)) rmSync(join(root, "ilan", name), { recursive: true, force: true });
  for (const l of listings) {
    mkdirSync(join(root, "ilan", String(l.id)), { recursive: true });
    writeFileSync(join(root, "ilan", String(l.id), "index.html"), renderListing(template, l, siteUrl));
  }
  writeFileSync(join(root, "sitemap.xml"), sitemap(siteUrl, listings));
  console.log(`Pre-rendered ${listings.length} listing page(s) and sitemap.xml`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2] ?? ".").catch((e) => {
    console.error("prerender failed:", e.message);
    process.exit(1);
  });
}
