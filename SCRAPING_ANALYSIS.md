# Job Aggregator — Scraping Architecture Analysis

> **Purpose of this document:** Explain *how* this tool currently collects job
> postings from each website, and evaluate whether the approach is the best
> possible **free, fully-local** design. No paid services. No cloud
> dependencies. Everything runs on a developer laptop.
>
> _This is an analysis/recommendation document only — no code was changed._

---

## 1. The Big Picture — How Collection Works

The scraping pipeline is a clean, layered flow:

```
Celery Beat (scheduler)  ─┐
Manual API call          ─┼─► collect_jobs_task ─► JobOrchestratorService
                          ┘                              │
                                                         ▼
                          CollectorFactory.get_collector("remoteok" | "lever" | ...)
                                                         │
                                  ┌──────────────────────┼───────────────────────┐
                                  ▼                       ▼                        ▼
                          RemoteOKCollector       LeverCollector          LinkedinCollector ...
                          (each returns List[ScrapedJob])
                                                         │
                                                         ▼
                          For each job:  save → deduplicate → categorize
                                                         │
                                                         ▼
                                          PostgreSQL (Job / Company / Source)
```

**Key files**

| Layer | File |
|-------|------|
| Scheduler / entry task | `backend/apps/jobs/tasks.py` |
| Pipeline coordinator | `backend/apps/jobs/services/orchestrator.py` |
| Collector registry | `backend/apps/jobs/services/collectors/collector_factory.py` |
| Base HTTP client | `backend/apps/jobs/services/collectors/base_collector.py` |
| Individual scrapers | `backend/apps/jobs/services/collectors/*_collector.py` |
| Validation model | `backend/apps/jobs/domain/job_domain.py` |
| Dedup engine | `backend/apps/jobs/services/deduplication.py` |
| Categorization | `backend/apps/jobs/services/categorization.py` |

### Design patterns used (and they are good choices)

- **Factory pattern** (`CollectorFactory`) — maps a source name string to a
  collector class. Adding a new site = add one class + one dict entry. Nothing
  else changes. This is the right abstraction.
- **Abstract base class** (`BaseCollector`) — every collector implements
  `collect() -> List[ScrapedJob]` and shares one `fetch_url()` helper with a
  browser-like `User-Agent` and a 15s timeout.
- **Pydantic domain model** (`ScrapedJob`) — validates every scraped record
  (required title/company/apply_url, URL must start with http/https) *before*
  it touches the database. Bad data is rejected at the boundary.
- **Orchestrator isolates failures** — each source and each individual job is
  wrapped in `try/except`, so one broken site never kills the whole run.

**Verdict on the architecture itself: this is a solid, idiomatic design.** The
problems are not in the structure — they are in *how individual sites are
reached* and a couple of configuration gaps. Those are detailed below.

---

## 2. Per-Source Breakdown — Method, Cost, and Reliability

There are **7 collectors**. They fall into three very different reliability
tiers. The distinction matters enormously for a "free + local + works
reliably" goal.

| # | Source | Method | Endpoint | Free? | Reliability | Legal/ToS risk |
|---|--------|--------|----------|-------|-------------|----------------|
| 1 | **RemoteOK** | Public JSON API | `remoteok.com/api` | ✅ Free | 🟢 High | 🟢 Low (public API) |
| 2 | **We Work Remotely** | Public RSS feed | `weworkremotely.com/.../remote-programming-jobs.rss` | ✅ Free | 🟢 High | 🟢 Low (RSS is meant for this) |
| 3 | **Greenhouse** | Official public job-board API | `boards-api.greenhouse.io/v1/boards/{token}/jobs` | ✅ Free | 🟢 High | 🟢 Low (official API) |
| 4 | **Lever** | Official public postings API | `api.lever.co/v0/postings/{token}` | ✅ Free | 🟢 High | 🟢 Low (official API) |
| 5 | **LinkedIn** | HTML scraping of guest search pages | `linkedin.com/jobs/search?...` | ✅ Free | 🔴 Low | 🔴 **High — violates LinkedIn ToS, aggressively rate-limited/blocked** |
| 6 | **Naukri** | Private internal JSON API + cookie priming | `naukri.com/jobapi/v3/search` | ✅ Free | 🟠 Medium-Low | 🔴 **High — undocumented private API, anti-bot defenses** |
| 7 | **Hirist** | Scrape Next.js `__NEXT_DATA__` blob | `hirist.tech/search/...` | ✅ Free | 🔴 Low | 🟠 Medium (scraping rendered HTML) |

### Tier A — Stable, "blessed" data sources (keep as-is)

**RemoteOK, We Work Remotely, Greenhouse, Lever.**

These four use either a **public API** or a **feed that the site publishes on
purpose**. They are stable, fast, return clean structured JSON/XML, need no
browser, no JavaScript engine, and no anti-bot trickery. They are exactly what
a free + local aggregator should rely on.

- RemoteOK: one GET, parse JSON, skip the first metadata element. Clean.
- WeWorkRemotely: parse RSS with the stdlib `xml.etree`. Splits the
  `"Company: Title"` convention correctly. Clean.
- Greenhouse / Lever: official ATS APIs. **Caveat:** they are hard-coded to a
  *single* company token (`gitlab`, `leverdemo`). See gap #3 below — these can
  return *far* more jobs if driven by a list of company tokens.

### Tier B — Fragile scrapers (the real risk in this project)

**LinkedIn, Naukri, Hirist.**

This is where the "is this the best approach?" answer becomes **no**.

- **LinkedIn** (`linkedin_collector.py`) — scrapes the guest job-search HTML by
  CSS class names (`base-search-card__info`, etc.), loops 8 keywords × 3 pages
  = up to 24 requests per run with `time.sleep` delays. Problems:
  - LinkedIn's ToS **explicitly prohibits scraping**. This is the single
    biggest legal liability in the codebase.
  - Guest HTML and CSS class names change frequently → silent breakage.
  - LinkedIn aggressively rate-limits, fingerprints, and serves challenge
    pages to datacenter/repeated IPs. From a single local machine it will work
    intermittently at best and get soft-blocked at worst.
  - It is also the **slowest** collector by far (sequential paged requests with
    sleeps), which drags down the whole run.

- **Naukri** (`naukri_collector.py`) — primes cookies by visiting the homepage,
  then calls an **undocumented internal API** (`/jobapi/v3/search`) with a
  pile of forged `sec-ch-ua` / `AppId` / `clientId` headers. This is clever,
  but it is reverse-engineering a private endpoint behind anti-bot defenses. It
  will break whenever Naukri rotates its bot protection, and there is no
  fallback — on failure it simply returns `[]`.

- **Hirist** (`hirist_collector.py`) — depends on a `__NEXT_DATA__` JSON blob
  whose internal shape (`props.pageProps.initialState.jobSearch.jobs`) is an
  undocumented Next.js implementation detail. The code itself flags this as "a
  safe fallback / structure varies." In practice this path is likely to return
  nothing the moment the site re-renders its state tree.

**Bottom line on Tier B:** these three are free, but "free" is not the same as
"reliable" or "allowed." They are brittle, legally exposed, and the most likely
sources of silent failures and IP blocks. They are the weakest part of an
otherwise clean design.

---

## 3. Gaps & Issues Found

### Gap #1 — The schedule the README promises does not exist ⚠️

The README says scraping runs "periodically (e.g., every 6 hours)" via Celery
Beat. But `settings.py` has **no `CELERY_BEAT_SCHEDULE`** and the tasks define
no periodic entry. `django_celery_beat` is installed, so schedules *can* be
added through the DB/admin — but **out of the box, nothing runs on a timer.**
Collection only happens when someone calls the API or triggers the task
manually. This is a documentation-vs-reality mismatch worth closing.

### Gap #2 — "Fallback mock jobs" can silently pollute real data 🟠

RemoteOK, WeWorkRemotely, Greenhouse, and Lever all return **hard-coded fake
jobs** (Shopify, Stripe, Vercel, GitLab…) when the live fetch fails. This is
great for offline demos, but in normal operation it means a network blip
inserts *fictional* postings into the database that look real. There is no flag
distinguishing "mock" from "live." Recommendation: gate fallbacks behind an
explicit `USE_MOCK_FALLBACK` setting (off by default), or tag them clearly.

### Gap #3 — Greenhouse/Lever only scrape one company each 🟠

Both are hard-coded to a single board token (`gitlab`, `leverdemo`). The whole
value of these ATS APIs is that **thousands** of companies expose boards on
them. Driving each collector from a configurable list of company tokens (stored
in the `Source` model or settings) would multiply the real-job yield for
**zero** extra cost and zero extra risk — unlike the Tier B scrapers.

### Gap #4 — No politeness/caching layer

Every run re-fetches everything from scratch. No conditional requests
(`ETag`/`If-Modified-Since`), no per-domain rate limiting beyond LinkedIn's
manual sleeps, no caching. Fine at small scale, but it's wasted bandwidth and
raises the block risk on the fragile sources.

### Minor notes
- `BaseCollector` opens a new `httpx.Client` per `fetch_url` call (no connection
  reuse). Negligible now; trivial to improve.
- Deduplication runs one-job-at-a-time with DB queries per job (`O(n)` queries).
  Fine for hundreds; would need batching for tens of thousands.

---

## 4. Is This the Best Free + Local Approach? — Recommendations

**Short answer:** the *architecture* is excellent and worth keeping. The
*source mix* is half-excellent and half-risky. To stay genuinely free, local,
and reliable, **lean hard on the API/feed sources and treat the HTML scrapers as
optional/best-effort.**

### Recommended priority order (all free)

| Priority | Action | Why |
|----------|--------|-----|
| ⭐ Keep & expand | RemoteOK, WeWorkRemotely (APIs/feeds) | Stable, legal, zero-cost, no maintenance |
| ⭐ Expand coverage | Greenhouse + Lever driven by a **list** of company tokens | Biggest free yield gain; same low risk (Gap #3) |
| ➕ Add (free, structured) | **Remotive** (`remotive.com/api/remote-jobs`), **Arbeitnow** (`arbeitnow.com/api/job-board-api`), **Hacker News "Who is hiring"** via the free Algolia HN API, **USAJobs** (free API key) | More public JSON APIs = more jobs without scraping risk |
| ➕ Add (free, structured) | **Adzuna** free developer tier, **Jobicy** API, **The Muse** API | Generous free tiers, documented, stable |
| ⚠️ Demote / make optional | LinkedIn, Naukri, Hirist | Brittle + ToS risk; keep behind a feature flag, expect breakage, never let them block the run |
| 🔧 Fix config | Add `CELERY_BEAT_SCHEDULE` (Gap #1); gate mock fallbacks (Gap #2) | Make the promised automation real and keep data clean |

### If HTML scraping must stay

For local-only use you *can* keep the fragile scrapers, but make them safe:
- Put them behind an `ENABLE_FRAGILE_SCRAPERS` flag, **off by default**.
- Never insert mock data on their failure — just log and return `[]` (Naukri/Hirist already do this; LinkedIn should too).
- Accept that they will break periodically and that re-running won't help when the site changes its markup.
- If JS-rendered pages are unavoidable, **Playwright** (free, runs locally) is the correct tool rather than guessing at `__NEXT_DATA__` shapes — but it's heavier and still ToS-exposed for LinkedIn. Prefer adding more API sources instead.

### Things that are already right (don't change)
- Factory + ABC + Pydantic validation layering — keep it.
- Per-source and per-item exception isolation in the orchestrator — keep it.
- Using public APIs/RSS wherever available — this is the correct instinct; just do *more* of it.

---

## 5. One-Paragraph Summary

The tool collects jobs through a clean, pluggable Factory-of-collectors design:
four sources (RemoteOK, We Work Remotely, Greenhouse, Lever) use **stable,
free, legitimate APIs/feeds** and are the backbone you should rely on and
expand; three sources (LinkedIn, Naukri, Hirist) use **fragile HTML/private-API
scraping** that is free but brittle and, for LinkedIn especially, against the
site's terms — these are the weakest links and should be made optional. The
architecture is the best part and needs no rework. To make it the best *free +
local* solution, fix the missing Celery Beat schedule, stop silently injecting
mock jobs on failure, drive Greenhouse/Lever from a list of companies, add a few
more free JSON-API sources (Remotive, Arbeitnow, HN Who-is-hiring, Adzuna free
tier), and keep the risky scrapers behind a feature flag.
