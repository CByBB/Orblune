const THEMES = [
  { id: "natural", label: "Natural", blurb: "Classic shaded relief" },
  { id: "aqua", label: "Sea glass", blurb: "Soft teal oceans" },
  { id: "atlas", label: "Atlas", blurb: "Warm paper map" },
  { id: "vivid", label: "Vivid", blurb: "Bright satellite color" },
  { id: "noir", label: "Noir", blurb: "Cool monochrome" },
  { id: "ember", label: "Ember", blurb: "Warm dusk glow" },
  { id: "frost", label: "Frost", blurb: "Icy arctic blue" },
  { id: "verdant", label: "Verdant", blurb: "Lush green land" },
  { id: "ink", label: "Ink", blurb: "Deep navy chart" },
  { id: "sand", label: "Sand", blurb: "Desert parchment" },
];

const rail = document.getElementById("theme-rail");
const layerA = document.getElementById("theme-preview-a");
const layerB = document.getElementById("theme-preview-b");
const labelEl = document.getElementById("theme-label");
const blurbEl = document.getElementById("theme-blurb");
const topBar = document.querySelector(".top");
const heroVisual = document.querySelector(".hero-visual");
const themesSection = document.getElementById("themes");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let activeThemeIndex = 0;
let frontIsA = true;
let autoTimer = 0;
let userPausedUntil = 0;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splitLetters(el) {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  el.textContent = "";
  el.setAttribute("aria-label", text);
  const letters = [];
  const words = text.split(" ");

  words.forEach((word, wi) => {
    const wordSpan = document.createElement("span");
    wordSpan.className = "word";
    wordSpan.style.display = "inline-block";
    wordSpan.style.whiteSpace = "nowrap";

    for (const ch of word) {
      const span = document.createElement("span");
      span.className = "letter";
      span.textContent = ch;
      span.setAttribute("aria-hidden", "true");
      wordSpan.appendChild(span);
      letters.push(span);
    }

    el.appendChild(wordSpan);
    if (wi < words.length - 1) {
      const space = document.createElement("span");
      space.className = "letter is-space";
      space.textContent = "\u00a0";
      space.setAttribute("aria-hidden", "true");
      el.appendChild(space);
    }
  });

  return letters;
}

function animateHeroLetters() {
  const targets = Array.from(document.querySelectorAll("[data-letters]"));
  const after = Array.from(document.querySelectorAll("[data-after-letters]"));

  if (reduceMotion) {
    for (const el of after) el.classList.add("is-in");
    return;
  }

  const allLetters = [];
  for (const el of targets) {
    allLetters.push(...splitLetters(el));
  }

  const order = shuffle(allLetters);
  const spanMs = 2200;
  const durationPad = 1200;

  for (const letter of order) {
    const delay = Math.random() * spanMs;
    window.setTimeout(() => letter.classList.add("is-in"), delay);
  }

  const doneAt = spanMs + durationPad;
  window.setTimeout(() => {
    for (const el of after) el.classList.add("is-in");
  }, doneAt * 0.72);
}

function frontLayer() {
  return frontIsA ? layerA : layerB;
}

function backLayer() {
  return frontIsA ? layerB : layerA;
}

function selectTheme(theme, button, { fromAuto = false } = {}) {
  if (!layerA || !layerB || !labelEl || !blurbEl) return;
  const idx = THEMES.findIndex((t) => t.id === theme.id);
  if (idx >= 0) activeThemeIndex = idx;

  const front = frontLayer();
  const back = backLayer();
  const nextSrc = `assets/theme-${theme.id}.jpg`;

  if (front.getAttribute("src") === nextSrc) {
    syncRail(button);
    return;
  }

  back.src = nextSrc;
  back.alt = `${theme.label} map theme preview in Orblune`;
  back.onload = () => {
    back.classList.add("is-front");
    front.classList.remove("is-front");
    frontIsA = !frontIsA;
    back.onload = null;
  };

  labelEl.style.opacity = "0";
  blurbEl.style.opacity = "0";
  window.setTimeout(() => {
    labelEl.textContent = theme.label;
    blurbEl.textContent = theme.blurb;
    labelEl.style.opacity = "1";
    blurbEl.style.opacity = "1";
  }, 180);

  syncRail(button);
  if (!fromAuto) {
    userPausedUntil = Date.now() + 12000;
  }
}

function syncRail(button) {
  for (const node of rail?.querySelectorAll(".theme-chip") ?? []) {
    const selected = button ? node === button : node.dataset.theme === THEMES[activeThemeIndex].id;
    node.setAttribute("aria-selected", selected ? "true" : "false");
  }
}

function buildThemeRail() {
  if (!rail) return;
  for (const theme of THEMES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-chip";
    btn.dataset.theme = theme.id;
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", theme.id === "natural" ? "true" : "false");
    btn.setAttribute("aria-label", `${theme.label}: ${theme.blurb}`);
    btn.innerHTML = `<img src="assets/theme-${theme.id}.jpg" alt="" loading="lazy" width="240" height="150" /><span>${theme.label}</span>`;
    btn.addEventListener("click", () => selectTheme(theme, btn));
    rail.appendChild(btn);
  }
}

function startThemeAutoplay() {
  if (reduceMotion || !themesSection) return;
  const tick = () => {
    if (Date.now() < userPausedUntil) return;
    if (!themesSection.classList.contains("is-visible")) return;
    const next = THEMES[(activeThemeIndex + 1) % THEMES.length];
    const btn = rail?.querySelector(`[data-theme="${next.id}"]`);
    selectTheme(next, btn instanceof HTMLElement ? btn : null, { fromAuto: true });
  };
  autoTimer = window.setInterval(tick, 4200);

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        themesSection.classList.toggle("is-visible", entry.isIntersecting && entry.intersectionRatio > 0.25);
      }
    },
    { threshold: [0, 0.25, 0.5] },
  );
  io.observe(themesSection);
}

async function resolveLatestInstaller() {
  const fallback = "https://github.com/CByBB/Orblune/releases/latest";
  const buttons = [document.getElementById("download-btn"), document.getElementById("download-btn-2")].filter(Boolean);
  try {
    const res = await fetch("https://api.github.com/repos/CByBB/Orblune/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("release fetch failed");
    const data = await res.json();
    const asset = (data.assets || []).find((a) => /Orblune_.*_x64-setup\.exe$/i.test(a.name));
    const href = asset?.browser_download_url || data.html_url || fallback;
    for (const btn of buttons) {
      btn.setAttribute("href", href);
      if (data.tag_name) btn.setAttribute("title", `Download Orblune ${data.tag_name}`);
    }
  } catch {
    for (const btn of buttons) btn.setAttribute("href", fallback);
  }
}

function watchScroll() {
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      topBar?.classList.toggle("scrolled", y > 12);
      if (heroVisual && !reduceMotion) {
        heroVisual.style.transform = `translate3d(0, ${Math.min(y * 0.18, 120)}px, 0)`;
      }
      ticking = false;
    });
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function revealOnScroll() {
  const nodes = document.querySelectorAll(".section-head, .theme-stage, .shot-row, .feature-list, .download-panel");
  for (const node of nodes) node.classList.add("reveal");
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  for (const node of nodes) io.observe(node);
}

function styleCaptionFade() {
  if (!labelEl || !blurbEl) return;
  labelEl.style.transition = "opacity 0.28s ease";
  blurbEl.style.transition = "opacity 0.28s ease";
}

animateHeroLetters();
buildThemeRail();
styleCaptionFade();
resolveLatestInstaller();
watchScroll();
revealOnScroll();
startThemeAutoplay();

window.addEventListener("beforeunload", () => {
  if (autoTimer) window.clearInterval(autoTimer);
});
