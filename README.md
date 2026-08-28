# pg-catalog-almanac

A tiny web app that visualizes how PostgreSQL's `pg_catalog` schema — the
system catalogs (`pg_class`, `pg_am`, `pg_proc`, …), the system views
(`pg_roles`, `pg_locks`, `pg_indexes`, …), and the statistics views
(`pg_stat_activity`, `pg_stat_replication`, `pg_stat_io`, …) — has evolved
across PostgreSQL major versions.

Track when a column was added, when its type changed, and when a whole
relation first appeared. Great for extension authors, DBAs writing
version-portable queries, and anyone who's ever wondered "wait, does
`pg_stat_activity.leader_pid` exist in 12?"

![screenshot placeholder](docs/screenshot.png)

## What's inside

- **Home page** — every relation grouped by kind (catalog / view / stat view),
  with tiny per-version presence chips.
- **Relation detail** — a matrix of columns × versions with add / change /
  remove highlights, plus the full column list at any version you pick from
  the version dropdown. The description blurb comes from the PostgreSQL SGML
  docs at that version.
- **Sidebar navigator** — searchable, always-visible list of every relation.
- Data is generated once at build time from the PostgreSQL SGML source at each
  release tag (`REL_18_6`, `REL_17_11`, …, `REL9_6_24`) and shipped as a
  single JSON file — no backend required.

## Data source

`scripts/extract-catalog-data.mjs` walks a local checkout of the PostgreSQL
git repository, does `git show TAG:doc/src/sgml/catalogs.sgml` (etc.) for each
release tag, parses out every `<sect1 id="catalog-...">`, `<sect1 id="view-...">`,
and `<sect2 id="monitoring-...">` block (plus legacy `<table id="pg-stat-...">`
tables for pre-13), and emits `src/data/catalog.json`.

To refresh the dataset:

```sh
# Point at your postgres checkout (default: ../postgres):
PG_REPO=/path/to/postgres npm run extract
```

The tracked major versions and the tag chosen for each are recorded in the
generated file's `versionTags` key.

## Quick start

### Docker (recommended)

```sh
docker compose up --build
# open http://localhost:8080
```

### Local dev

```sh
npm install
npm run extract        # generates src/data/catalog.json (needs ../postgres checkout)
npm run dev            # http://localhost:5173
```

## Project layout

```
scripts/extract-catalog-data.mjs   # SGML parser -> src/data/catalog.json
src/data/catalog.json              # pre-generated dataset (committed)
src/lib/catalog.js                 # matrix / lifespan helpers
src/pages/Home.jsx                 # relation index
src/pages/Relation.jsx             # per-relation history view
src/components/Sidebar.jsx         # navigator
Dockerfile / nginx.conf            # production image
```

## License

MIT
