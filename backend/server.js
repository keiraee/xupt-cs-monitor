const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { TextDecoder } = require("util");

const app = express();
const PORT = 3001;
const BASE = "https://cs.xupt.edu.cn";
const REMOTE_PAGE_SIZE = 8;

app.use(cors());
app.use(express.json());

const CATEGORIES = [
  { key: "tzgg", name: "通知公告", url: "/index/tzgg.htm" },
  { key: "xyxw", name: "学院新闻", url: "/index/xyxw.htm" },
  { key: "xsky", name: "学术科研", url: "/kxyj/xsky.htm" },
  { key: "xshd", name: "学工动态", url: "/xsyd/xshd.htm" },
];

let catMeta = {};
let pageCache = {};
CATEGORIES.forEach((c) => {
  catMeta[c.key] = { totalPages: 1, lastUpdate: null };
  pageCache[c.key] = {};
});

// ══════════════════════════════════
//   Fetch helpers
// ══════════════════════════════════

async function fetchHTML(urlPath) {
  const url = urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Encoding": "identity",
    },
    timeout: 10000,
  });
  const buf = await resp.buffer();
  let html = buf.toString("utf8");
  if (html.includes("�") || html.includes("瀹") || html.includes("鍏")) {
    try { html = new TextDecoder("gbk").decode(buf); } catch { html = buf.toString("latin1"); }
  }
  return html;
}

function parsePage(html, catKey) {
  const $ = cheerio.load(html);
  const items = [];
  $(".article-item").each((_, el) => {
    const $el = $(el);
    const href = $el.find("a.article-item-link").attr("href") || "";
    const title = $el.find(".article-item-title").text().trim();
    const desc = $el.find(".article-item-desc").text().trim();
    const day = $el.find(".date-day").text().trim();
    const ym = $el.find(".date-ym").text().trim();
    const date = ym ? `${ym}.${day.padStart(2, "0")}` : "";
    const idMatch = href.match(/\/(\d+)\.htm$/);
    const id = idMatch ? idMatch[1] : href;
    let url;
    if (href.startsWith("http")) url = href;
    else if (href.startsWith("/")) url = `${BASE}${href}`;
    else url = new URL(href, `${BASE}/index/tzgg.htm`).href;
    if (title) items.push({ id, title, desc, date, url, category: catKey });
  });

  let totalPages = 1;
  $(".p_pages .p_no a, .p_last a").each((_, el) => {
    const n = parseInt($(el).text().trim(), 10);
    if (!isNaN(n) && n > totalPages) totalPages = n;
  });
  return { items, totalPages };
}

function remoteUrl(cat, remotePage, totalPages) {
  if (remotePage <= 1) return cat.url;
  const fileNum = totalPages - remotePage + 1;
  if (fileNum < 1) return null;
  return `${cat.url.replace(/\.htm$/, "")}/${fileNum}.htm`;
}

async function getRemotePage(catKey, remotePage) {
  const cached = pageCache[catKey][remotePage];
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached;
  const cat = CATEGORIES.find((c) => c.key === catKey);
  const url = remoteUrl(cat, remotePage, catMeta[catKey].totalPages);
  if (!url) return { items: [], ts: Date.now() };
  const html = await fetchHTML(url);
  const result = parsePage(html, catKey);
  if (result.totalPages > 1) catMeta[catKey].totalPages = result.totalPages;
  const entry = { items: result.items, ts: Date.now() };
  pageCache[catKey][remotePage] = entry;
  return entry;
}

// ══════════════════════════════════
//   Content cleaning
// ══════════════════════════════════

function cleanContent(rawHtml) {
  const $c = cheerio.load(rawHtml);
  $c("style").remove();
  $c("script").remove();
  $c("*").contents().each((_, node) => {
    if (node.type === "comment") $c(node).remove();
  });

  // remove old-site layout tables
  // Only match tables that are CLEARLY navigation/header/footer chrome
  // Use multiple signals to avoid false positives on content tables
  $c("table").each((_, tbl) => {
    const tHtml = $c(tbl).html() || "";
    // Must match at least 2 of these patterns to be considered chrome
    const signals = [
      tHtml.includes("dhl.jpg"),
      tHtml.includes("LibraryItem"),
      tHtml.includes("daohanglan"),
      tHtml.includes("footbg"),
      tHtml.includes("版权所有") && tHtml.includes("西安邮电大学") && !tHtml.includes("href="),
      tHtml.includes("首 页</a>") && tHtml.includes("学院概况</a>"),
    ];
    const matchCount = signals.filter(Boolean).length;
    // Also match if it has nav patterns (layout table with navigation links)
    const hasNav = tHtml.includes("首 页</a>") && tHtml.includes("学院概况</a>") && tHtml.includes("本科教育");
    if (matchCount >= 1 || hasNav) $c(tbl).remove();
  });

  // fix old IP address in ALL href/src attributes (222.24.19.3 → cs.xupt.edu.cn)
  $c("[href]").each((_, el) => {
    let href = $c(el).attr("href") || "";
    if (href.includes("222.24.19.3")) {
      href = href.replace(/http:\/\/222\.24\.19\.3(?::\d+)?/g, "https://cs.xupt.edu.cn");
      $c(el).attr("href", href);
    }
  });
  $c("[src]").each((_, el) => {
    let src = $c(el).attr("src") || "";
    if (src.includes("222.24.19.3")) {
      src = src.replace(/http:\/\/222\.24\.19\.3(?::\d+)?/g, "https://cs.xupt.edu.cn");
      $c(el).attr("src", src);
    }
  });

  // remove chrome images
  $c("img").each((_, img) => {
    const src = $c(img).attr("src") || "";
    if (/logo|banner|footbg|dhl/.test(src)) $c(img).remove();
  });

  // strip word cruft
  $c("[vsbhref]").removeAttr("vsbhref");
  $c("[vurl]").removeAttr("vurl");
  $c("[vheight]").removeAttr("vheight");
  $c("[vwidth]").removeAttr("vwidth");
  $c("[orisrc]").removeAttr("orisrc");

  // mark file attachments (links to PDF, DOC, ZIP, etc.)
  $c("a").each((_, a) => {
    const href = $c(a).attr("href") || "";
    if (/\.(pdf|doc|docx|xls|xlsx|zip|rar|ppt|pptx|txt|csv|gif)(\?|$)/i.test(href)) {
      let absHref = href;
      if (href.startsWith("/")) absHref = `${BASE}${href}`;
      else if (!href.startsWith("http")) absHref = new URL(href, `${BASE}/`).href;
      $c(a).attr("href", absHref);
      $c(a).addClass("file-attachment");
      $c(a).attr("data-download-url", absHref);
      // remove icon images inside attachment links (the original site uses gif icons)
      $c(a).find("img").remove();
    }
  });

  let cleaned = $c("body").length ? $c("body").html() : $c.html();
  cleaned = (cleaned || "").trim();

  // fix relative URLs
  cleaned = cleaned.replace(/src="\/__local/g, `src="${BASE}/__local`);
  cleaned = cleaned.replace(/src="\/_vsl/g, `src="${BASE}/_vsl`);
  cleaned = cleaned.replace(/srcset="\/__local/g, `srcset="${BASE}/__local`);
  cleaned = cleaned.replace(/href="\/__local/g, `href="${BASE}/__local`);
  cleaned = cleaned.replace(/href="\/info/g, `href="${BASE}/info`);
  cleaned = cleaned.replace(/href="\/_vsl/g, `href="${BASE}/_vsl`);

  return cleaned || "<p>暂无内容</p>";
}

// ══════════════════════════════════
//   Init
// ══════════════════════════════════

async function init() {
  console.log("[INIT] Discovering categories...");
  for (const cat of CATEGORIES) {
    try {
      const html = await fetchHTML(cat.url);
      const { items, totalPages } = parsePage(html, cat.key);
      catMeta[cat.key].totalPages = totalPages;
      catMeta[cat.key].lastUpdate = new Date().toISOString();
      pageCache[cat.key][1] = { items, ts: Date.now() };
      console.log(`  ${cat.name}: ${totalPages} pages (~${totalPages * REMOTE_PAGE_SIZE} items)`);
    } catch (err) {
      console.error(`  ${cat.key} failed: ${err.message}`);
    }
  }
}

// ══════════════════════════════════
//   API Routes
// ══════════════════════════════════

app.get("/api/categories", (req, res) => {
  res.json({
    categories: CATEGORIES.map((c) => ({
      key: c.key,
      name: c.name,
      totalItems: catMeta[c.key].totalPages * REMOTE_PAGE_SIZE,
      remotePages: catMeta[c.key].totalPages,
      lastUpdate: catMeta[c.key].lastUpdate,
    })),
  });
});

app.get("/api/notices", async (req, res) => {
  const { category = "tzgg", page = 1, size = 20 } = req.query;
  const cat = CATEGORIES.find((c) => c.key === category);
  if (!cat) return res.status(400).json({ error: "未知分类" });

  const p = Number(page);
  const s = Number(size);
  const meta = catMeta[category];
  const totalItems = meta.totalPages * REMOTE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalItems / s));

  const startItem = (p - 1) * s;
  const endItem = p * s;
  const startRemote = Math.floor(startItem / REMOTE_PAGE_SIZE) + 1;
  const endRemote = Math.min(meta.totalPages, Math.floor((endItem - 1) / REMOTE_PAGE_SIZE) + 1);

  try {
    const promises = [];
    for (let rp = startRemote; rp <= endRemote; rp++) {
      promises.push(getRemotePage(category, rp));
    }
    const results = await Promise.all(promises);
    const allItems = [];
    results.forEach((r) => allItems.push(...r.items));
    const localOffset = startItem - (startRemote - 1) * REMOTE_PAGE_SIZE;
    const slice = allItems.slice(localOffset, localOffset + s);

    res.json({ category, categoryName: cat.name, page: p, size: s, totalItems, totalPages, data: slice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/notices/:catKey/:id", async (req, res) => {
  const { catKey, id } = req.params;
  let notice = null;
  for (const rp of Object.keys(pageCache[catKey] || {})) {
    const found = pageCache[catKey][rp].items.find((n) => n.id === id);
    if (found) { notice = found; break; }
  }
  if (!notice) return res.status(404).json({ error: "未找到" });

  if (!notice.contentHtml) {
    try {
      const html = await fetchHTML(notice.url);
      const $ = cheerio.load(html);
      const raw = $(".v_news_content").html() || $(".content").html() || $("article").html() || "";
      notice.contentHtml = cleanContent(raw);
    } catch {
      notice.contentHtml = "<p>加载失败</p>";
    }
  }
  res.json(notice);
});

app.post("/api/refresh", async (req, res) => {
  CATEGORIES.forEach((c) => { pageCache[c.key] = {}; });
  res.json({ status: "started" });
  await init();
});

// GET /api/download?url=...&name=...
// Proxy download with correct Content-Disposition filename
app.get("/api/download", async (req, res) => {
  const { url, name } = req.query;
  if (!url) return res.status(400).json({ error: "missing url" });

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      timeout: 30000,
    });

    if (!resp.ok) return res.status(resp.status).json({ error: "fetch failed" });

    // forward content type
    const contentType = resp.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);

    const contentLength = resp.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    // set download filename
    const filename = name || "download";
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    // pipe the response
    resp.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════
(async () => { await init(); })();

app.listen(PORT, () => {
  console.log(`[RUN] Backend → http://localhost:${PORT}`);
});
