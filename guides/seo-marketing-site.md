# Orblune marketing site — SEO & Google indexing guide

Practical checklist for [https://cbybb.github.io/Orblune/](https://cbybb.github.io/Orblune/): get into Google’s index, improve rankings for useful keywords, and verify results.

Site root in this repo: `docs/` (GitHub Pages).

---

## 1. What you already have

| Item | Location / URL |
|------|----------------|
| Canonical URL | `https://cbybb.github.io/Orblune/` |
| `robots.txt` | https://cbybb.github.io/Orblune/robots.txt |
| Sitemap | https://cbybb.github.io/Orblune/sitemap.xml |
| Title / description / OG / Twitter | `docs/index.html` `<head>` |
| JSON-LD (`SoftwareApplication`) | `docs/index.html` |
| Author IDs + email | meta + schema in `docs/index.html` |

On-page basics are in place. The gap for a new site is usually **Search Console setup**, **backlinks / mentions**, and **measuring** — not more meta keywords.

> Note: the HTML `keywords` meta tag has little/no effect on Google ranking. Keep real phrases in the **title, description, headings, and body text**.

---

## 2. Get the site into Google’s index

### 2.1 Google Search Console (required)

1. Open [Google Search Console](https://search.google.com/search-console).
2. Add property → **URL prefix** → `https://cbybb.github.io/Orblune/`
3. Verify ownership (easiest options for GitHub Pages):
   - **HTML file** upload into `docs/` then push, or
   - **HTML tag** meta in `docs/index.html` `<head>`, or
   - **DNS** if you later use a custom domain.
4. After verified:
   - **Sitemaps** → submit `https://cbybb.github.io/Orblune/sitemap.xml`
   - **URL inspection** → enter `https://cbybb.github.io/Orblune/` → **Request indexing**

Indexing can take days to a couple of weeks for a new GitHub Pages URL. Requesting indexing speeds discovery; it does not guarantee ranking.

### 2.2 Bing (optional, cheap win)

1. [Bing Webmaster Tools](https://www.bing.com/webmasters) → add the same URL.
2. Submit the same sitemap.
3. Or import from Search Console if offered.

### 2.3 Quick “am I indexed?” checks

Run these in a browser (incognito):

```text
site:cbybb.github.io/Orblune
site:cbybb.github.io/Orblune Orblune
```

Also:

```text
https://www.google.com/search?q=site%3Acbybb.github.io%2FOrblune
```

| Result | Meaning |
|--------|---------|
| Your page appears | Indexed (at least once) |
| “did not match any documents” | Not indexed yet — finish Search Console + wait/request again |
| Only GitHub repo shows for `Orblune` | Brand is known via GitHub; marketing URL still needs indexing/links |

### 2.4 Help Google find you (off-site)

Google trusts new pages more when something authoritative links to them:

- GitHub repo **Website** / homepage field → `https://cbybb.github.io/Orblune/` (already useful if set).
- README link to the site (top of `README.md`).
- Medium article **01** with the live site URL (you already wrote this).
- Occasional honest posts (Reddit wallpaper/Windows communities, HN “Show HN”, Discord) — avoid spam blasts.
- Consistent identity: CByBB / CodeByBB + site + GitHub on profiles.

---

## 3. Keyword strategy (what to rank for)

### 3.1 Priority buckets

**A — Brand (should win first)**  
Easy once indexed; prove ownership of the name.

- `Orblune`
- `Orblune wallpaper`
- `Orblune Windows`
- `CByBB Orblune`
- `cbybb.github.io/Orblune`

**B — Product intent (main SEO target)**  
Harder; need relevance + links over time.

- `live Earth wallpaper Windows`
- `live earth wallpaper`
- `live Earth wallpaper for Windows 11`
- `day night wallpaper Windows`
- `world clock wallpaper`
- `desktop globe wallpaper`
- `live wallpaper with time zones`
- `live Earth time`
- `animated Earth wallpaper Windows`
- `multi monitor live wallpaper Windows`
- `Earth map live wallpaper Windows`

**C — Long-tail (realistic early wins)**  

- `live Earth wallpaper with city times`
- `Windows wallpaper real sun day night`
- `multi monitor Earth wallpaper Windows`
- `Orblune download`

**D — Avoid competing head-on at first**  

- bare `wallpaper` / `Windows wallpaper` (too broad, dominated by big sites)

### 3.2 Keep copy aligned

When you edit `docs/index.html`, make sure:

1. **`<title>`** contains primary phrase + brand (already close).
2. **meta description** includes Windows + live Earth + clocks/weather + “Download”.
3. **Visible H1 / hero** uses human language matching search intent (not only brand poetry).
4. **One clear H2 section** that literally mentions “live Earth wallpaper for Windows” in body text.
5. **Image `alt`** describes the product (city clocks, day/night map) — good for Image search too.
6. **`sitemap.xml`** gets a new `<lastmod>` when you make meaningful content changes (optional but helpful).

---

## 4. On-page improvements to do next (checklist)

Use this when you iterate the site:

- [ ] Search Console verified + sitemap submitted + homepage “Request indexing”
- [ ] Repo README + GitHub homepage URL both point at the Pages site
- [ ] Medium / social posts use the **Pages URL**, not only the releases page
- [ ] Add `<lastmod>` to `docs/sitemap.xml` on content updates
- [ ] Consider a short visible FAQ block (“What is Orblune?”, “Windows only?”, “Is it free?”) with keyword-rich answers
- [ ] Consider `/privacy` or `/faq` only if you have real content — empty pages hurt more than they help
- [ ] Validate JSON-LD: [Rich Results Test](https://search.google.com/test/rich-results)
- [ ] Mobile check: [PageSpeed Insights](https://pagespeed.web.dev/) on the Pages URL (CWV aren’t everything, but broken mobile hurts)
- [ ] Don’t block assets in `robots.txt` (yours allows `/` — keep it that way)
- [ ] After each release, keep `downloadUrl` in JSON-LD in sync with `latest-download.json`

---

## 5. How to test keywords (so you know SEO improved)

### 5.1 Baseline (do this once, save the date)

Create a simple log (Notion, sheet, or `guides/seo-keyword-log.md`):

| Date | Keyword | Mode | Rank / result | Notes |
|------|---------|------|---------------|-------|
| YYYY-MM-DD | Orblune | Incognito, US English | #? or not found | |
| … | live Earth wallpaper Windows | … | … | |

**Rules for fair tests:**

1. Use **Incognito / private** window (or Search Console “Performance”, which is better long-term).
2. Turn off personalization where possible; try `https://www.google.com/search?q=KEYWORD&pws=0`
3. Same country/language each time (e.g. English).
4. Don’t only search while logged into Chrome with your history — results skew.
5. Record **position of `cbybb.github.io/Orblune`**, not the GitHub repo, unless you care about repo SEO separately.

### 5.2 Manual Google checks (weekly at first)

For each keyword in §3.1 A–C:

```text
https://www.google.com/search?q=Orblune
https://www.google.com/search?q=%22live+Earth+wallpaper%22+Windows
https://www.google.com/search?q=world+clock+wallpaper+Windows
https://www.google.com/search?q=Orblune+download
```

Also use:

```text
site:cbybb.github.io/Orblune
```

**Pass signals:**

- Brand queries → Pages URL in top 3 (ideally #1 over random mirrors)
- Product queries → URL appears in top 50, then top 20, then top 10 over months
- `site:` → homepage listed with a sensible title/description snippet

**Fail signals:**

- `site:` empty after 2+ weeks with Search Console verification → re-check robots, sitemap, request indexing, look for “Crawled – currently not indexed”
- Snippet shows old title → cache lag; use URL Inspection → Request indexing after deploys
- Only GitHub shows for `Orblune` → strengthen homepage field + Medium + README links to Pages URL

### 5.3 Search Console Performance (best ongoing test)

After 2–7 days of data:

1. Search Console → **Performance**
2. Filter Queries containing `orblune`, `earth wallpaper`, `world clock`, etc.
3. Track weekly: **Impressions**, **Clicks**, **Average position**, **CTR**

Improvement looks like:

- Impressions rising on brand + long-tail  
- Average position moving down in number (e.g. 40 → 15)  
- CTR up after you tighten title/description  

Export CSV monthly and keep it with the keyword log.

### 5.4 Optional tools

| Tool | Use |
|------|-----|
| [Rich Results Test](https://search.google.com/test/rich-results) | Schema validity |
| [URL Inspection](https://search.google.com/search-console) | Live fetch / index status |
| [PageSpeed Insights](https://pagespeed.web.dev/) | Mobile performance |
| [Google Trends](https://trends.google.com/) | Compare interest: “live wallpaper” vs “earth wallpaper” |
| Bing Webmaster | Second index + keyword ideas |

Paid rank trackers (Ahrefs, Semrush, etc.) are optional until you care about competitive SERPs.

### 5.5 Suggested monthly cadence

| When | Action |
|------|--------|
| Week 0 | Verify Search Console, submit sitemap, request indexing, write baseline keyword table |
| Weekly (month 1) | `site:` check + brand query + 3 product queries; note positions |
| After each site deploy | URL Inspection → Request indexing if title/description/content changed |
| Monthly | Review Search Console queries; tweak title/H2/FAQ for queries that get impressions but low CTR |
| After Medium / social posts | Expect a short crawl/impression bump; don’t judge rankings on one day |

---

## 6. Target outcomes (simple scoreboard)

Call SEO “improved” when most of these are true:

1. `site:cbybb.github.io/Orblune` returns the homepage.  
2. Query `Orblune` shows the Pages URL near the top (with or next to GitHub).  
3. Search Console shows steady **impressions** for brand + at least a few product phrases.  
4. At least one non-brand query (e.g. `live Earth wallpaper Windows`) shows your URL somewhere in the results over time.  
5. Title/description in the SERP match what you shipped (not a stale GitHub scrape).

---

## 7. Files to touch in this repo

| Goal | File |
|------|------|
| Title, description, schema, alts | `docs/index.html` |
| Crawl rules | `docs/robots.txt` |
| Sitemap URLs / lastmod | `docs/sitemap.xml` |
| Download URL in schema | `docs/index.html` + `docs/latest-download.json` |
| Public content people link to | Medium under `articles/`, README, GitHub About |

---

## 8. Don’t waste time on

- Stuffing `meta keywords` with dozens of variants  
- Buying links or spam directories  
- Spinning thin pages for every keyword  
- Expecting page-1 for competitive terms in the first week  
- Changing title every day (hurts learning from Search Console)

---

## 9. One-page startup script (today)

1. Verify Search Console for `https://cbybb.github.io/Orblune/`.  
2. Submit `sitemap.xml`.  
3. URL Inspection → Request indexing.  
4. Confirm GitHub repo homepage = Pages URL.  
5. Confirm Medium **01** links to Pages URL.  
6. Fill the baseline keyword table (§5.1).  
7. Recheck `site:cbybb.github.io/Orblune` in 3–7 days.

Contact for site issues: [software.vision@dreambuild.cloud](mailto:software.vision@dreambuild.cloud)
