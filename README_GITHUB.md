# Pitch Pool on GitHub — hosting + auto-sync, no Netlify 🏆

Everything now runs on GitHub: **Pages** hosts the site, **Actions** runs the score-sync every 30 minutes. Supabase keeps all data — accounts, pools, picks, results carry over untouched. Total: ~10 minutes, free, no credit systems.

---

## Step 1 — Fresh repo (public)

GitHub Pages on a free account needs a **public** repo. That's fine — the only key in the code is the *publishable* one, which is designed to be public. The secret key goes in encrypted GitHub Secrets (step 3), never in files.

1. github.com → **New repository** → name: `pitchpool` → **Public** → Create
   (Your old `pitch-pool` repo: delete it afterwards via its Settings → Danger Zone, or just abandon it.)
2. On the new empty repo: **"uploading an existing file"** → drag in everything from this folder:
   - `index.html`
   - `package.json`
   - the `scripts` folder
   - the `.github` folder ← **important, easy to miss**
   - the `.sql` + `.md` files (reference)
3. **Commit changes.**
4. Verify: the repo should show a `.github` folder. Click into `.github/workflows/` — `sync.yml` should be there.
   - **If `.github` didn't upload** (some browsers skip dot-folders): in the repo click **Add file → Create new file**, type exactly `.github/workflows/sync.yml` as the name (the slashes create the folders), paste the contents of `sync.yml` from this folder, commit.

## Step 2 — Turn on the website (GitHub Pages)

1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → **Save**
3. Wait ~1 minute, refresh the page — it shows your URL:
   **`https://YOURUSERNAME.github.io/pitchpool/`**
4. Open it → sign in → all your pools are there. Send the new link to the group chat.

## Step 3 — Secrets for the sync

Repo → **Settings → Secrets and variables → Actions → New repository secret**, three times:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://hknzllojrfgjdjuqunjk.supabase.co` |
| `SUPABASE_SERVICE_ROLE` | Supabase → Settings → API Keys → Secret keys → `sb_secret_...` |
| `FOOTBALL_DATA_KEY` | your football-data.org token |

(Names must match exactly, all caps.)

## Step 4 — Test the sync

1. Repo → **Actions** tab → if it asks, enable workflows
2. Click **"Sync World Cup results"** (left sidebar) → **Run workflow** → Run
3. ~30 seconds later it should show a green ✓. Click into it → "Run sync" step → you'll see `Sync OK: {"finishedMatches":...,"newlyInserted":...}`
4. Open your site → Tournament tab → synced games sit in the Latest results feed with a ⚡

From now on it runs itself every 30 min. The **Run workflow** button = your "sync right now" button on matchdays.

## Notes

- **Updating the app later:** repo → Add file → Upload files → drag the new `index.html` → commit. Pages republishes in ~1 min.
- **Database changes:** if you haven't run `supabase_update_v2.sql` and `supabase_update_v3.sql` yet, run each once in Supabase → SQL Editor (safe to re-run).
- GitHub pauses *scheduled* workflows after 60 days of zero repo activity — irrelevant during a 6-week tournament.
- Scheduled runs can fire a few minutes late at peak times. Free-tier API data also lags a bit after full-time. For instant gratification: Run workflow button, or record manually (then delete the duplicate when the sync version arrives).
- Netlify site can be deleted once everyone's on the new URL. Nothing of the app lives there.
