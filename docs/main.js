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
const preview = document.getElementById("theme-preview");
const labelEl = document.getElementById("theme-label");
const blurbEl = document.getElementById("theme-blurb");
const topBar = document.querySelector(".top");

function selectTheme(theme, button) {
  if (!preview || !labelEl || !blurbEl) return;
  preview.classList.add("swap");
  window.setTimeout(() => {
    preview.src = `assets/theme-${theme.id}.jpg`;
    preview.alt = `${theme.label} map theme preview`;
    labelEl.textContent = theme.label;
    blurbEl.textContent = theme.blurb;
    preview.classList.remove("swap");
  }, 160);

  for (const node of rail?.querySelectorAll(".theme-chip") ?? []) {
    node.setAttribute("aria-selected", node === button ? "true" : "false");
  }
}

function buildThemeRail() {
  if (!rail) return;
  for (const theme of THEMES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-chip";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-selected", theme.id === "natural" ? "true" : "false");
    btn.setAttribute("aria-label", `${theme.label}: ${theme.blurb}`);
    btn.innerHTML = `<img src="assets/theme-${theme.id}.jpg" alt="" loading="lazy" width="240" height="150" /><span>${theme.label}</span>`;
    btn.addEventListener("click", () => selectTheme(theme, btn));
    rail.appendChild(btn);
  }
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
      if (data.tag_name) {
        btn.setAttribute("title", `Download Orblune ${data.tag_name}`);
      }
    }
  } catch {
    for (const btn of buttons) btn.setAttribute("href", fallback);
  }
}

function watchScroll() {
  const onScroll = () => {
    topBar?.classList.toggle("scrolled", window.scrollY > 12);
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
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
  );
  for (const node of nodes) io.observe(node);
}

buildThemeRail();
resolveLatestInstaller();
watchScroll();
revealOnScroll();
