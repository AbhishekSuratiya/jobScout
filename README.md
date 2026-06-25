# JobScout

Search many job boards at once, then filter the results down to the roles that
**actually** match — including a strict "the job title must contain this" filter
so a *React Native* search returns only real React Native jobs, not the noise
LinkedIn usually gives you.

## Architecture

A browser app can't scrape job sites directly (CORS + anti-bot), so this is two
small parts that run together locally:

```
React + Vite (5173)  ──/api proxy──►  Express API (5174)
   filter UI                              collectors ─► public job APIs/feeds
```

- **Frontend** (`src/`) — the filter UI and results list. No scraping happens here.
- **Backend** (`server/`) — fetches from each selected source, normalizes every
  posting into one common `Job` shape, then applies all filters server-side.

### Sources (collectors)

The source registry in [`server/sources/index.ts`](server/sources/index.ts) *is*
the factory — adding a board = adding one entry. Two reliability tiers:

| Tier | Sources | How |
|------|---------|-----|
| **stable** | Remotive, RemoteOK, Arbeitnow, Jobicy, We Work Remotely | Public JSON APIs / RSS — free, legal, dependable |
| **fragile** | LinkedIn, Naukri | Best-effort scrapes; noisy, slower, ToS-exposed, never block the run |

**Naukri** has no public API and is shielded by Akamai bot protection, so its
collector drives a headless Chromium (Playwright) to load the real search page,
let Naukri's own JS clear the bot check, and intercepts the internal
`/jobapi/v3/search` JSON. It needs the one-time browser install (below) and is
slower than the API sources.

This mirrors the recommendation in `SCRAPING_ANALYSIS.md`: lean on public
APIs/feeds, treat HTML scrapers as optional. Each source is isolated — one
failing board never breaks the others.

### Results: one section per portal

Results are grouped into a **tab per job board** (Naukri, LinkedIn, Remotive, …),
each with its own count. Scrolling to the bottom of a tab **auto-loads the next
page** for sources that paginate (LinkedIn, Naukri, Arbeitnow); a "Load more"
button is the manual fallback. Sources that return their whole batch in one call
(RemoteOK, Remotive, Jobicy, We Work Remotely) show everything on the first page.

> Scrapers can't list "all jobs" — they need a search term. If the keyword box is
> empty, the backend falls back to your skills, then the title filter, so an empty
> search no longer silently defaults to one hardcoded keyword.

### Filters (all applied locally in [`server/filters.ts`](server/filters.ts))

- **Title must include** — the headline feature. Every term must literally appear
  in the job *title*, guaranteeing real matches.
- **Skills** (match any/all), **Remote only**, **Frontend roles**
- **Salary floor**, **Posted within** (freshness), **Min/Max experience**
  (years auto-parsed from the description)

## Running

```bash
npm install
npx playwright install chromium   # one-time, only needed for the Naukri source
npm run dev                        # starts both Vite (5173) and the API (5174)
```

Open http://localhost:5173. Pick portals from the **Job portals** dropdown,
set filters, and click **Search jobs**.

Other scripts: `npm run web` (frontend only), `npm run server` (API only),
`npm run build`, `npm run lint`.

> The API listens on `API_PORT` (default `5174`) — kept separate from `PORT` so a
> dev harness injecting `PORT` for Vite can't collide the two.
