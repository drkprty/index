const defaultEvents = [
  {id:"charli-xcx-cdmx",day:"24",month:"MAY",title:"Charli XCX",venue:"Pepsi Center WTC · CDMX",type:"CONCIERTO"},
  {id:"ca7riel-paco-cdmx",day:"30",month:"MAY",title:"Ca7riel & Paco Amoroso",venue:"Foro Indie Rocks · CDMX",type:"CONCIERTO"},
  {id:"tyler-cdmx",day:"07",month:"JUN",title:"Tyler, The Creator",venue:"Palacio de los Deportes · CDMX",type:"CONCIERTO"},
  {id:"arca-cdmx",day:"14",month:"JUN",title:"Arca",venue:"Auditorio BB · CDMX",type:"CONCIERTO"},
  {id:"ceremonia-cdmx",day:"21",month:"JUN",title:"Festival Ceremonia",venue:"Parque Bicentenario · CDMX",type:"FESTIVAL"}
];

let fb = null;
let articles = [];
let events = [];
let hero = {
  featured: [],
  autoFeatured:false,
  featuredMode:"latest",
  featuredCount:3,
  topics: [],
  rotation: []
};

let articleTab = "all";
let articleSearch = "";
let selectContext = null;
let draggedFeaturedIndex = null;
let isReady = false;
let analyticsRange = "all";
let analyticsSort = "desc";
let articleDailyViews = {};

const $ = (id) => document.getElementById(id);

function ensureGitHubContentDefaults(){
  const owner = localStorage.getItem("drkprty-github-owner");
  const repo = localStorage.getItem("drkprty-github-repo");

  // Migration: older DRKPRTY builds saved media settings for oaxsun/orbita.
  // If the browser still has those values, move only the destination defaults
  // to the new content repo and keep the token intact.
  if(!owner || owner === "oaxsun") localStorage.setItem("drkprty-github-owner", "drkprty");
  if(!repo || repo === "orbita" || repo === "index") localStorage.setItem("drkprty-github-repo", "content");

  if(!localStorage.getItem("drkprty-github-branch")) localStorage.setItem("drkprty-github-branch", "main");
  if(!localStorage.getItem("drkprty-github-upload-path") || localStorage.getItem("drkprty-github-upload-path") === "assets/uploads") localStorage.setItem("drkprty-github-upload-path", "images");
  if(!localStorage.getItem("drkprty-github-article-path")) localStorage.setItem("drkprty-github-article-path", "articles");
  if(!localStorage.getItem("drkprty-github-public-base-url") || localStorage.getItem("drkprty-github-public-base-url") === "https://drkprty.uk") {
    localStorage.setItem("drkprty-github-public-base-url", "https://cdn.jsdelivr.net/gh/drkprty/content@main");
  }
}

ensureGitHubContentDefaults();

function slugify(value){
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"");
}

function safeStatsId(articleId){
  let id = String(articleId || "")
    .trim()
    .replace(/[\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);

  if(/^__.*__$/.test(id)) id = id.replace(/^__+/, "").replace(/__+$/, "") || `article-${Date.now()}`;
  return id;
}

function todayComparable(){
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const monthMap = {ENE:0,FEB:1,MAR:2,ABR:3,MAY:4,JUN:5,JUL:6,AGO:7,SEP:8,OCT:9,NOV:10,DIC:11};

function eventTime(ev){
  const year = new Date().getFullYear();
  return new Date(year, monthMap[(ev.month || "").toUpperCase()] ?? 0, Number(ev.day || 1)).getTime();
}

function eventSortDate(ev){
  return eventTime(ev);
}

function parsePublishTime(value){
  if(!value) return null;
  if(typeof value === "object" && typeof value.toDate === "function") return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isScheduled(article){
  const t = parsePublishTime(article.publishAt);
  if(!t || t <= Date.now()) return false;
  return article.published === "scheduled" || article.scheduled === true || article.published === true || article.published === "true";
}

function isPublished(article){
  if(isScheduled(article)) return false;
  return article.published === true || article.published === "true";
}

function isUnpublished(article){
  return !isPublished(article) && !isScheduled(article);
}

function statusOf(article){
  if(isScheduled(article)) return "scheduled";
  if(isPublished(article)) return "published";
  return "draft";
}

function statusLabel(article){
  const s = statusOf(article);
  if(s === "published") return "Publicado";
  if(s === "scheduled") return "Programado";
  return "No publicado";
}

function parseArticleDate(article){
  const publishTime = parsePublishTime(article.publishAt);
  if(publishTime) return publishTime;
  if(article.createdAt) return new Date(article.createdAt).getTime() || 0;
  return 0;
}

function sortedArticles(list=articles){
  return [...list].sort((a,b)=> parseArticleDate(b) - parseArticleDate(a));
}

function publishedArticles(){
  return sortedArticles(articles.filter(isPublished));
}

function articleMatches(a, q){
  if(!q) return true;
  const text = `${a.title || ""} ${a.category || ""} ${a.excerpt || ""} ${(a.tags || []).join(" ")}`.toLowerCase();
  return text.includes(String(q).toLowerCase());
}

function getArticle(id){
  return articles.find(a => a.id === id);
}

function featuredLimit(){
  const value = Number(hero.featuredCount || 3);
  return Math.min(5, Math.max(3, Number.isFinite(value) ? value : 3));
}

function featuredMode(){
  return hero.featuredMode === "top7" ? "top7" : "latest";
}

function articleViewsLast7(article){
  const safeId = safeStatsId(article?.id);
  const dates = articleDailyViews[safeId] || articleDailyViews[article?.id] || {};
  const allowed = analyticsDateKeys("7d");
  let total = 0;
  Object.entries(dates).forEach(([dateKey, views]) => {
    if(!allowed || allowed.has(dateKey)) total += Number(views || 0);
  });
  return total;
}

function topViewedLast7Articles(){
  return publishedArticles()
    .map(article => ({ article, views: articleViewsLast7(article) }))
    .filter(row => row.views > 0)
    .sort((a,b) => b.views - a.views || parseArticleDate(b.article) - parseArticleDate(a.article))
    .map(row => row.article);
}

function getAutoFeaturedIds(){
  const limit = featuredLimit();
  const manual = (hero.featured || []).filter(Boolean);
  const used = new Set();
  const selected = [];

  manual.forEach(id => {
    const article = getArticle(id);
    if(article && isPublished(article) && !used.has(id)){
      used.add(id);
      selected.push(id);
    }
  });

  const autoPool = featuredMode() === "top7"
    ? [...topViewedLast7Articles().slice(0,3), ...publishedArticles()]
    : publishedArticles();

  autoPool.forEach(article => {
    if(selected.length >= limit) return;
    if(!used.has(article.id)){
      used.add(article.id);
      selected.push(article.id);
    }
  });

  return selected.slice(0, limit);
}

function syncAutoFeatured(){
  // Auto mode no longer overwrites manual picks. Manual slots work as priority/pinned
  // items and the remaining slots are filled with the latest published articles.
}

function normalizeHero(){
  if(typeof hero.autoFeatured === "undefined") hero.autoFeatured = false;
  hero.featuredMode = hero.featuredMode === "top7" ? "top7" : "latest";
  hero.featuredCount = featuredLimit();
  if(!Array.isArray(hero.featured)) hero.featured = [];
  if(!Array.isArray(hero.rotation)) hero.rotation = [];
  if(!Array.isArray(hero.topics)) hero.topics = [];

  hero.featured = hero.featured.filter(Boolean).slice(0,5);
  hero.rotation = hero.rotation.filter(Boolean).slice(0,5);
}

async function publishDueScheduledArticles(){
  const due = articles.filter(a => {
    const t = parsePublishTime(a.publishAt);
    return t && t <= Date.now() && (a.published === "scheduled" || a.scheduled === true);
  });

  if(!due.length) return;

  await Promise.all(due.map(a => {
    a.published = true;
    a.scheduled = false;
    return saveArticleDoc(a);
  }));
}

async function loadAllFromFirestore(){
  if(!fb) return;

  const articleSnap = await fb.getDocs(fb.query(fb.collection(fb.db, "articles"), fb.orderBy("createdAt", "desc")));
  let statsById = {};
  try{
    const statsSnap = await fb.getDocs(fb.collection(fb.statsDb || fb.db, "articleStats"));
    statsById = Object.fromEntries(statsSnap.docs.map(d => [d.id, d.data()]));
  }catch(err){
    console.warn("No se pudieron leer articleStats", err);
  }
  articles = articleSnap.docs.map(d => {
    const articleId = d.id;
    const safeId = safeStatsId(articleId);
    const data = d.data();
    return { id:articleId, ...data, views:Number(statsById[safeId]?.views || statsById[articleId]?.views || data.views || 0) };
  });

  if(!articles.length && window.ARTICLES){
    articles = window.ARTICLES.map(a => ({
      ...a,
      createdAt: a.createdAt || new Date().toISOString(),
      published: a.published !== false
    }));
    await seedArticles();
  }

  await publishDueScheduledArticles();

  const eventSnap = await fb.getDocs(fb.query(fb.collection(fb.db, "events"), fb.orderBy("sortDate", "asc")));
  events = eventSnap.docs.map(d => ({ id:d.id, ...d.data() }));

  if(!events.length){
    events = structuredClone(defaultEvents).map(e => ({...e, sortDate:eventSortDate(e)}));
    await seedEvents();
  }

  const heroDoc = await fb.getDoc(fb.doc(fb.db, "siteConfig", "hero"));
  if(heroDoc.exists()){
    hero = { ...hero, ...heroDoc.data() };
  }else{
    hero = {
      featured: getAutoFeaturedIds(),
      autoFeatured:false,
      featuredMode:"latest",
      featuredCount:3,
      topics: [],
      rotation: articles.filter(a => String(a.category || "").toUpperCase() === "RESEÑA").slice(0,5).map(a => a.id)
    };
    await saveHeroOnly();
  }

  await loadArticleDailyViews(statsById);
  normalizeHero();
}

async function seedArticles(){
  await Promise.all(articles.map(a => saveArticleDoc(a)));
}

async function seedEvents(){
  await Promise.all(events.map(e => saveEventDoc(e)));
}

async function saveHeroOnly(){
  if(!fb) return;

  normalizeHero();

  await fb.setDoc(fb.doc(fb.db, "siteConfig", "hero"), {
    featured: hero.featured.filter(Boolean).slice(0, featuredLimit()),
    autoFeatured: hero.autoFeatured,
    featuredMode: featuredMode(),
    featuredCount: featuredLimit(),
    topics: publishedArticles().slice(0,10).map(a => a.id),
    rotation: hero.rotation
  }, { merge:true });
}

async function saveArticleDoc(article){
  if(!fb) return;
  await fb.setDoc(fb.doc(fb.db, "articles", article.id), article, { merge:true });
}

async function deleteArticleDoc(id){
  if(!fb) return;
  await fb.deleteDoc(fb.doc(fb.db, "articles", id));
}

async function saveEventDoc(ev){
  if(!fb) return;
  await fb.setDoc(fb.doc(fb.db, "events", ev.id), {...ev, sortDate:eventSortDate(ev)}, { merge:true });
}

async function deleteEventDoc(id){
  if(!fb) return;
  await fb.deleteDoc(fb.doc(fb.db, "events", id));
}

function purgePastEvents(){
  const before = events.length;
  events = events.filter(ev => eventTime(ev) >= todayComparable());
  if(events.length !== before) saveHeroOnly();
}

function download(name, data){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function renderSlotList(boxId, key, count, filterFn){
  const box = $(boxId);
  if(!box) return;

  box.innerHTML = "";
  const slotCount = key === "featured" ? featuredLimit() : count;

  const effectiveFeatured = key === "featured" && hero.autoFeatured ? getAutoFeaturedIds() : null;

  for(let i=0; i<slotCount; i++){
    const displayId = key === "featured" && effectiveFeatured ? effectiveFeatured[i] : hero[key]?.[i];
    const a = getArticle(displayId);
    const manualId = key === "featured" ? hero.featured?.[i] : null;
    const canRemove = key === "featured" && !!manualId;
    const card = document.createElement("article");
    card.className = "slot-card";

    if(key === "featured"){
      card.draggable = true;
      card.dataset.featuredIndex = String(i);
    }

    card.innerHTML = `
      <strong>${String(i+1).padStart(2,"0")}</strong>
      <div>
        <h4>${a ? a.title : "Sin seleccionar"}</h4>
        <p>${a ? `${a.category} · ${a.date}${key === "featured" && !manualId && hero.autoFeatured ? " · Auto" : ""}` : "Selecciona una entrada"}</p>
      </div>
      <button type="button" class="primary" data-select-slot="${key}" data-index="${i}" data-filter="${filterFn || ""}">Seleccionar</button>
      ${key === "featured" ? `<button type="button" class="slot-remove" data-remove-featured="${i}" ${canRemove ? "" : "disabled"} title="${canRemove ? "Quitar selección manual" : "Slot automático"}">×</button>` : ""}
    `;
    box.appendChild(card);
  }
}

function renderHero(){
  syncAutoFeatured();
  normalizeHero();

  $("heroAutoFeatured").checked = !!hero.autoFeatured;
  if($("heroFeaturedModeTop")) $("heroFeaturedModeTop").checked = featuredMode() === "top7";
  if($("heroFeaturedCount")) $("heroFeaturedCount").value = String(featuredLimit());
  renderSlotList("heroFeatured", "featured", featuredLimit(), "published");
  renderSlotList("heroRotation", "rotation", 5, "review");

  $("addFeaturedSlot").disabled = featuredLimit() >= 5;
  $("addFeaturedSlot").textContent = featuredLimit() >= 5 ? "Máximo 5 destacadas" : "Agregar otro slot";

  const auto = publishedArticles().slice(0,10);
  $("heroTopicsAuto").innerHTML = auto.map((a,i)=>`
    <article class="list-item">
      <img src="${a.image || ""}" alt="">
      <div>
        <h4>${String(i+1).padStart(2,"0")} · ${a.title || "Sin título"}</h4>
        <p>${a.excerpt || ""}</p>
        <span class="pill">${a.category || "NOTICIA"}</span>
      </div>
    </article>
  `).join("");
}

function openArticleSelector(context){
  selectContext = context;
  $("selectDialogTitle").textContent = context.key === "rotation" ? "Seleccionar reseña" : (context.isNewSlot ? "Agregar destacada" : "Seleccionar artículo");
  $("selectArticleSearch").value = "";
  renderSelectList();
  $("selectArticleDialog").showModal();
}

function eligibleForSelect(article){
  if(selectContext?.filter === "review") return String(article.category || "").toUpperCase() === "RESEÑA" && isPublished(article);
  return isPublished(article);
}

function renderSelectList(){
  const q = $("selectArticleSearch").value || "";
  const list = sortedArticles(articles).filter(eligibleForSelect).filter(a => articleMatches(a, q)).slice(0,10);

  $("selectDialogHint").textContent = q ? "Resultados de búsqueda." : "Últimos 10 artículos creados.";
  $("selectArticleList").innerHTML = list.map(a=>`
    <article class="list-item">
      <img src="${a.image || ""}" alt="">
      <div>
        <h4>${a.title || "Sin título"}</h4>
        <p>${a.excerpt || ""}</p>
        <span class="pill">${a.category || "NOTICIA"}</span>
      </div>
      <button type="button" class="primary" data-pick-article="${a.id}">Elegir</button>
    </article>
  `).join("");
}

async function pickArticle(articleId){
  if(!selectContext) return;

  hero[selectContext.key][selectContext.index] = articleId;
  if(selectContext.key === "featured") hero.featured = hero.featured.filter(Boolean).slice(0, featuredLimit());

  await saveHeroOnly();
  renderHero();
  $("selectArticleDialog").close();
}

function renderArticles(){
  let list = sortedArticles(articles).filter(a => articleMatches(a, articleSearch));

  if(articleTab === "published") list = list.filter(isPublished);
  if(articleTab === "unpublished") list = list.filter(isUnpublished);
  if(articleTab === "scheduled") list = list.filter(isScheduled);

  $("articleList").innerHTML = list.map(a=>{
    const s = statusOf(a);
    return `
      <article class="list-item">
        <img src="${a.image || ""}" alt="">
        <div>
          <h4>${a.title || "Sin título"}</h4>
          <p>${a.excerpt || ""}</p>
          <span class="pill">${a.category || "NOTICIA"}</span>
          <span class="article-views">👁 ${Number(a.views || 0).toLocaleString("es-MX")} visitas</span>
          <span class="plain-status ${s}">${statusLabel(a)}</span>
        </div>
        <button type="button" class="primary" data-edit-article="${a.id}">Editar</button>
      </article>
    `;
  }).join("");
}

function safeFileName(value){
  return String(value || "image")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9.]+/g,"-")
    .replace(/(^-|-$)/g,"");
}

function getGitHubImageConfig(){
  return {
    owner: localStorage.getItem("drkprty-github-owner") || "drkprty",
    repo: localStorage.getItem("drkprty-github-repo") || "content",
    branch: localStorage.getItem("drkprty-github-branch") || "main",
    uploadPath: localStorage.getItem("drkprty-github-upload-path") || "images",
    articlePath: localStorage.getItem("drkprty-github-article-path") || "articles",
    publicBaseUrl: localStorage.getItem("drkprty-github-public-base-url") || "https://cdn.jsdelivr.net/gh/drkprty/content@main",
    token: localStorage.getItem("drkprty-github-token") || ""
  };
}

function getGitHubSiteConfig(){
  const contentCfg = getGitHubImageConfig();
  return {
    owner: localStorage.getItem("drkprty-github-site-owner") || "drkprty",
    repo: localStorage.getItem("drkprty-github-site-repo") || "index",
    branch: localStorage.getItem("drkprty-github-site-branch") || contentCfg.branch || "main",
    token: contentCfg.token
  };
}

function textToBase64(text){
  return btoa(unescape(encodeURIComponent(String(text || ""))));
}

async function githubGetFileSha(apiUrl, token){
  const res = await fetch(apiUrl, {
    headers:{
      "Authorization":`Bearer ${token}`,
      "Accept":"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28"
    }
  });
  if(res.status === 404) return null;
  if(!res.ok){
    const detail = await res.text();
    throw new Error(`GitHub lookup failed: ${res.status} ${detail}`);
  }
  const data = await res.json();
  return data?.sha || null;
}

async function githubPutFile(repoPath, contentBase64, message, overrideCfg = null){
  const cfg = overrideCfg || getGitHubImageConfig();
  if(!cfg.token) throw new Error("Missing GitHub token");

  const cleanRepoPath = String(repoPath || "").replace(/^\/|\/$/g, "");
  const apiUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cleanRepoPath}`;
  const sha = await githubGetFileSha(apiUrl, cfg.token);

  const body = {
    message,
    content:contentBase64,
    branch:cfg.branch || "main"
  };
  if(sha) body.sha = sha;

  const res = await fetch(apiUrl, {
    method:"PUT",
    headers:{
      "Authorization":`Bearer ${cfg.token}`,
      "Accept":"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "Content-Type":"application/json"
    },
    body:JSON.stringify(body)
  });

  if(!res.ok){
    const detail = await res.text();
    let hint = "";
    const repoLabel = `${cfg.owner}/${cfg.repo}`;
    if(res.status === 401 || res.status === 403) hint = `\n\nRevisa que el token tenga permisos Contents: Read and Write para ${repoLabel}.`;
    if(res.status === 404) hint = `\n\nRevisa Owner/Repo/Branch. Actual: ${repoLabel} en branch ${cfg.branch || "main"}.`;
    if(res.status === 422) hint = `\n\nSi el repo ${repoLabel} está completamente vacío, crea primero un README en GitHub para que exista la branch ${cfg.branch || "main"}.`;
    throw new Error(`GitHub save failed: ${res.status} ${detail}${hint}`);
  }

  return res.json();
}

function cleanGitHubFolder(value, fallback){
  const clean = String(value || "").trim().replace(/^\/|\/$/g, "");
  return clean || fallback;
}

function githubArticleRepoPath(article){
  const cfg = getGitHubImageConfig();
  const articlePath = cleanGitHubFolder(cfg.articlePath, "articles");
  return `${articlePath}/${safeFileName(article.id)}.json`;
}

function articleForGitHub(article){
  return {
    ...article,
    id: String(article.id || "").trim(),
    title: String(article.title || "").trim(),
    updatedAt: new Date().toISOString()
  };
}

function buildArticlesIndex(){
  return sortedArticles(articles).map(a => ({
    id:a.id,
    title:a.title,
    category:a.category,
    date:a.date,
    image:a.image,
    excerpt:a.excerpt,
    publishAt:a.publishAt || "",
    published:a.published,
    scheduled:!!a.scheduled,
    createdAt:a.createdAt || ""
  }));
}

async function saveArticlesIndexToGitHub(){
  const cfg = getGitHubImageConfig();
  const articlePath = cleanGitHubFolder(cfg.articlePath, "articles");
  const repoPath = `${articlePath}/index.json`;
  const json = JSON.stringify(buildArticlesIndex(), null, 2);
  await githubPutFile(repoPath, textToBase64(json), "Update articles index");
  return repoPath;
}


function escapeHtml(value){
  return String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function escapeJsonScript(value){
  return JSON.stringify(value || "").replace(/<\//g,"<\\/");
}

function absoluteSiteUrl(path = "/"){
  const clean = String(path || "/");
  if(/^https?:\/\//i.test(clean)) return clean;
  return `https://drkprty.uk${clean.startsWith("/") ? clean : `/${clean}`}`;
}

function normalizeAbsoluteImageUrl(value){
  const raw = String(value || "").trim();
  if(!raw) return absoluteSiteUrl("/assets/drkprty-eye-logo.png");
  if(/^https?:\/\//i.test(raw)) return raw;
  if(raw.startsWith("//")) return `https:${raw}`;
  return absoluteSiteUrl(raw.startsWith("/") ? raw : `/${raw}`);
}

function isPublishedForGitHubExport(article){
  if(!article) return false;
  const published = article.published === true || String(article.published).toLowerCase() === "true";
  if(!published) return false;
  const publishTime = parsePublishTime(article.publishAt);
  return !publishTime || publishTime <= Date.now();
}

function shortCodeDate(article){
  const raw = article.publishAt || article.date || article.createdAt || new Date().toISOString();
  const d = raw instanceof Date ? raw : new Date(raw);
  const date = Number.isNaN(d.getTime()) ? new Date() : d;
  const dd = String(date.getDate()).padStart(2,"0");
  const mm = String(date.getMonth()+1).padStart(2,"0");
  return `${dd}${mm}`;
}

function firstMeaningfulTitleToken(title){
  const ignored = new Set(["el","la","los","las","un","una","unos","unas","de","del","y","en","con","para","por","the","a","an","of","and","to","on","at","new","nuevo","nueva"]);
  return String(title || "drkprty")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .find(word => !ignored.has(word)) || "drkprty";
}

function buildArticleShortCode(article){
  const baseSource = Array.isArray(article.tags) && article.tags.length ? article.tags[0] : firstMeaningfulTitleToken(article.title);
  const base = String(baseSource || "drkprty")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"")
    .slice(0,18) || "drkprty";
  return `${base}${shortCodeDate(article)}`;
}

function ensureArticleShareFields(article){
  const shortCode = article.shortCode || buildArticleShortCode(article);
  return {
    ...article,
    shortCode,
    shortUrl: absoluteSiteUrl(`/go/${shortCode}/`),
    seoUrl: absoluteSiteUrl(`/articles/${safeFileName(article.id)}.html`)
  };
}

function buildStaticArticleHtml(article){
  const title = article.title || "DRKPRTY";
  const desc = article.excerpt || "Music, culture & nightlife.";
  const image = normalizeAbsoluteImageUrl(article.image || article.imageUrl);
  const articleUrl = absoluteSiteUrl(`/article.html?id=${encodeURIComponent(article.id)}`);
  const seoUrl = article.seoUrl || absoluteSiteUrl(`/articles/${safeFileName(article.id)}.html`);
  const published = article.publishAt || article.createdAt || new Date().toISOString();
  const modified = new Date().toISOString();
  const schema = {
    "@context":"https://schema.org",
    "@type":"NewsArticle",
    headline:title,
    description:desc,
    image:[image],
    datePublished:published,
    dateModified:modified,
    author:{"@type":"Organization",name:"DRKPRTY"},
    publisher:{"@type":"Organization",name:"DRKPRTY",logo:{"@type":"ImageObject",url:absoluteSiteUrl("/assets/drkprty-eye-logo.png")}},
    mainEntityOfPage:seoUrl
  };
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — DRKPRTY</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="canonical" href="${escapeHtml(seoUrl)}">
  <meta property="og:site_name" content="DRKPRTY">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:url" content="${escapeHtml(seoUrl)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:secure_url" content="${escapeHtml(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <script type="application/ld+json">${escapeJsonScript(schema)}</script>
  <script>
    setTimeout(function(){ window.location.replace(${JSON.stringify(articleUrl)}); }, 700);
  </script>
</head>
<body>
  <p>Redirigiendo a <a href="${escapeHtml(articleUrl)}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;
}

function buildShortlinkHtml(article){
  const title = article.title || "DRKPRTY";
  const desc = article.excerpt || "Music, culture & nightlife.";
  const image = normalizeAbsoluteImageUrl(article.image || article.imageUrl);
  const shortUrl = article.shortUrl || absoluteSiteUrl(`/go/${article.shortCode}/`);
  const articleUrl = absoluteSiteUrl(`/article.html?id=${encodeURIComponent(article.id)}`);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — DRKPRTY</title>
  <meta name="description" content="${escapeHtml(desc)}">
  <link rel="canonical" href="${escapeHtml(shortUrl)}">
  <meta property="og:site_name" content="DRKPRTY">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">
  <meta property="og:url" content="${escapeHtml(shortUrl)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:secure_url" content="${escapeHtml(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <script>
    setTimeout(function(){ window.location.replace(${JSON.stringify(articleUrl)}); }, 700);
  </script>
</head>
<body>
  <p>Redirigiendo a <a href="${escapeHtml(articleUrl)}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;
}

function buildSitemapXml(){
  const urls = [
    { loc:absoluteSiteUrl("/"), lastmod:new Date().toISOString() },
    { loc:absoluteSiteUrl("/news.html"), lastmod:new Date().toISOString() },
    { loc:absoluteSiteUrl("/events.html"), lastmod:new Date().toISOString() },
    ...articles.filter(isPublishedForGitHubExport).map(a => ({ loc:absoluteSiteUrl(`/articles/${safeFileName(a.id)}.html`), lastmod:a.updatedAt || a.createdAt || new Date().toISOString() }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${escapeHtml(u.lastmod)}</lastmod></url>`).join("\n")}\n</urlset>\n`;
}

async function saveStaticShareFilesToGitHub(article){
  if(!isPublishedForGitHubExport(article)) return { skipped:true, reason:"not-published" };
  const siteCfg = getGitHubSiteConfig();
  if(!siteCfg.token) return { skipped:true, reason:"missing-token" };
  const cleanArticle = ensureArticleShareFields(article);
  const articlePath = `articles/${safeFileName(cleanArticle.id)}.html`;
  const shortlinkPath = `go/${safeFileName(cleanArticle.shortCode)}/index.html`;
  const sitemapPath = `sitemap.xml`;
  await githubPutFile(articlePath, textToBase64(buildStaticArticleHtml(cleanArticle)), `Generate SEO article page: ${cleanArticle.id}`, siteCfg);
  await githubPutFile(shortlinkPath, textToBase64(buildShortlinkHtml(cleanArticle)), `Generate shortlink: ${cleanArticle.shortCode}`, siteCfg);
  await githubPutFile(sitemapPath, textToBase64(buildSitemapXml()), "Update sitemap", siteCfg);
  return { skipped:false, articlePath, shortlinkPath, sitemapPath };
}

async function saveArticleJsonToGitHub(article){
  const cfg = getGitHubImageConfig();
  if(!cfg.token) return { skipped:true, reason:"missing-token" };

  const cleanArticle = articleForGitHub(ensureArticleShareFields(article));
  if(!cleanArticle.id) throw new Error("No se puede guardar en GitHub: el artículo no tiene slug/id.");

  const repoPath = githubArticleRepoPath(cleanArticle);
  const json = JSON.stringify(cleanArticle, null, 2);
  await githubPutFile(repoPath, textToBase64(json), `Save article JSON: ${cleanArticle.id}`);
  const indexPath = await saveArticlesIndexToGitHub();
  const staticResult = await saveStaticShareFilesToGitHub(cleanArticle);

  console.info("DRKPRTY GitHub article saved", { repoPath, indexPath, staticResult });
  return { skipped:false, repoPath, indexPath, staticResult };
}

function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadArticleImageIfNeeded(articleId){
  const input = $("articleImageFile");
  const file = input?.files?.[0];
  if(!file) return $("articleImage").value;

  const cfg = getGitHubImageConfig();
  if(!cfg.token){
    alert("Primero configura GitHub en el botón 'Configurar GitHub' del panel lateral.");
    throw new Error("Missing GitHub token");
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const fileName = `${safeFileName(articleId)}-${Date.now()}.${ext}`;
  const cleanPath = cfg.uploadPath.replace(/^\/|\/$/g, "");
  const repoPath = `${cleanPath}/${fileName}`;
  const publicUrl = `${cfg.publicBaseUrl.replace(/\/$/,"")}/${repoPath}`;
  const uploadButton = document.querySelector("#articleForm button[type='submit']");
  const previousText = uploadButton?.textContent;

  if(uploadButton){
    uploadButton.disabled = true;
    uploadButton.textContent = "Subiendo a GitHub...";
  }

  try{
    const content = await fileToBase64(file);
    await githubPutFile(repoPath, content, `Upload article image: ${fileName}`);

    $("articleImage").value = publicUrl;
    return publicUrl;
  }finally{
    if(uploadButton){
      uploadButton.disabled = false;
      uploadButton.textContent = previousText || "Guardar artículo";
    }
  }
}

function openArticle(id=null){
  const a = id ? articles.find(x => x.id === id) : null;
  $("articleDialogTitle").textContent = a ? "Editar artículo" : "Crear artículo";
  $("articleId").value = a?.id || "";
  $("articleTitle").dataset.lockedSlug = a?.id || "";
  $("articleImage").value = a?.image || "";
  if($("articleImageFile")) $("articleImageFile").value = "";
  $("articleTitle").value = a?.title || "";
  $("articleExcerpt").value = a?.excerpt || "";
  $("articleBody").value = Array.isArray(a?.body) ? a.body.join("\n\n") : "";
  $("articleSpotifyEmbed").value = a?.spotifyEmbed || "";
  $("articleAuthor").value = a?.author || "DRKPRTY";
  $("articleDate").value = a?.date || "";
  $("articleTags").value = Array.isArray(a?.tags) ? a.tags.join(", ") : "";
  $("articleCategory").value = a?.category || "NOTICIA";
  $("articlePublishAt").value = a?.publishAt || "";
  $("articlePublished").checked = a ? (isPublished(a) || isScheduled(a) || a.published === "scheduled" || a.scheduled === true) : true;
  $("deleteArticle").style.display = a ? "inline-block" : "none";
  $("articleDialog").showModal();
}

function normalizeImportedArticle(raw){
  const title = raw.title || raw.titulo || "";
  const id = raw.id || slugify(title);
  return {
    id,
    title,
    category: (raw.category || raw.categoria || "NOTICIA").toUpperCase(),
    date: raw.date || raw.fecha || "",
    read: raw.read || "3 MIN DE LECTURA",
    author: raw.author || raw.autor || "DRKPRTY",
    image: raw.image || raw.imagen || "",
    excerpt: raw.excerpt || raw.preview || raw.previewText || raw["preview text"] || "",
    tags: Array.isArray(raw.tags || raw.hashtags)
      ? (raw.tags || raw.hashtags)
      : String(raw.tags || raw.hashtags || "").split(",").map(t=>t.trim()).filter(Boolean),
    body: Array.isArray(raw.body || raw.cuerpo)
      ? (raw.body || raw.cuerpo)
      : String(raw.body || raw.cuerpo || "").split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean),
    quote: raw.quote || raw.frase || "",
    createdAt: raw.createdAt || new Date().toISOString(),
    publishAt: raw.publishAt || "",
    published: raw.published ?? true,
    spotifyEmbed: raw.spotifyEmbed || raw.spotify || ""
  };
}


function localDateKey(date = new Date()){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDailyViewId(id){
  const match = String(id || "").match(/^(.*)_(\d{4}-\d{2}-\d{2})$/);
  if(!match) return null;
  return { articleId: match[1], date: match[2] };
}

function analyticsDateKeys(range){
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const keys = new Set();

  if(range === "all") return null;

  if(range === "today"){
    keys.add(localDateKey(todayStart));
    return keys;
  }

  if(range === "7d" || range === "30d"){
    const days = range === "7d" ? 7 : 30;
    for(let i = 0; i < days; i++){
      const d = new Date(todayStart);
      d.setDate(todayStart.getDate() - i);
      keys.add(localDateKey(d));
    }
    return keys;
  }

  if(range === "year"){
    const year = today.getFullYear();
    return { has:(dateKey)=>String(dateKey || "").startsWith(`${year}-`) };
  }

  return null;
}

function analyticsRangeLabel(range = analyticsRange){
  return {
    all:"Histórico",
    today:"Hoy",
    "7d":"Últimos 7 días",
    "30d":"Últimos 30 días",
    year:"Este Año"
  }[range] || "Histórico";
}

function mergeDailyView(articleId, date, views){
  if(!articleId || !date) return;
  const safeId = safeStatsId(articleId);
  if(!safeId) return;
  if(!articleDailyViews[safeId]) articleDailyViews[safeId] = {};
  articleDailyViews[safeId][date] = Number(articleDailyViews[safeId][date] || 0) + Number(views || 0);
}

function dateKeyFromFirestoreValue(value){
  if(!value) return null;
  try{
    let date = null;
    if(typeof value === "string") date = new Date(value);
    else if(typeof value?.toDate === "function") date = value.toDate();
    else if(typeof value === "number") date = new Date(value);
    if(!date || Number.isNaN(date.getTime())) return null;
    return localDateKey(date);
  }catch(err){
    return null;
  }
}

function hasDailyViewsForArticle(articleId){
  const safeId = safeStatsId(articleId);
  const daily = articleDailyViews[safeId];
  return !!(daily && Object.keys(daily).length);
}

async function loadArticleDailyViews(statsById = {}){
  articleDailyViews = {};

  Object.entries(statsById || {}).forEach(([docId, data]) => {
    const articleId = data?.articleId || docId;
    const dailyViews = data?.dailyViews;
    if(!dailyViews || typeof dailyViews !== "object") return;
    Object.entries(dailyViews).forEach(([date, views]) => mergeDailyView(articleId, date, views));
  });

  if(fb?.statsDb){
    try{
      const snap = await fb.getDocs(fb.collection(fb.statsDb, "articleViewsDaily"));
      snap.docs.forEach(d => {
        const data = d.data() || {};
        const parsed = parseDailyViewId(d.id);
        const articleId = data.articleId || parsed?.articleId;
        const date = data.date || parsed?.date;
        if(!articleId || !date) return;
        // Legacy daily docs are kept as fallback. If dailyViews already has the date,
        // use the largest value instead of double-counting old mirrored data.
        const safeId = safeStatsId(articleId);
        if(!articleDailyViews[safeId]) articleDailyViews[safeId] = {};
        articleDailyViews[safeId][date] = Math.max(
          Number(articleDailyViews[safeId][date] || 0),
          Number(data.views || 0)
        );
      });
    }catch(err){
      console.warn("No se pudieron leer articleViewsDaily", err);
    }
  }

  // Backfill visual para analiticos: las visitas creadas antes de v40 solo tienen
  // views + updatedAt, pero no historial diario. Para que Hoy/7/30/Anio no aparezcan
  // vacios, asignamos ese total al dia de updatedAt hasta que entren nuevas visitas
  // con dailyViews real. No modifica Firestore; solo corrige la vista del admin.
  Object.entries(statsById || {}).forEach(([docId, data]) => {
    const articleId = data?.articleId || docId;
    if(hasDailyViewsForArticle(articleId)) return;
    const views = Number(data?.views || 0);
    if(views <= 0) return;
    const fallbackDate = dateKeyFromFirestoreValue(data?.updatedAt) || localDateKey(new Date());
    mergeDailyView(articleId, fallbackDate, views);
  });
}

function viewsForRange(article){
  if(analyticsRange === "all") return Number(article.views || 0);
  const safeId = safeStatsId(article.id);
  const dates = articleDailyViews[safeId] || articleDailyViews[article.id] || {};
  const allowed = analyticsDateKeys(analyticsRange);
  let total = 0;

  Object.entries(dates).forEach(([dateKey, views]) => {
    if(!allowed || allowed.has(dateKey)) total += Number(views || 0);
  });

  return total;
}

function renderAnalytics(){
  const listBox = $("analyticsList");
  if(!listBox) return;

  const rows = articles
    .map(article => ({ article, views:viewsForRange(article) }))
    .filter(row => row.views > 0)
    .sort((a,b)=> analyticsSort === "asc" ? a.views - b.views : b.views - a.views);

  const total = rows.reduce((sum,row)=>sum + row.views, 0);
  if($("analyticsTotalViews")) $("analyticsTotalViews").textContent = total.toLocaleString("es-MX");
  if($("analyticsViewedCount")) $("analyticsViewedCount").textContent = rows.length.toLocaleString("es-MX");
  if($("analyticsRangeLabel")) $("analyticsRangeLabel").textContent = analyticsRangeLabel();

  if(!rows.length){
    listBox.innerHTML = `<article class="empty-state"><h4>Sin vistas en este periodo</h4><p>No hay artículos con visitas registradas para ${analyticsRangeLabel().toLowerCase()}.</p></article>`;
    return;
  }

  listBox.innerHTML = rows.map((row, index)=>{
    const a = row.article;
    return `
      <article class="list-item analytics-item">
        <div class="analytics-rank">${String(index + 1).padStart(2,"0")}</div>
        <img src="${a.image || ""}" alt="">
        <div>
          <h4>${a.title || "Sin título"}</h4>
          <p>${a.excerpt || ""}</p>
          <span class="pill">${a.category || "NOTICIA"}</span>
          <span class="plain-status ${statusOf(a)}">${statusLabel(a)}</span>
        </div>
        <strong class="analytics-views">👁 ${Number(row.views || 0).toLocaleString("es-MX")}</strong>
      </article>
    `;
  }).join("");
}

async function refreshAnalytics(){
  if(!fb) return;

  try{
    const statsSnap = await fb.getDocs(fb.collection(fb.statsDb || fb.db, "articleStats"));
    const statsById = Object.fromEntries(statsSnap.docs.map(d => [d.id, d.data()]));
    articles = articles.map(a => {
      const safeId = safeStatsId(a.id);
      return {...a, views:Number(statsById[safeId]?.views || statsById[a.id]?.views || a.views || 0)};
    });
    await loadArticleDailyViews(statsById);
  }catch(err){
    console.warn("No se pudieron actualizar articleStats", err);
    await loadArticleDailyViews();
  }


  renderArticles();
  renderAnalytics();
}

function renderEvents(){
  purgePastEvents();
  events.sort((a,b)=>eventSortDate(a)-eventSortDate(b));

  $("eventList").innerHTML = events.map(ev=>`
    <article class="list-item">
      <div class="pill">${ev.day} ${ev.month}</div>
      <div>
        <h4>${ev.title}</h4>
        <p>${ev.venue}</p>
        <span class="pill">${ev.type}</span>
      </div>
      <button type="button" class="primary" data-edit-event="${ev.id}">Editar</button>
    </article>
  `).join("");
}

function openEvent(id=null){
  const ev = id ? events.find(x=>x.id===id) : null;
  $("eventDialogTitle").textContent = ev ? "Editar evento" : "Crear evento";
  $("eventId").value = ev?.id || "";
  $("eventDay").value = ev?.day || "";
  $("eventMonth").value = ev?.month || "";
  $("eventTitle").value = ev?.title || "";
  $("eventVenue").value = ev?.venue || "";
  $("eventType").value = ev?.type || "CONCIERTO";
  $("deleteEvent").style.display = ev ? "inline-block" : "none";
  $("eventDialog").showModal();
}

function renderAll(){
  renderHero();
  renderArticles();
  renderEvents();
  renderAnalytics();
}

/* Login + Firebase */
function initLogin(){
  const loginScreen = $("loginScreen");
  const adminApp = $("adminApp");
  const loginForm = $("loginForm");
  const loginError = $("loginError");

  function showLogin(){
    document.body.classList.remove("admin-authenticated");
    loginScreen.style.display = "grid";
    adminApp.style.display = "none";
  }

  async function showApp(){
    document.body.classList.add("admin-authenticated");
    loginScreen.style.display = "none";
    adminApp.style.display = "grid";
    if(!isReady){
      await loadAllFromFirestore();
      isReady = true;
      renderAll();
    }
  }

  showLogin();

  const waitForFirebase = setInterval(()=>{
    if(!window.orbitaFirebase) return;
    clearInterval(waitForFirebase);
    fb = window.orbitaFirebase;

    fb.onAuthStateChanged(fb.auth, async (user)=>{
      if(user) await showApp();
      else showLogin();
    });

    loginForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const email = $("loginUser").value.trim();
      const password = $("loginPass").value;
      loginError.style.display = "none";
      try{
        await fb.signInWithEmailAndPassword(fb.auth, email, password);
      }catch(err){
        console.error(err);
        loginError.style.display = "block";
      }
    });
  }, 100);
}

/* Events / clicks */
document.addEventListener("click", async (e)=>{
  const navBtn = e.target.closest("aside nav button");
  if(navBtn){
    document.querySelectorAll("aside nav button").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
    navBtn.classList.add("active");
    $(navBtn.dataset.section).classList.add("active");
    $("pageTitle").textContent = navBtn.textContent;
    if(navBtn.dataset.section === "analytics") await refreshAnalytics();
    return;
  }

  const rangeBtn = e.target.closest("[data-analytics-range]");
  if(rangeBtn){
    e.preventDefault();
    analyticsRange = rangeBtn.dataset.analyticsRange || "all";
    document.querySelectorAll("[data-analytics-range]").forEach(b=>b.classList.remove("active"));
    rangeBtn.classList.add("active");
    renderAnalytics();
    return;
  }

  const refreshBtn = e.target.closest("#refreshAnalytics");
  if(refreshBtn){
    e.preventDefault();
    await refreshAnalytics();
    return;
  }

  const closeBtn = e.target.closest("[data-close]");
  if(closeBtn){
    $(closeBtn.dataset.close)?.close();
    return;
  }

  const addFeatured = e.target.closest("#addFeaturedSlot");
  if(addFeatured){
    e.preventDefault();
    if(featuredLimit() >= 5) return;
    hero.featuredCount = featuredLimit() + 1;
    renderHero();
    return;
  }

  const removeFeatured = e.target.closest("[data-remove-featured]");
  if(removeFeatured){
    e.preventDefault();
    if(removeFeatured.disabled) return;
    const index = Number(removeFeatured.dataset.removeFeatured);
    hero.featured.splice(index, 1);
    await saveHeroOnly();
    renderHero();
    return;
  }

  const selectSlot = e.target.closest("[data-select-slot]");
  if(selectSlot){
    e.preventDefault();
    if(selectSlot.disabled) return;
    openArticleSelector({
      key:selectSlot.dataset.selectSlot,
      index:Number(selectSlot.dataset.index),
      filter:selectSlot.dataset.filter
    });
    return;
  }

  const pick = e.target.closest("[data-pick-article]");
  if(pick){
    e.preventDefault();
    await pickArticle(pick.dataset.pickArticle);
    return;
  }

  const editArticle = e.target.closest("[data-edit-article]");
  if(editArticle){
    e.preventDefault();
    openArticle(editArticle.dataset.editArticle);
    return;
  }

  const editEvent = e.target.closest("[data-edit-event]");
  if(editEvent){
    e.preventDefault();
    openEvent(editEvent.dataset.editEvent);
    return;
  }

  const githubConfig = e.target.closest("#githubImageConfig");
  if(githubConfig){
    const cfg = getGitHubImageConfig();
    $("githubOwner").value = cfg.owner;
    $("githubRepo").value = cfg.repo;
    $("githubBranch").value = cfg.branch;
    $("githubUploadPath").value = cfg.uploadPath;
    if($("githubArticlePath")) $("githubArticlePath").value = cfg.articlePath || "articles";
    $("githubPublicBaseUrl").value = cfg.publicBaseUrl;
    $("githubToken").value = cfg.token;
    $("githubDialog").showModal();
    return;
  }
});

$("heroAutoFeatured").addEventListener("change", async (e)=>{
  hero.autoFeatured = e.target.checked;
  await saveHeroOnly();
  renderHero();
});

$("heroFeaturedModeTop")?.addEventListener("change", async (e)=>{
  hero.featuredMode = e.target.checked ? "top7" : "latest";
  hero.autoFeatured = true;
  await saveHeroOnly();
  renderHero();
});

$("heroFeaturedCount")?.addEventListener("change", async (e)=>{
  hero.featuredCount = Math.min(5, Math.max(3, Number(e.target.value || 3)));
  hero.featured = hero.featured.filter(Boolean).slice(0, featuredLimit());
  await saveHeroOnly();
  renderHero();
});

$("saveHero").addEventListener("click", async ()=>{
  await saveHeroOnly();
  alert("Configuración Home guardada.");
});

$("selectArticleSearch").addEventListener("input", renderSelectList);

$("articleSearch").addEventListener("input", e=>{
  articleSearch = e.target.value;
  renderArticles();
});

document.querySelectorAll("[data-article-tab]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll("[data-article-tab]").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    articleTab = btn.dataset.articleTab;
    renderArticles();
  });
});

$("createArticle").addEventListener("click",()=>openArticle());

$("articleForm").addEventListener("submit", async e=>{
  e.preventDefault();

  const existingId = $("articleId").value;
  const id = existingId || slugify($("articleTitle").value);
  const previous = articles.find(a=>a.id===id);
  const imageUrl = await uploadArticleImageIfNeeded(id);
  const publishTime = parsePublishTime($("articlePublishAt").value);
  const shouldSchedule = !!(publishTime && publishTime > Date.now() && $("articlePublished").checked);

  let article = {
    id,
    title:$("articleTitle").value,
    category:$("articleCategory").value,
    date:$("articleDate").value,
    read: previous?.read || "3 MIN DE LECTURA",
    author:$("articleAuthor").value,
    image:imageUrl,
    excerpt:$("articleExcerpt").value,
    tags:$("articleTags").value.split(",").map(t=>t.trim()).filter(Boolean),
    body:$("articleBody").value.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean),
    quote: previous?.quote || "",
    createdAt: previous?.createdAt || new Date().toISOString(),
    publishAt:$("articlePublishAt").value,
    published: shouldSchedule ? "scheduled" : $("articlePublished").checked,
    scheduled: shouldSchedule,
    spotifyEmbed:$("articleSpotifyEmbed").value
  };

  article = ensureArticleShareFields(article);

  const idx = articles.findIndex(a=>a.id===id);
  if(idx >= 0) articles[idx] = article;
  else articles.unshift(article);

  const submitButton = e.submitter || document.querySelector("#articleForm button[type='submit']");
  const previousSubmitText = submitButton?.textContent;

  try{
    if(submitButton){
      submitButton.disabled = true;
      submitButton.textContent = "Guardando artículo...";
    }

    await saveArticleDoc(article);

    if(submitButton) submitButton.textContent = "Guardando JSON en GitHub...";
    const githubResult = await saveArticleJsonToGitHub(article);
    if(githubResult?.skipped){
      alert("El artículo se guardó en Firebase, pero NO se guardó en GitHub porque falta configurar el GitHub token.");
      return;
    }

    await saveHeroOnly();
    renderAll();
    $("articleDialog").close();
    console.info(`Artículo guardado en GitHub: ${githubResult.repoPath}`);
  }catch(error){
    console.error(error);
    alert(`No se pudo completar el guardado:\n\n${error.message}`);
    return;
  }finally{
    if(submitButton){
      submitButton.disabled = false;
      submitButton.textContent = previousSubmitText || "Guardar artículo";
    }
  }
});

$("deleteArticle").addEventListener("click", async ()=>{
  const id = $("articleId").value;
  if(!confirm("¿Eliminar este artículo?")) return;
  articles = articles.filter(a=>a.id!==id);
  hero.featured = hero.featured.filter(x=>x!==id);
  hero.rotation = hero.rotation.filter(x=>x!==id);
  await deleteArticleDoc(id);
  await saveHeroOnly();
  renderAll();
  $("articleDialog").close();
});

$("importArticleBtn")?.addEventListener("click", () => {
  $("importArticleFile").click();
});

$("importArticleFile")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;

  try{
    const text = await file.text();
    const imported = normalizeImportedArticle(JSON.parse(text));
    const idx = articles.findIndex(a => a.id === imported.id);

    if(idx >= 0){
      if(!confirm("Ya existe un artículo con ese ID.\n¿Sobrescribir?")) return;
      articles[idx] = imported;
    }else{
      articles.unshift(imported);
    }

    await saveArticleDoc(imported);
    await saveHeroOnly();
    renderAll();
    alert("Artículo importado correctamente.");
  }catch(err){
    console.error(err);
    alert("No se pudo importar.\nRevisa que sea un JSON válido.");
  }finally{
    e.target.value = "";
  }
});

$("articleImageFile")?.addEventListener("change", () => {
  const file = $("articleImageFile")?.files?.[0];
  if(!file) return;
  $("articleImage").value = URL.createObjectURL(file);
});

$("githubForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  localStorage.setItem("drkprty-github-owner", $("githubOwner").value.trim());
  localStorage.setItem("drkprty-github-repo", $("githubRepo").value.trim());
  localStorage.setItem("drkprty-github-branch", $("githubBranch").value.trim() || "main");
  localStorage.setItem("drkprty-github-upload-path", $("githubUploadPath").value.trim() || "images");
  localStorage.setItem("drkprty-github-article-path", $("githubArticlePath")?.value.trim() || "articles");
  localStorage.setItem("drkprty-github-public-base-url", $("githubPublicBaseUrl").value.trim() || "https://cdn.jsdelivr.net/gh/drkprty/content@main");
  localStorage.setItem("drkprty-github-token", $("githubToken").value.trim());
  $("githubDialog").close();
  alert("Configuración de GitHub guardada en este navegador.");
});

$("createEvent").addEventListener("click",()=>openEvent());

$("eventForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const id = $("eventId").value || slugify(`${$("eventTitle").value}-${$("eventDay").value}-${$("eventMonth").value}`);
  const ev = {
    id,
    day:$("eventDay").value,
    month:$("eventMonth").value,
    title:$("eventTitle").value,
    venue:$("eventVenue").value,
    type:$("eventType").value,
    sortDate:0
  };
  ev.sortDate = eventSortDate(ev);

  const idx = events.findIndex(x=>x.id===id);
  if(idx >= 0) events[idx] = ev;
  else events.unshift(ev);

  await saveEventDoc(ev);
  renderAll();
  $("eventDialog").close();
});

$("deleteEvent").addEventListener("click", async ()=>{
  const id = $("eventId").value;
  if(!confirm("¿Eliminar este evento?")) return;
  events = events.filter(e=>e.id!==id);
  await deleteEventDoc(id);
  renderAll();
  $("eventDialog").close();
});

$("exportAll").addEventListener("click",()=>{
  download("drkprty-content-export.json", {
    articles,
    events,
    hero:{
      featured: hero.featured.filter(Boolean).slice(0, featuredLimit()),
      autoFeatured: hero.autoFeatured,
      featuredMode: featuredMode(),
      featuredCount: featuredLimit(),
      topics: publishedArticles().slice(0,10).map(a=>a.id),
      rotation: hero.rotation
    }
  });
});

$("resetDemo").addEventListener("click", async ()=>{
  if(!confirm("Esto recarga datos desde Firestore. ¿Continuar?")) return;
  await loadAllFromFirestore();
  renderAll();
});

$("logoutBtn")?.addEventListener("click", async ()=>{
  await fb.signOut(fb.auth);
});

/* Drag & drop for featured */
$("heroFeatured").addEventListener("dragstart", e=>{
  const card = e.target.closest("[data-featured-index]");
  if(!card) return;
  draggedFeaturedIndex = Number(card.dataset.featuredIndex);
  card.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
});

$("heroFeatured").addEventListener("dragend", e=>{
  const card = e.target.closest("[data-featured-index]");
  if(card) card.classList.remove("dragging");
  document.querySelectorAll(".slot-card").forEach(c=>c.classList.remove("drag-over"));
  draggedFeaturedIndex = null;
});

$("heroFeatured").addEventListener("dragover", e=>{
  const card = e.target.closest("[data-featured-index]");
  if(!card || draggedFeaturedIndex === null) return;
  e.preventDefault();
  document.querySelectorAll(".slot-card").forEach(c=>c.classList.remove("drag-over"));
  card.classList.add("drag-over");
});

$("heroFeatured").addEventListener("drop", async e=>{
  const card = e.target.closest("[data-featured-index]");
  if(!card || draggedFeaturedIndex === null) return;
  e.preventDefault();

  const targetIndex = Number(card.dataset.featuredIndex);
  if(targetIndex !== draggedFeaturedIndex){
    const [moved] = hero.featured.splice(draggedFeaturedIndex, 1);
    hero.featured.splice(targetIndex, 0, moved);
    await saveHeroOnly();
    renderHero();
  }

  draggedFeaturedIndex = null;
});

const analyticsSortSelect = $("analyticsSort");
if(analyticsSortSelect){
  analyticsSortSelect.addEventListener("change", ()=>{
    analyticsSort = analyticsSortSelect.value || "desc";
    renderAnalytics();
  });
}

initLogin();
