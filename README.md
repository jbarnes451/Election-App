# Election Night 2026 — Pick 'Em

A broadcast-style, mobile-friendly election prediction game built for **GitHub Pages + Supabase**. Choose winners by clicking states on a U.S. map, compare with friends, and watch points update as the host records winners.

**No npm installation or build step is required.** GitHub Pages serves the files as-is.

## What's included

- Interactive, offline-bundled SVG map of all 50 states (the 30 states with your game races are highlighted; Alaska and Hawaii appear in insets).
- **41 House contests + 13 Senate contests**, copied from the finalized scorecard. No extra races were added.
- Race-specific points: **3 (toss-up), 2 (lean), or 1 (other)**, as recorded in the finalized game document.
- **10 extra points** for predicting the exact complete Senate split (Democratic caucus, including aligned independents, versus Republicans; totals must add to 100).
- **House-seat tiebreaker** for players tied on points: smallest `abs(predicted D − final D) + abs(predicted R − final R)`, out of 435 seats.
- Host-managed lock, race winner entry, and final chamber totals. Only a database-designated host can change results.
- Player accounts, named leaderboard, privacy before lock, and automatic refresh about every **15 seconds**.
- Guest sign-in for casual play (no email required) and optional passwordless email sign-in.
- Local demo mode that works immediately, before you configure a database. **Demo mode is not multiplayer**; data stays in the current browser.

## 1. Preview it locally

From this folder:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Until `config.js` is configured, the game is in **LOCAL DEMO MODE**, with a sample host and friend you can switch between from the account menu. Try making picks, saving seat forecasts, locking, and reporting results.

> Do not open `index.html` as a `file://` URL. The app loads local JSON/SVG modules over HTTP.

## 2. Create the shared database

1. Create a project in [Supabase](https://supabase.com/dashboard).
2. In the Supabase dashboard, open **SQL Editor**. Run the entire contents of [`supabase/schema.sql`](supabase/schema.sql). It creates the tables and row-level security policies.
3. In SQL Editor, run [`supabase/seed.sql`](supabase/seed.sql). It enters exactly 54 races and their candidates into the database.
4. Go to **Authentication → Providers / Settings** and **enable Anonymous Sign-Ins**. This makes **Join instantly as a guest** work without configuring an email server.
5. Go to **Project Settings → API Keys** (or **Connect**) and get your **Project URL** and **publishable key** (`sb_publishable_...`, or a legacy `anon` key).
6. Open [`config.js`](config.js) and set:

```js
window.ELECTION_APP_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabasePublishableKey: 'YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY',
};
```

**Security:** The publishable/anon key is intended to be used in a browser. **Never** put a service-role key or `sb_secret_...` key in `config.js`, GitHub, or any client-side file. `schema.sql` activates row-level security so players can edit only their own un-locked picks, and only the host can enter results.

### Optional: Email sign-in that works across devices

The app also offers passwordless email sign-in. If you want that, configure **a custom SMTP sender** in **Supabase → Authentication → SMTP Settings**. Supabase's default SMTP can only send to members of your Supabase organization's team and has a very low delivery limit, so it **will not work for ordinary friends' addresses**. Guest sign-in works without SMTP but relies on browser storage; if someone signs out, clears browser data, or switches devices, they lose access to that guest identity.

Consider using CAPTCHA / bot protection in Supabase if you share the link widely, since anonymous sign-ups can be abused.

## 3. Set the host / administrator

This is a deliberate manual step. No user can promote themselves to host from the website.

1. **Before sharing the link**, open your configured website and click **Join instantly as a guest** (or use email sign-in if you've set up SMTP).
2. Create your player name. Open the account menu in the top right and click **Copy my player ID (host setup)**.
3. Open Supabase → SQL Editor, and run this, replacing the placeholder with the ID you copied:

```sql
insert into public.admins (user_id)
values ('PASTE-YOUR-PLAYER-UUID-HERE')
on conflict (user_id) do nothing;
```

4. Refresh your game page. The **HOST CONTROL** tab will appear.

**Important for guest hosts:** Keep the same browser and don't sign out. An anonymous/guest identity cannot be recovered on another browser. If you lose access, log in with a new identity and grant that new user ID admin privileges with the same SQL statement. For a durable host account, set up email authentication instead.

## 4. Publish the site on GitHub Pages

1. Create a **public GitHub repository** (for example, `election-night-pickem`).
2. Upload **the contents of this folder** to the root of that repository. `index.html` must be at the repository root, not nested inside another directory.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, set **Source → Deploy from a branch**, select `main` and `/(root)`, and save.
5. GitHub Pages publishes the game at a URL like:

   `https://YOUR-USERNAME.github.io/election-night-pickem/`

6. In Supabase go to **Authentication → URL Configuration**. Set **Site URL** to the exact GitHub Pages URL above and add that URL to **Redirect URLs**. If you test locally with email authentication, also add `http://localhost:8080/`.
7. Visit the GitHub Pages URL. If it's still in local demo mode, confirm that `config.js` contains the correct public URL and key, and that your latest commit was published.
8. Share your page link with friends. They each choose **Join instantly as a guest**, enter a nickname, and start picking. Have them use the same browser for the event.

> GitHub Pages hosts the front end only. Supabase stores picks, user names, locks, results, and forecasts. Hosting the static site does **not** automatically create a database; steps 2–3 are required for a shared game.

## 5. Run your election-night game

1. Before results, tell everyone to submit the **54 race picks** and both **final chamber predictions** in the **Seat Predictions** tab.
2. In **Host Control**, click **Lock all picks**. After this, picks and seat predictions can't be changed. Friends' submitted picks become visible across the shared leaderboard.
3. As each race is called, use the **Declare the winners** controls on the host tab to choose the correct winner (or reset it to `NOT CALLED` to clear a mistaken entry).
4. The game computes each person's correct-race points and updates the shared leaderboard, usually within **15 seconds** of the latest result (or immediately when they refresh).
5. When known, type the final **Democratic caucus Senate seats** (the Republican total is calculated as `100 − D`) and **Democratic House seats** (`435 − D`). You can leave an unknown chamber blank until all its seats are settled.
6. The game awards the **10-point Senate bonus** only for a completely exact Senate split. On a points tie, the smallest total House seat-count error wins. The winner banner becomes **FINAL** only after all 54 races and both final chamber totals are entered.

**Lock protection:** The database prevents un-locking once results have been entered. If the host must reopen picks, clear **all** race results and both final chamber totals first, then unlock. This prevents edits after outcomes are known.

## File layout

| File | Purpose |
| --- | --- |
| `index.html` / `styles.css` | Responsive visual interface |
| `app.mjs` | Map interactions, ballots, standings and host controls |
| `backend.mjs` | Supabase + browser-only demo storage adapters |
| `scoring.mjs` | Pure scoring, Senate bonus, House tiebreaker |
| `races.json` | All 54 game races and the approved point values |
| `assets/us-map.svg` | Offline US state geometry |
| `config.js` | Your public Supabase connection details |
| `supabase/schema.sql` | Tables, access grants and RLS policies |
| `supabase/seed.sql` | Database seed with race options |
| `tests/scoring.test.mjs` | Automated scoring/roster tests |

Test the scoring rules with Node.js (version 20 or newer):

```bash
node --test tests/scoring.test.mjs
```

## Editing the race roster

The shipped data is the scorecard you finalized. `races.json` defines the browser's matchups and point values, and `supabase/seed.sql` defines the same list in the database. **If you change a candidate name, point value or race ID, update both files consistently.** Do not change a race ID after friends have submitted picks, or their stored predictions will no longer match.

## Troubleshooting

- **Game shows LOCAL DEMO MODE on GitHub:** `config.js` is blank or the latest file hasn't been published. Shared mode activates when both Supabase values are filled in.
- **Error: Email address not authorized:** Your Supabase default mail server cannot reach ordinary friends. Use guest sign-in or set up custom SMTP.
- **Anonymous sign-in not allowed:** Enable Anonymous Sign-Ins in Supabase Authentication settings.
- **No Host Control tab:** Copy your player ID, insert it into `public.admins` using SQL Editor, then refresh.
- **Race winner controls are disabled:** Lock picks first.
- **Cannot unlock:** Clear all entered race winners and final chamber totals first.
- **Unauthorized / permission denied:** Check that both SQL scripts were run in order, and that you are logged in. Never solve this by disabling row-level security.
- **Leaderboard hasn't changed:** Wait 15 seconds or refresh. Check that you saved the actual winner in Host Control.
- **Can't recover guest after changing devices:** Guest sessions are device-specific. For accounts across devices, enable email login and custom SMTP.

## References

- [GitHub Pages: publishing from a branch](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Supabase: anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase: row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: email / SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase: redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
