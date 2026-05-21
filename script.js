import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const contentFirebaseConfig = {
  apiKey: "AIzaSyBF7dI6cLaec1hMO6sRYyKTbgmhptq0OEM",
  authDomain: "orbita-727cd.firebaseapp.com",
  projectId: "orbita-727cd",
  storageBucket: "orbita-727cd.firebasestorage.app",
  messagingSenderId: "823174769372",
  appId: "1:823174769372:web:c0b62f90917c035dbb6219"
};

const statsFirebaseConfig = {
  apiKey: "AIzaSyBxChWYQYJIfdzCe4HL51x8oGixcvLAxJw",
  authDomain: "drkprty-654ec.firebaseapp.com",
  projectId: "drkprty-654ec",
  storageBucket: "drkprty-654ec.firebasestorage.app",
  messagingSenderId: "17948730429",
  appId: "1:17948730429:web:917b9d10f70439c54c3654",
  measurementId: "G-8TZ70MZQFM"
};

window.DRKPRTY_BUILD = "v43-home-featured-mode";
const DRKPRTY_SITE_URL = "https://drkprty.uk";
const DRKPRTY_DEFAULT_IMAGE = `${DRKPRTY_SITE_URL}/assets/drkprty-logo.png`;
function drkprtyUrl(path = "/"){
  if(!path) return DRKPRTY_SITE_URL + "/";
  if(/^https?:\/\//i.test(path)) return path;
  const clean = String(path).replace(/^\/+/, "");
  return `${DRKPRTY_SITE_URL}/${clean}`;
}
function absoluteImage(url){
  if(!url) return DRKPRTY_DEFAULT_IMAGE;
  if(/^https?:\/\//i.test(url)) return url;
  return drkprtyUrl(url);
}
const contentApp = initializeApp(contentFirebaseConfig, "drkprty-content");
const statsApp = initializeApp(statsFirebaseConfig, "drkprty-stats");
const db = getFirestore(contentApp);
const statsDb = getFirestore(statsApp);


function truthyPublished(value){
  return value === true || value === "true" || value === 1 || value === "1";
}

function falseyPublished(value){
  return value === false || value === "false" || value === 0 || value === "0";
}

function parsePublishTime(value){
  if(!value) return null;
  if(typeof value === "object" && typeof value.toDate === "function") return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isArticlePublic(article){
  const publishTime = parsePublishTime(article.publishAt);
  const isDue = !publishTime || publishTime <= Date.now();

  if(publishTime && publishTime > Date.now()) return false;
  if(falseyPublished(article.published) && !isDue) return false;
  if(falseyPublished(article.published) && publishTime && isDue) return true;

  return !falseyPublished(article.published) && isDue;
}



function normalizeBool(value){
  if(value === true || value === "true" || value === 1 || value === "1" || value === "published" || value === "Publicado") return true;
  if(value === false || value === "false" || value === 0 || value === "0" || value === "draft" || value === "No publicado") return false;
  return null;
}

function isArticleVisibleOnPublic(article){
  const publishTime = parsePublishTime(article.publishAt);

  // Scheduled articles must stay hidden until their publish date.
  if(publishTime && publishTime > Date.now()) return false;

  const published = normalizeBool(article.published);
  const status = normalizeBool(article.status);

  // Manual unpublish must always win, even if publishAt is in the past.
  if(published === false) return false;
  if(status === false) return false;

  return true;
}

function articleTime(a){
  if(a.publishAt) return new Date(a.publishAt).getTime() || 0;
  if(a.createdAt) return new Date(a.createdAt).getTime() || 0;
  return 0;
}

async function loadFirebaseContent(){
  const empty = { docs: [] };

  try{
    const [articlesResult, eventsResult, heroResult, statsResult] = await Promise.allSettled([
      getDocs(collection(db, "articles")),
      getDocs(collection(db, "events")),
      getDoc(doc(db, "siteConfig", "hero")),
      getDocs(collection(statsDb, "articleStats"))
    ]);

    if(articlesResult.status !== "fulfilled"){
      throw articlesResult.reason;
    }

    const articlesSnap = articlesResult.value;
    const eventsSnap = eventsResult.status === "fulfilled" ? eventsResult.value : empty;
    const heroSnap = heroResult.status === "fulfilled" ? heroResult.value : null;
    const statsSnap = statsResult.status === "fulfilled" ? statsResult.value : empty;

    if(eventsResult.status !== "fulfilled") console.warn("DRKPRTY events load failed", eventsResult.reason);
    if(heroResult.status !== "fulfilled") console.warn("DRKPRTY hero config load failed", heroResult.reason);
    if(statsResult.status !== "fulfilled") console.warn("DRKPRTY articleStats load failed; continuing without view counts", statsResult.reason);

    const statsById = Object.fromEntries(statsSnap.docs.map(d => [d.id, d.data()]));
    window.ORBITA_ARTICLE_STATS = statsById;
    const rawArticles = articlesSnap.docs.map(d => {
      const safeId = safeStatsId(d.id);
      const data = d.data();
      const stats = statsById[safeId] || statsById[d.id] || {};
      return {
        id:d.id,
        ...data,
        views:Number(stats.views || data.views || 0),
        dailyViews:(stats.dailyViews && typeof stats.dailyViews === "object") ? stats.dailyViews : {}
      };
    });

    window.ORBITA_ARTICLES = rawArticles
      .filter(isArticleVisibleOnPublic)
      .sort((a,b) => articleTime(b) - articleTime(a));

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    window.ORBITA_EVENTS = eventsSnap.docs.map(d => ({ id:d.id, ...d.data() }))
      .filter(e => !e.sortDate || Number(e.sortDate) >= Number(todayStart))
      .sort((a,b) => Number(a.sortDate || 0) - Number(b.sortDate || 0));

    window.ORBITA_HERO = heroSnap && heroSnap.exists() ? heroSnap.data() : null;

    window.DRKPRTY_DEBUG_DATA = {
      rawArticles: rawArticles.length,
      visibleArticles: window.ORBITA_ARTICLES.length,
      statsDocs: statsSnap.docs.length,
      statsLoaded: statsResult.status === "fulfilled",
      rawArticlesSample: rawArticles.slice(0,5)
    };
    console.info("DRKPRTY Firebase loaded", {
      articles: window.ORBITA_ARTICLES.length,
      events: window.ORBITA_EVENTS.length,
      hero: window.ORBITA_HERO,
      statsLoaded: statsResult.status === "fulfilled"
    });
  }catch(err){
    window.ORBITA_ARTICLES = [];
    window.ORBITA_EVENTS = [];
    window.ORBITA_HERO = null;
    window.ORBITA_ARTICLE_STATS = {};
    console.error("DRKPRTY Firebase failed", err);
  }
}



function setMetaAttr(selector, attr, value){
  let el = document.querySelector(selector);
  if(!el){
    el = document.createElement("meta");
    if(selector.includes("property=")){
      const prop = selector.match(/property="([^"]+)"/)?.[1];
      if(prop) el.setAttribute("property", prop);
    }else{
      const name = selector.match(/name="([^"]+)"/)?.[1];
      if(name) el.setAttribute("name", name);
    }
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value || "");
}

function setCanonical(url){
  let link = document.querySelector('link[rel="canonical"]');
  if(!link){
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

function setDynamicSEO(article){
  if(!article) return;

  const url = drkprtyUrl(`article.html?id=${encodeURIComponent(article.id)}`);
  const title = `${article.title} — DRKPRTY`;
  const description = (article.excerpt || "Lee la nota completa en DRKPRTY.").slice(0, 160);
  const image = absoluteImage(article.image);

  document.title = title;
  setCanonical(url);

  setMetaAttr('meta[name="description"]', "content", description);
  setMetaAttr('meta[name="robots"]', "content", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  setMetaAttr('meta[name="author"]', "content", article.author || "DRKPRTY");
  setMetaAttr('meta[property="og:type"]', "content", "article");
  setMetaAttr('meta[property="og:title"]', "content", title);
  setMetaAttr('meta[property="og:description"]', "content", description);
  setMetaAttr('meta[property="og:url"]', "content", url);
  setMetaAttr('meta[property="og:image"]', "content", image);
  setMetaAttr('meta[property="og:image:alt"]', "content", article.title);
  setMetaAttr('meta[name="twitter:card"]', "content", "summary_large_image");
  setMetaAttr('meta[name="twitter:title"]', "content", title);
  setMetaAttr('meta[name="twitter:description"]', "content", description);
  setMetaAttr('meta[name="twitter:image"]', "content", image);

  const oldSchema = document.getElementById("drkprty-article-schema");
  if(oldSchema) oldSchema.remove();

  const schema = document.createElement("script");
  schema.type = "application/ld+json";
  schema.id = "drkprty-article-schema";
  schema.textContent = JSON.stringify({
    "@context":"https://schema.org",
    "@type":"NewsArticle",
    "headline":article.title,
    "description":description,
    "image":image ? [image] : [],
    "datePublished":article.publishAt || article.createdAt || new Date().toISOString(),
    "dateModified":article.updatedAt || article.createdAt || article.publishAt || new Date().toISOString(),
    "author":{"@type":"Person","name":article.author || "DRKPRTY"},
    "publisher":{
      "@type":"Organization",
      "name":"DRKPRTY",
      "logo":{
        "@type":"ImageObject",
        "url":DRKPRTY_DEFAULT_IMAGE
      }
    },
    "mainEntityOfPage":{"@type":"WebPage","@id":url}
  });
  document.head.appendChild(schema);
}

function setListingSEO(){
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const tag = params.get("tag");

  if(!window.location.pathname.includes("news.html")) return;

  let title = "News — DRKPRTY";
  let description = "Todas las noticias de música, cultura, lanzamientos, festivales y escenas emergentes en DRKPRTY.";

  if(category === "RESEÑA"){
    title = "Reviews — DRKPRTY";
    description = "Reseñas de discos, canciones, lanzamientos y cultura musical en DRKPRTY.";
  }

  if(category === "ENTREVISTA"){
    title = "Interviews — DRKPRTY";
    description = "Entrevistas con artistas, escenas emergentes y voces de la cultura musical en DRKPRTY.";
  }

  if(tag){
    title = `${tag} — DRKPRTY`;
    description = `Archivo de artículos relacionados con ${tag} en DRKPRTY.`;
  }

  const qs = window.location.search || "";
  setCanonical(drkprtyUrl(`news.html${qs}`));
  setMetaAttr('meta[property="og:url"]', "content", drkprtyUrl(`news.html${qs}`));
  setMetaAttr('meta[property="og:image"]', "content", DRKPRTY_DEFAULT_IMAGE);
  setMetaAttr('meta[name="twitter:image"]', "content", DRKPRTY_DEFAULT_IMAGE);

  document.title = title;
  setMetaAttr('meta[name="description"]', "content", description);
  setMetaAttr('meta[property="og:title"]', "content", title);
  setMetaAttr('meta[property="og:description"]', "content", description);
  setMetaAttr('meta[name="twitter:title"]', "content", title);
  setMetaAttr('meta[name="twitter:description"]', "content", description);
}


function setStaticPageSEO(){
  const path = window.location.pathname.split("/").pop() || "index.html";
  const map = {
    "index.html": { title:"DRKPRTY — Music, Culture & Nightlife", desc:"DRKPRTY es un medio independiente de música, cultura, vida nocturna, reseñas, entrevistas, festivales y escenas emergentes.", url:drkprtyUrl("") },
    "events.html": { title:"Eventos — DRKPRTY", desc:"Agenda de conciertos, festivales y eventos musicales seleccionados por DRKPRTY.", url:drkprtyUrl("events.html") },
    "about.html": { title:"About — DRKPRTY", desc:"Conoce DRKPRTY: un medio independiente de música, cultura visual, internet, escenas emergentes y vida nocturna.", url:drkprtyUrl("about.html") }
  };
  const item = map[path];
  if(!item || path === "news.html" || path === "article.html") return;
  document.title = item.title;
  setCanonical(item.url);
  setMetaAttr('meta[name="description"]', "content", item.desc);
  setMetaAttr('meta[property="og:title"]', "content", item.title);
  setMetaAttr('meta[property="og:description"]', "content", item.desc);
  setMetaAttr('meta[property="og:url"]', "content", item.url);
  setMetaAttr('meta[property="og:image"]', "content", DRKPRTY_DEFAULT_IMAGE);
  setMetaAttr('meta[name="twitter:title"]', "content", item.title);
  setMetaAttr('meta[name="twitter:description"]', "content", item.desc);
  setMetaAttr('meta[name="twitter:image"]', "content", DRKPRTY_DEFAULT_IMAGE);
}

function enhanceMediaForPerformance(){
  document.querySelectorAll("img").forEach((img, index) => {
    if(!img.hasAttribute("decoding")) img.setAttribute("decoding", "async");
    if(index > 2 && !img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
  });
}

function getArticles(){
  return Array.isArray(window.ORBITA_ARTICLES) ? window.ORBITA_ARTICLES : [];
}

function getEvents(){
  return Array.isArray(window.ORBITA_EVENTS) ? window.ORBITA_EVENTS : [];
}

function getHeroConfig(){
  return window.ORBITA_HERO || null;
}

const TAGS = [
  { label:"#MÚSICA", emoji:"😎" },
  { label:"#FESTIVALES", emoji:"🔥" },
  { label:"#NOTICIAS", emoji:"🎧" },
  { label:"#LANZAMIENTOS", emoji:"💿" },
  { label:"#ENTREVISTAS", emoji:"📣" },
  { label:"#R&B", emoji:"⚡" },
  { label:"#INDIE", emoji:"🎸" },
  { label:"#HIPHOP", emoji:"🎙️" },
  { label:"#ELECTRÓNICA", emoji:"🎛️" },
  { label:"#RESEÑAS", emoji:"⭐" },
  { label:"#AGENDA", emoji:"🗓️" },
  { label:"#EN VIVO", emoji:"🪩" }
];

function toggleMenu(){
  document.getElementById('overlay')?.classList.toggle('active');
}

window.toggleMenu = toggleMenu;

function setupTheme(){
  const saved = localStorage.getItem("orbita-theme");
  const hour = new Date().getHours();
  const autoTheme = hour >= 19 || hour < 7 ? "dark" : "light";
  const theme = saved || autoTheme;

  document.body.classList.toggle("dark", theme === "dark");

  const btn = document.getElementById("themeToggle");
  if(btn){
    btn.textContent = theme === "dark" ? "☀" : "☾";
    btn.addEventListener("click", () => {
      const isDark = document.body.classList.toggle("dark");
      localStorage.setItem("orbita-theme", isDark ? "dark" : "light");
      btn.textContent = isDark ? "☀" : "☾";
    });
  }
}

function getCurrentFilter(){
  return new URLSearchParams(window.location.search).get("tag");
}

function getCurrentCategory(){
  return new URLSearchParams(window.location.search).get("category");
}

function getCurrentSearchQuery(){
  return new URLSearchParams(window.location.search).get("search");
}

function getArchiveTitle(){
  const category = getCurrentCategory();
  if(category === "RESEÑA") return "TODAS LAS REVIEWS";
  if(category === "ENTREVISTA") return "TODAS LAS INTERVIEWS";
  return "TODAS LAS NEWS";
}

function updateArchiveTitle(){
  const title = document.getElementById("archiveTitle");
  if(title) title.textContent = getArchiveTitle();
}

function renderHashtags(){
  const track = document.getElementById("hashtagTrack");
  if(!track) return;

  const current = getCurrentFilter();
  const repeatCount = 4;
  const fullList = Array.from({ length: repeatCount }, () => TAGS).flat();

  track.dataset.repeat = String(repeatCount);
  track.innerHTML = fullList.map(tag => {
    const active = current === tag.label ? "active" : "";
    const href = `news.html?tag=${encodeURIComponent(tag.label)}#tags`;

    return `<a class="hashtag-pill ${active}" href="${href}" data-tag="${tag.label}" aria-label="Ver artículos de ${tag.label}">
      <span class="emoji">${tag.emoji}</span><span>${tag.label}</span>
    </a>`;
  }).join("");
}

function safeNewsletterId(email){
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[\/]+/g, "-")
    .replace(/[^a-z0-9@._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function isValidNewsletterEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function saveNewsletterEmail(email){
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const safeId = safeNewsletterId(normalizedEmail);
  if(!safeId || !isValidNewsletterEmail(normalizedEmail)){
    throw new Error("Email inválido");
  }

  const now = new Date().toISOString();
  const ref = doc(statsDb, "newsletterSubscribers", safeId);
  await setDoc(ref, {
    email: normalizedEmail,
    status: "active",
    source: window.location.href,
    subscribedAt: now,
    updatedAt: now
  }, { merge: true });
}


function escapeAttr(value){
  return String(value || "").replace(/"/g, "&quot;");
}

function renderArticles(){
  const grid = document.getElementById("articleGrid");
  if(!grid) return;

  const articles = getArticles();
  const current = getCurrentFilter();
  const category = getCurrentCategory();
  const isNewsPage = window.location.pathname.includes("news.html");

  let filtered = articles;
  const search = getCurrentSearchQuery();
  if(current) filtered = filtered.filter(a => Array.isArray(a.tags) && a.tags.includes(current));
  if(category) filtered = filtered.filter(a => String(a.category || "").toUpperCase() === category.toUpperCase());
  if(search){
    const q = search.toLowerCase();
    filtered = filtered.filter(a => `${a.title || ""} ${a.excerpt || ""} ${a.category || ""} ${(a.tags || []).join(" ")}`.toLowerCase().includes(q));
  }

  if(!isNewsPage){
    // New Topics on the main page must always show the latest published articles.
    // Do not use siteConfig.hero.topics because that document can keep stale IDs.
    filtered = articles.slice(0, 10);
  }

  console.info("DRKPRTY renderArticles", {
    isNewsPage,
    totalArticles: articles.length,
    renderedArticles: filtered.length,
    firstIds: filtered.slice(0,5).map(a => a.id)
  });

  grid.innerHTML = filtered.map((article, index) => `
    <a class="topic-card article-link news-style-card ${isNewsPage ? "archive-card" : ""}" href="article.html?id=${article.id}" style="--cardimg:url('${article.image || ""}')">
      ${isNewsPage ? "" : `<div class="number">${String(index + 1).padStart(2,"0")}</div>`}
      <div class="content">
        <span class="tag-mini">${article.category || "NOTICIA"}</span>
        <h3>${article.title || "Sin título"}</h3>
        <p>${article.excerpt || ""}</p>
        <small>${article.date || ""}</small>
      </div>
      <button>LEER →</button>
    </a>
  `).join("");

  const empty = document.getElementById("emptyState");
  if(empty) empty.style.display = filtered.length ? "none" : "block";
}



function updateViewDebug(message){
  const params = new URLSearchParams(window.location.search);
  if(params.get("debugViews") !== "1") return;
  let box = document.getElementById("drkprtyViewDebug");
  if(!box){
    box = document.createElement("div");
    box.id = "drkprtyViewDebug";
    box.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;padding:12px 14px;border:1px solid currentColor;background:var(--bg,#fff);color:var(--fg,#111);font:12px/1.4 monospace;box-shadow:0 10px 30px rgba(0,0,0,.18);max-height:38vh;overflow:auto;";
    document.body.appendChild(box);
  }
  box.innerHTML = `${new Date().toLocaleTimeString()} · ${message}<br>` + box.innerHTML;
}

function safeStatsId(articleId){
  let id = String(articleId || "")
    .trim()
    .replace(/[\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);

  // Firestore reserva IDs con formato __algo__.
  // Evitamos que pruebas o slugs raros caigan en ese patrón.
  if(/^__.*__$/.test(id)) id = id.replace(/^__+/, "").replace(/__+$/, "") || `article-${Date.now()}`;
  return id;
}


function drkprtyDateKey(date = new Date()){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function incrementStatsDocument(ref, createData = {}){
  const snap = await getDoc(ref);
  const stamp = new Date().toISOString();
  if(snap.exists()){
    const currentViews = Number(snap.data()?.views || 0);
    await updateDoc(ref, { ...createData, updatedAt: stamp, views: currentViews + 1 });
    return currentViews + 1;
  }
  await setDoc(ref, { ...createData, updatedAt: stamp, views: 1 });
  return 1;
}

async function incrementArticleStatsDocument(ref, articleId, dateKey){
  const snap = await getDoc(ref);
  const stamp = new Date().toISOString();

  if(snap.exists()){
    const data = snap.data() || {};
    const currentViews = Number(data.views || 0);
    const dailyViews = (data.dailyViews && typeof data.dailyViews === "object") ? {...data.dailyViews} : {};
    dailyViews[dateKey] = Number(dailyViews[dateKey] || 0) + 1;

    await updateDoc(ref, {
      articleId,
      views: currentViews + 1,
      dailyViews,
      updatedAt: stamp
    });
    return currentViews + 1;
  }

  await setDoc(ref, {
    articleId,
    views: 1,
    dailyViews: { [dateKey]: 1 },
    updatedAt: stamp
  });
  return 1;
}

async function countArticleView(articleId){
  const safeId = safeStatsId(articleId);

  if(!safeId){
    updateViewDebug("No articleId. No se puede contar view.");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const forceDebugCount = params.get("debugViews") === "1";
  const storageKey = `drkprty-viewed-v2-${safeId}`;
  const now = Date.now();
  const lastView = Number(localStorage.getItem(storageKey) || 0);
  const oneDay = 24 * 60 * 60 * 1000;
  const todayKey = drkprtyDateKey();
  const ref = doc(statsDb, "articleStats", safeId);
  const dailyRef = doc(statsDb, "articleViewsDaily", `${safeId}_${todayKey}`);

  updateViewDebug(`Article ID detectado: ${articleId}`);
  updateViewDebug(`Stats doc: articleStats/${safeId}`);
  updateViewDebug(`Daily doc: articleViewsDaily/${safeId}_${todayKey}`);

  // Count one visit per device every 24 hours. In debug mode, force the write.
  if(!forceDebugCount && lastView && now - lastView < oneDay){
    console.info("DRKPRTY view counter: already counted in last 24h", safeId);
    updateViewDebug("Ya estaba contada en este dispositivo durante las últimas 24h. Usa ?debugViews=1 para forzar prueba.");
    return;
  }

  try{
    updateViewDebug("Guardando stats histórico...");
    const savedViews = await incrementArticleStatsDocument(ref, safeId, todayKey);

    updateViewDebug("Guardando stats diarios...");
    await incrementStatsDocument(dailyRef, { articleId:safeId, date:todayKey });
    localStorage.setItem(storageKey, String(now));
    console.info("DRKPRTY view counted", safeId, savedViews);
    updateViewDebug(`OK: view guardada en Firestore. Total: ${savedViews}`);
  }catch(err){
    console.warn("DRKPRTY view counter failed", safeId, err);
    updateViewDebug(`ERROR Firebase: ${err.code || err.name || "unknown"} · ${err.message || err}`);
  }
}

window.drkprtyTestViewWrite = async function(articleId = "manual-test"){
  await countArticleView(articleId);
};

function shortCodeDate(article){
  const raw = article?.publishAt || article?.date || article?.createdAt || new Date().toISOString();
  const parsed = raw instanceof Date ? raw : new Date(raw);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}`;
}

function firstMeaningfulTitleToken(title){
  const ignored = new Set(["el","la","los","las","un","una","unos","unas","de","del","y","en","con","para","por","the","a","an","of","and","to","on","at","new","nuevo","nueva"]);
  return String(title || "drkprty")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .find(word => !ignored.has(word)) || "drkprty";
}

function buildArticleShortCode(article){
  const baseSource = Array.isArray(article?.tags) && article.tags.length ? article.tags[0] : firstMeaningfulTitleToken(article?.title);
  const base = String(baseSource || "drkprty")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18) || "drkprty";
  return `${base}${shortCodeDate(article)}`;
}

function getArticleShortCode(article){
  return article?.shortCode || buildArticleShortCode(article);
}

function getArticleShareUrl(article){
  if(article?.shortUrl) return article.shortUrl;
  const shortCode = getArticleShortCode(article);
  if(shortCode) return `${DRKPRTY_SITE_URL}/go/${encodeURIComponent(shortCode)}/`;
  if(article?.seoUrl) return article.seoUrl;
  const url = new URL(`${DRKPRTY_SITE_URL}/article.html`);
  if(article?.id) url.searchParams.set("id", article.id);
  return url.toString();
}

function buildArticleShareText(article){
  const title = (article?.title || "DRKPRTY").trim();
  const excerpt = (article?.excerpt || "Music, culture & nightlife.").trim();
  const cleanExcerpt = excerpt.length > 150 ? `${excerpt.slice(0, 147).trim()}...` : excerpt;
  return `${title} — ${cleanExcerpt}`;
}

function renderArticleBody(article){
  const body = Array.isArray(article.body) ? article.body : [];
  const firstBlock = body.slice(0, 3);
  const secondBlock = body.slice(3);

  const quote = article.quote
    ? `<blockquote class="article-highlight-quote">“${article.quote.replace(/^“|”$/g, "")}”</blockquote>`
    : "";

  const spotify = article.spotifyEmbed
    ? `<div class="spotify-embed-wrap">
        <h3>ESCUCHA</h3>
        <iframe
          style="border-radius:18px"
          src="${article.spotifyEmbed}"
          width="100%"
          height="352"
          frameborder="0"
          allowfullscreen=""
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy">
        </iframe>
      </div>`
    : "";

  return `
    ${firstBlock.map(p => `<p>${p}</p>`).join("")}
    ${quote}
    ${secondBlock.map(p => `<p>${p}</p>`).join("")}
    ${spotify}
  `;
}


function renderArticlePage(){
  const shell = document.getElementById("articleShell");
  if(!shell) return;

  const articles = getArticles();
  const id = new URLSearchParams(window.location.search).get("id");
  const article = articles.find(a => a.id === id) || articles[0];

  if(!article){
    shell.innerHTML = `<div class="article-main"><h1>Artículo no encontrado</h1><p class="desc">No hay artículos publicados disponibles todavía.</p></div>`;
    return;
  }

  setDynamicSEO(article);
  countArticleView(article.id);

  const related = articles.filter(a => a.id !== article.id).slice(0,6);
  const shareUrl = getArticleShareUrl(article);
  const shareText = buildArticleShareText(article);
  const xShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const waShareUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;

  shell.innerHTML = `
    <div class="article-main">
      <span class="article-kicker">${article.category || "NOTICIA"}</span>
      <h1>${article.title || ""}</h1>
      <p class="desc">${article.excerpt || ""}</p>
      <div class="article-meta">
        <span>☻ POR ${article.author || "DRKPRTY"}</span>
        <span>${article.date || ""}</span>
        <span>${article.read || "3 MIN DE LECTURA"}</span>
      </div>

      <img class="article-image" src="${article.image || ""}" alt="${article.title || ""}" fetchpriority="high" decoding="async">

      <div class="article-body">
        ${renderArticleBody(article)}
      </div>
    </div>

    <aside class="article-sidebar">
      <h3>COMPARTIR</h3>
      <div class="share article-share-actions">
        <a href="#" data-copy-link class="share-btn share-btn-copy" title="Copiar link" aria-label="Copiar link">↗</a>
        <a href="${xShareUrl}" target="_blank" rel="noopener noreferrer" data-share-x class="share-btn share-btn-x" title="Compartir en X" aria-label="Compartir en X">X</a>
        <a href="${fbShareUrl}" target="_blank" rel="noopener noreferrer" data-share-facebook class="share-btn share-btn-facebook" title="Compartir en Facebook" aria-label="Compartir en Facebook">f</a>
        <a href="${waShareUrl}" target="_blank" rel="noopener noreferrer" data-share-whatsapp class="share-btn share-btn-whatsapp" title="Compartir en WhatsApp" aria-label="Compartir en WhatsApp">WA</a>
      </div>

      <h3>TAGS</h3>
      <div class="sidebar-tags">
        ${(article.tags || []).map(t => `<a href="news.html?tag=${encodeURIComponent(t)}#tags">${t}</a>`).join("")}
      </div>

      <h3>LO MÁS LEÍDO</h3>
      <div class="related">
        ${related.map(r => `
          <a href="article.html?id=${r.id}">
            <img src="${r.image || ""}" alt="${r.title || ""}" loading="lazy" decoding="async">
            <div>
              <h4>${r.title || ""}</h4>
              <p>${r.date || ""}</p>
            </div>
          </a>
        `).join("")}
      </div>
    </aside>
  `;
}

function dateKeyLocal(date = new Date()){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function lastNDayKeys(days){
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const keys = new Set();
  for(let i = 0; i < days; i++){
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    keys.add(dateKeyLocal(d));
  }
  return keys;
}

function articleViewsLast7Public(article){
  const stats = window.ORBITA_ARTICLE_STATS || {};
  const safeId = safeStatsId(article?.id);
  const data = stats[safeId] || stats[article?.id] || article || {};
  const daily = data.dailyViews && typeof data.dailyViews === "object" ? data.dailyViews : {};
  const allowed = lastNDayKeys(7);
  let total = 0;
  Object.entries(daily).forEach(([dateKey, views]) => {
    if(allowed.has(dateKey)) total += Number(views || 0);
  });
  return total;
}

function topViewedLast7Public(articles){
  return [...articles]
    .map(article => ({ article, views: articleViewsLast7Public(article) }))
    .filter(row => row.views > 0)
    .sort((a,b) => b.views - a.views || articleTime(b.article) - articleTime(a.article))
    .map(row => row.article);
}

function renderFeatured(){
  const track = document.getElementById("featuredTrack");
  if(!track) return;

  const articles = getArticles();
  const hero = getHeroConfig();
  const featuredIds = hero?.featured || [];
  const featuredCount = Math.min(5, Math.max(3, Number(hero?.featuredCount || featuredIds.length || 3)));
  let selected = featuredIds.map(id => articles.find(a => a.id === id)).filter(Boolean);

  // Auto mode respects manual picks as priority/pinned slots.
  // Empty slots are filled daily with either latest articles or the top viewed
  // articles from the last 7 days, depending on the Home setting.
  if(hero?.autoFeatured || selected.length < featuredCount){
    const used = new Set(selected.map(a => a.id));
    const latestPool = articles.filter(a => !used.has(a.id));
    const autoPool = hero?.featuredMode === "top7"
      ? [...topViewedLast7Public(articles).slice(0, 3), ...articles]
      : articles;
    const fillPool = autoPool.filter(a => !used.has(a.id));
    selected = selected.concat(fillPool.slice(0, featuredCount - selected.length));
    if(selected.length < featuredCount){
      const usedAgain = new Set(selected.map(a => a.id));
      selected = selected.concat(latestPool.filter(a => !usedAgain.has(a.id)).slice(0, featuredCount - selected.length));
    }
  }

  selected = selected.slice(0, featuredCount);

  console.info("DRKPRTY renderFeatured", {
    totalArticles: articles.length,
    selected: selected.map(a => a.id),
    autoFeatured: !!hero?.autoFeatured,
    featuredMode: hero?.featuredMode || "latest"
  });

  if(!selected.length){
    track.innerHTML = `
      <div class="featured-slide active empty-featured">
        <span class="pickup">DRKPRTY</span>
        <p class="tiny">SIN DESTACADAS</p>
        <h2>AGREGA ARTÍCULOS DESDE EL ADMINISTRADOR</h2>
        <p class="desc">Cuando selecciones destacadas en el CMS, aparecerán aquí automáticamente.</p>
      </div>
    `;
    return;
  }

  track.innerHTML = selected.map((article, index) => `
    <a class="featured-slide ${index === 0 ? "active" : ""}" href="article.html?id=${article.id}" style="--bgimg:url('${article.image || ""}')">
      <span class="pickup">PICKUP 🚀</span>
      <p class="tiny">${String(index + 1).padStart(2,"0")} · ${article.category || "NOTICIA"}</p>
      <h2>${article.title || ""}</h2>
      <p class="desc">${article.excerpt || ""}</p>
      <span class="read-btn">LEER ARTÍCULO →</span>
    </a>
  `).join("");
}

function getDailySeed(){
  const d = new Date();
  return Number(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`);
}

function seededRandom(seed){
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getDailyRandomReviewIds(){
  const reviews = getArticles().filter(a => String(a.category || "").toUpperCase() === "RESEÑA");
  const seed = getDailySeed();

  return reviews
    .map((article, index) => ({
      article,
      score: seededRandom(seed + index + article.id.length)
    }))
    .sort((a,b) => a.score - b.score)
    .slice(0, 5)
    .map(item => item.article.id);
}


function fitRotationTitle(){
  const title = document.getElementById("rotationTitle");
  if(!title) return;
  const len = (title.textContent || "").trim().length;
  title.classList.remove("rotation-title-medium", "rotation-title-small", "rotation-title-tiny");
  if(len > 86) title.classList.add("rotation-title-tiny");
  else if(len > 62) title.classList.add("rotation-title-small");
  else if(len > 42) title.classList.add("rotation-title-medium");
}

function setRotationCover(url){
  const cover = document.getElementById("rotationCover");
  if(!cover) return;
  cover.style.setProperty("--cover", `url("${url || ""}")`);
}

function renderRotation(){
  const selector = document.getElementById("rotationSelector");
  const title = document.getElementById("rotationTitle");
  const artist = document.getElementById("rotationArtist");
  const desc = document.getElementById("rotationDesc");
  const label = document.getElementById("rotationLabel");
  const read = document.getElementById("rotationRead");

  if(!selector) return;

  const articles = getArticles();
  const configuredIds = getHeroConfig()?.rotation || [];
  const dailyIds = configuredIds.length ? configuredIds : getDailyRandomReviewIds();

  const rotationArticles = dailyIds
    .map(id => articles.find(a => a.id === id))
    .filter(Boolean)
    .slice(0,5);

  selector.innerHTML = rotationArticles.map((a, i) => `
    <button type="button" class="${i === 0 ? "active" : ""}" data-title="${escapeAttr(a.title)}" data-artist="${escapeAttr(a.author || 'DRKPRTY')}" data-desc="${escapeAttr(a.excerpt)}" data-label="${escapeAttr(a.category)}" data-link="article.html?id=${a.id}" data-cover="${escapeAttr(a.image)}">
      <strong>${String(i + 1).padStart(2,"0")}</strong><div><h4>${a.title}</h4><p>${a.category}</p></div>
    </button>
  `).join("");

  if(rotationArticles.length){
    const first = rotationArticles[0];
    if(title) title.textContent = first.title || "";
    if(artist) artist.textContent = first.author || "DRKPRTY";
    if(desc) desc.textContent = first.excerpt || "";
    if(label) label.textContent = first.category || "RESEÑA";
    setRotationCover(first.image || "");
    if(read) read.href = `article.html?id=${first.id}`;
    fitRotationTitle();
  }else{
    if(title) title.textContent = "Sin reseñas";
    if(artist) artist.textContent = "Agrega reseñas desde el administrador";
    if(desc) desc.textContent = "Cuando publiques artículos con categoría RESEÑA, aparecerán aquí automáticamente.";
    if(label) label.textContent = "EN ROTACIÓN";
    setRotationCover("");
    if(read) read.href = "#";
    fitRotationTitle();
  }
}

function setupRotationSelector(){
  const selector = document.getElementById("rotationSelector");
  if(!selector) return;

  const title = document.getElementById("rotationTitle");
  const artist = document.getElementById("rotationArtist");
  const desc = document.getElementById("rotationDesc");
  const label = document.getElementById("rotationLabel");
  const read = document.getElementById("rotationRead");

  selector.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      selector.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      button.classList.add("active");

      if(title) title.textContent = button.dataset.title || "";
      if(artist) artist.textContent = button.dataset.artist || "";
      if(desc) desc.textContent = button.dataset.desc || "";
      if(label) label.textContent = button.dataset.label || "RESEÑA";
      setRotationCover(button.dataset.cover || "");
      if(read) read.href = button.dataset.link || "#";
      fitRotationTitle();
    });
  });
}

function renderDynamicEvents(){
  const events = getEvents();

  const homeEvents = document.querySelector(".events-list");
  if(homeEvents){
    homeEvents.innerHTML = events.length
      ? events.slice(0,4).map(ev => `
        <div class="event-row"><strong>${ev.day}<span>${ev.month}</span></strong><p>${ev.title}<br><small>${ev.venue}</small></p></div>
      `).join("")
      : `<p class="empty-events">Agrega eventos desde el administrador.</p>`;
  }

  const directory = document.querySelector(".events-directory");
  if(directory){
    directory.innerHTML = events.length
      ? events.map(ev => `
        <article class="event-directory-card">
          <strong>${ev.day}<span>${ev.month}</span></strong>
          <div><h3>${ev.title}</h3><p>${ev.venue}</p></div>
          <span>${ev.type}</span>
        </article>
      `).join("")
      : `<p class="empty-state" style="display:block">No hay eventos publicados todavía.</p>`;
  }
}

function setupFeaturedCarousel(){
  const carousel = document.getElementById("featuredCarousel");
  const slides = [...document.querySelectorAll(".featured-slide")];
  const dotsBox = document.getElementById("featuredDots");
  const prev = document.getElementById("prevFeatured");
  const next = document.getElementById("nextFeatured");
  if(!carousel || !slides.length || !dotsBox) return;

  let index = 0;
  let startX = 0;
  let timer;

  dotsBox.innerHTML = slides.map((_, i) => `<button type="button" data-slide="${i}" aria-label="Ir a nota ${i+1}"></button>`).join("");
  const dots = [...dotsBox.querySelectorAll("button")];

  function show(i){
    index = (i + slides.length) % slides.length;
    slides.forEach((slide, n) => slide.classList.toggle("active", n === index));
    dots.forEach((dot, n) => dot.classList.toggle("active", n === index));
  }

  function restart(){
    clearInterval(timer);
    timer = setInterval(() => show(index + 1), 15000);
  }

  prev?.addEventListener("click", (e) => { e.preventDefault(); show(index - 1); restart(); });
  next?.addEventListener("click", (e) => { e.preventDefault(); show(index + 1); restart(); });
  dots.forEach(dot => dot.addEventListener("click", (e) => {
    e.preventDefault();
    show(Number(dot.dataset.slide));
    restart();
  }));

  carousel.addEventListener("pointerdown", e => { startX = e.clientX; });
  carousel.addEventListener("pointerup", e => {
    const diff = e.clientX - startX;
    if(Math.abs(diff) > 60){
      show(diff < 0 ? index + 1 : index - 1);
      restart();
    }
  });

  show(0);
  restart();
}


function setupShareCopy(){
  document.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-copy-link]");
    if(!btn) return;

    event.preventDefault();

    const url = window.location.href;

    try{
      await navigator.clipboard.writeText(url);
      showCopyToast("LINK COPIADO");
    }catch(err){
      const temp = document.createElement("textarea");
      temp.value = url;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
      showCopyToast("LINK COPIADO");
    }
  });
}

function showCopyToast(message){
  let toast = document.querySelector(".share-copy-toast");
  if(!toast){
    toast = document.createElement("div");
    toast.className = "share-copy-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("active");

  clearTimeout(window.__orbitaCopyToastTimer);
  window.__orbitaCopyToastTimer = setTimeout(() => {
    toast.classList.remove("active");
  }, 1800);
}



function setupScrollTopButton(){
  let btn = document.getElementById("scrollTopBtn");
  if(!btn){
    btn = document.createElement("button");
    btn.id = "scrollTopBtn";
    btn.className = "scroll-top-btn";
    btn.type = "button";
    btn.textContent = "↑";
    btn.setAttribute("aria-label", "Volver arriba");
    document.body.appendChild(btn);
  }

  const toggle = () => {
    btn.classList.toggle("active", window.scrollY > 520);
  };

  window.addEventListener("scroll", toggle, { passive:true });
  toggle();

  btn.addEventListener("click", () => {
    window.scrollTo({ top:0, behavior:"smooth" });
  });
}



function setupCookieBanner(){
  if(localStorage.getItem("drkprty-cookies-ok") === "true") return;

  const banner = document.createElement("div");
  banner.className = "cookie-banner";
  banner.innerHTML = `
    <div>
      <strong>COOKIES</strong>
      <p>Usamos cookies para mejorar la experiencia, medir tráfico y preparar futuras funciones editoriales.</p>
    </div>
    <button type="button" id="acceptCookiesBtn">ACEPTAR →</button>
  `;

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("active"));

  document.getElementById("acceptCookiesBtn")?.addEventListener("click", () => {
    localStorage.setItem("drkprty-cookies-ok", "true");
    banner.classList.remove("active");
    setTimeout(() => banner.remove(), 260);
  });
}

function setupNewsletterSubscribe(){
  document.querySelectorAll("form").forEach(form => {
    const email = form.querySelector('input[type="email"]');
    const button = form.querySelector("button");
    if(!email || !button) return;

    const handleSubscribe = async (event) => {
      event.preventDefault();
      if(form.dataset.newsletterSubmitting === "1") return;

      const value = email.value.trim();
      if(!isValidNewsletterEmail(value)){
        showNewsletterToast("ESCRIBE UN EMAIL VÁLIDO");
        return;
      }

      const originalText = button.textContent;
      form.dataset.newsletterSubmitting = "1";
      button.disabled = true;
      button.textContent = "GUARDANDO...";

      try{
        await saveNewsletterEmail(value);
        email.value = "";
        showNewsletterToast("TE SUSCRIBISTE A DRKPRTY");
      }catch(err){
        console.warn("DRKPRTY newsletter save failed", err);
        showNewsletterToast("NO SE PUDO GUARDAR. INTENTA DE NUEVO");
      }finally{
        form.dataset.newsletterSubmitting = "0";
        button.disabled = false;
        button.textContent = originalText;
      }
    };

    form.addEventListener("submit", handleSubscribe);
    button.addEventListener("click", handleSubscribe);
  });
}

function showNewsletterToast(message){
  let toast = document.querySelector(".newsletter-toast");
  if(!toast){
    toast = document.createElement("div");
    toast.className = "newsletter-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("active");

  clearTimeout(window.__drkprtyNewsletterTimer);
  window.__drkprtyNewsletterTimer = setTimeout(() => {
    toast.classList.remove("active");
  }, 2200);
}



function setupDRKPRTYEyeLoader(){
  const loader = document.getElementById("siteLoader");
  if(!loader) return;

  document.documentElement.classList.add("is-loading");
  document.body.classList.add("is-loading");

  window.__hideDRKPRTYLoader = () => {
    window.setTimeout(() => {
      loader.classList.add("is-hidden");
      document.documentElement.classList.remove("is-loading");
      document.body.classList.remove("is-loading");
      window.setTimeout(() => loader.remove(), 650);
    }, 260);
  };
}

async function initOrbitaSite(){
  setupDRKPRTYEyeLoader();
  setupTheme();

  await loadFirebaseContent();

  console.info("DRKPRTY V11 main latest fix");
  console.info("DRKPRTY render data", {
    articles:getArticles().length,
    events:getEvents().length,
    hero:getHeroConfig()
  });

  setStaticPageSEO();
  setListingSEO();
  renderHashtags();
  updateArchiveTitle();
  renderFeatured();
  renderArticles();
  renderArticlePage();
  renderDynamicEvents();
  renderRotation();
  setupFeaturedCarousel();
  setupRotationSelector();
  setupShareCopy();
  setupScrollTopButton();
  setupCookieBanner();
  setupNewsletterSubscribe();
  enhanceMediaForPerformance();
  if(window.__hideDRKPRTYLoader) window.__hideDRKPRTYLoader();
}

initOrbitaSite();
