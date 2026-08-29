# Renaming the app

The name was `Plateload` and is now `Plated`. It may not stay `Plated`. This is
the list of everywhere it lives, written down while doing it once so the next
one is a single pass.

Most of the app reads the name from one constant. The rest are files no bundler
touches, plus two things outside the repo entirely.

## 1. The constant

`src/lib/brand.ts` exports `APP_NAME`, `APP_WORDMARK` and `APP_SLUG`. Editing
`APP_NAME` is the whole change for:

- every page `<title>` (15 routes)
- the sign-in and sign-up wordmark
- the filename of a data export (`plated-2026-08-19.json`)

Nothing else needs touching for those. That is the point of the file.

## 2. Static files the constant cannot reach

Four files are read by tooling or the browser before any JavaScript runs, so
they carry the name literally. All four are one line each:

| File | Line | What it affects |
|---|---|---|
| `package.json` | `"name"` | npm package identity. Cosmetic — the package is private. |
| `wrangler.toml` | `name` | **The deployed Worker's name, and therefore its URL.** See below. |
| `static/manifest.webmanifest` | `name`, `short_name` | The label under the icon on an Android home screen. |
| `src/app.html` | `apple-mobile-web-app-title` | The same label on iOS, which ignores the manifest. |

## 3. Local tooling

`.claude/launch.json` names the dev-server config. It is what `preview_start`
is called with, so a rename means restarting the preview under the new name.
No effect on the app.

## 4. Deliberately left alone

Two occurrences of `plateload` survive on purpose. Both are commented in place.

**`DB_NAME` in `src/lib/client/session.ts`** — the IndexedDB key holding the
active session and the offline outbox. Renaming it does not migrate the data,
it abandons it: anyone mid-workout when the new version loads loses the sets
they have logged. The name is invisible to users. Leave it unless you are
willing to write the migration, in which case: open the old database, copy
`active_session` and `outbox` across, then `indexedDB.deleteDatabase`.

**`database_name` in `wrangler.toml`** — this must match what the D1 database
is actually called in Cloudflare. `database_id` is what binds at runtime, so a
mismatch here breaks nothing, it just makes the config lie about which database
it means. To change it, rename the database in the Cloudflare dashboard first,
then update this line. Changing it locally on its own also risks re-keying the
miniflare sqlite file under `.wrangler/state/`, which is where the local dev
data lives.

## 5. Outside the repo

**The Worker name change is not free.** `wrangler.toml`'s `name` is the
deployment identity. Deploying under a new one creates a *new* Worker at
`<name>.<subdomain>.workers.dev` and leaves the old Worker running at the old
URL, serving the old build, forever, until it is deleted by hand. So a rename
means:

1. Deploy under the new name.
2. Check the new URL serves the app and the D1 binding resolved.
3. Move any custom domain or route to the new Worker.
4. Delete the old Worker.

Anyone with the old URL bookmarked or the old PWA installed keeps hitting the
old origin until step 4, and an origin change means their IndexedDB and their
session cookie do not come with them — they will be signed out and any
in-progress offline session is stranded. That is the real cost of a rename, and
it is worth being settled on a name before paying it.

**GitHub.** The repository was renamed to `plated` in the web UI; GitHub keeps
redirecting the old URL, which is why `git remote -v` can disagree with reality
without anything breaking. Set it straight with:

```
git remote set-url origin https://github.com/kdwilich/<new-name>.git
```

**The working directory** is `/Volumes/home/docker/plateload`. Renaming it is a
`mv` outside the repo's control, and it would invalidate the absolute paths in
`.claude/settings.local.json` and in the historical plan documents under
`docs/superpowers/`. Not worth doing for a name that is not settled.

**Historical documents.** `docs/superpowers/plans/` and `specs/` are dated
records of work that was done under the old name, with the old paths, against
the old URLs. They are deliberately not rewritten — a plan from August 16 that
claims to have been executed in a directory that did not exist then is worse
than one that reads slightly stale.

## 6. Checking the work

```
grep -rniI '<old-name>' . \
  --exclude-dir=node_modules --exclude-dir=.svelte-kit \
  --exclude-dir=.wrangler --exclude-dir=.git \
  --exclude-dir=docs --exclude=package-lock.json
```

After a clean rename this returns exactly two lines: the `DB_NAME` constant and
`database_name`, both from section 4. Anything else is a miss.

Then `npm test` and `npx svelte-check` — neither asserts on the name, but the
brand import is real code and a bad edit to it breaks the build.
