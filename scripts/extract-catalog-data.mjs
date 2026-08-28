#!/usr/bin/env node
/*
 * Extract catalog / view / stat-view definitions from the PostgreSQL SGML docs
 * across multiple major-version git tags. Emits src/data/catalog.json.
 *
 * Assumes a PostgreSQL git checkout is available at PG_REPO (default:
 * ../postgres). Uses `git show TAG:path` so it does not mutate the checkout.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const PG_REPO = process.env.PG_REPO
  ? resolve(process.env.PG_REPO)
  : resolve(repoRoot, '..', 'postgres');

if (!existsSync(PG_REPO)) {
  console.error(`PostgreSQL repo not found at ${PG_REPO}`);
  console.error(`Set PG_REPO=/path/to/postgres and retry.`);
  process.exit(1);
}

// Trailing 'b' marks a not-yet-released (beta) major; the extractor picks the
// latest REL_<major>_BETA<n> tag instead of a regular minor release.
//
// The list can be overridden with PG_MAJORS=9.6,10,...,20b or extended
// automatically with PG_AUTO=1 (default).  With PG_AUTO=1 the extractor scans
// all REL_* tags in the repository, keeps every major from PG_MIN_MAJOR
// upward (default 9.6), and appends the latest REL_<next>_BETA tag as
// "<next>b" when that beta major has no released tag yet.
const DEFAULT_MAJORS = ['9.6', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19b'];
const PG_MIN_MAJOR = process.env.PG_MIN_MAJOR || '9.6';
const AUTO = process.env.PG_AUTO !== '0';

let MAJORS;
if (process.env.PG_MAJORS) {
  MAJORS = process.env.PG_MAJORS.split(',').map(s => s.trim()).filter(Boolean);
} else {
  MAJORS = DEFAULT_MAJORS.slice();
}

const SGML_FILES = [
  'doc/src/sgml/catalogs.sgml',
  'doc/src/sgml/system-views.sgml',
  'doc/src/sgml/monitoring.sgml',
];

function git(...args) {
  return execFileSync('git', args, {
    cwd: PG_REPO,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
}

function listTags() {
  return git('tag', '--list').split('\n').filter(Boolean);
}

function pickTagForMajor(major, allTags) {
  if (major.endsWith('b')) {
    const base = major.slice(0, -1);
    return latest(allTags, new RegExp(`^REL_${base}_BETA(\\d+)$`));
  }
  if (major.startsWith('9.')) {
    const [, minor] = major.split('.');
    return latest(allTags, new RegExp(`^REL9_${minor}_(\\d+)$`));
  }
  return latest(allTags, new RegExp(`^REL_${major}_(\\d+)$`));
}

function latest(tags, re) {
  let best = null;
  let bestN = -1;
  for (const t of tags) {
    const m = t.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > bestN) { bestN = n; best = t; }
  }
  return best;
}

// Compare two major strings like "9.6", "10", "18", "19b" for ordering.
function majorRank(m) {
  const base = m.endsWith('b') ? m.slice(0, -1) : m;
  const [maj, min] = base.split('.');
  const suffix = m.endsWith('b') ? -0.5 : 0;   // beta of X ranks just below X
  return parseInt(maj, 10) * 1000 + (min ? parseInt(min, 10) : 0) + suffix;
}

// Discover majors from git tags: every REL9_x_y and REL_XX_y (released), plus
// the latest REL_XX_BETAn where XX has no released tag yet.
function discoverMajors(allTags, minMajor) {
  const minRank = majorRank(minMajor);
  const releasedMajors = new Set();
  const betaMajors = new Set();
  for (const t of allTags) {
    let m;
    if ((m = t.match(/^REL9_(\d+)_\d+$/)))         releasedMajors.add(`9.${m[1]}`);
    else if ((m = t.match(/^REL_(\d+)_\d+$/)))     releasedMajors.add(m[1]);
    else if ((m = t.match(/^REL_(\d+)_BETA\d+$/))) betaMajors.add(m[1]);
  }
  const out = [];
  for (const maj of releasedMajors) {
    if (majorRank(maj) >= minRank) out.push(maj);
  }
  for (const maj of betaMajors) {
    if (!releasedMajors.has(maj) && majorRank(maj) >= minRank) out.push(maj + 'b');
  }
  out.sort((a, b) => majorRank(a) - majorRank(b));
  return out;
}

function safeShow(tag, path) {
  try {
    const raw = execFileSync('git', ['show', `${tag}:${path}`], {
      cwd: PG_REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 512 * 1024 * 1024,
    });
    return normalizeShortTags(raw);
  } catch {
    return null;
  }
}

// SGML shorttag `</>` closes the last-opened element.  Older PG docs
// (through ~PG 10) use it heavily inside catalog/monitoring tables.  Rewrite
// each `</>` to an explicit `</name>` so the rest of the parser can be plain
// regex-based.
function normalizeShortTags(sgml) {
  const stack = [];
  let out = '';
  const re = /<!--[\s\S]*?-->|<\/>|<\/[A-Za-z][^>]*>|<[A-Za-z][^>]*>/g;
  let last = 0;
  let m;
  while ((m = re.exec(sgml)) !== null) {
    out += sgml.slice(last, m.index);
    const tok = m[0];
    last = re.lastIndex;
    if (tok.startsWith('<!--')) { out += tok; continue; }
    if (tok === '</>') {
      const top = stack.pop();
      out += top ? `</${top}>` : '';
      continue;
    }
    if (tok[1] === '/') {
      const name = tok.slice(2, -1).split(/\s/)[0].toLowerCase();
      const idx = stack.lastIndexOf(name);
      if (idx >= 0) stack.length = idx;
      out += tok;
      continue;
    }
    // opening tag
    const inner = tok.slice(1, -1);
    const selfClosing = inner.endsWith('/');
    const name = inner.split(/\s/)[0].toLowerCase();
    // Void elements that never have a close.
    const voidTags = new Set(['xref', 'link', 'primary', 'secondary']);
    if (!selfClosing && !voidTags.has(name)) stack.push(name);
    out += tok;
  }
  out += sgml.slice(last);
  return out;
}

// ---------------------------------------------------------------------------
// SGML utilities
// ---------------------------------------------------------------------------

function stripTags(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Find every <tag id="..." ...>...</tag> block, handling nested tags of the
// same name.  idFilter(id) selects which to return.
function findBlocks(sgml, tag, idFilter) {
  const out = [];
  const openRe = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
  let m;
  while ((m = openRe.exec(sgml)) !== null) {
    const attrs = m[1];
    const idMatch = attrs.match(/\bid="([^"]+)"/i);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (idFilter && !idFilter(id)) continue;
    const bodyStart = openRe.lastIndex;
    const closeRe = new RegExp(`</?${tag}\\b[^>]*>`, 'gi');
    closeRe.lastIndex = bodyStart;
    let depth = 1;
    let end = -1;
    let cm;
    while ((cm = closeRe.exec(sgml)) !== null) {
      if (cm[0][1] === '/') {
        depth--;
        if (depth === 0) { end = cm.index; break; }
      } else {
        depth++;
      }
    }
    if (end === -1) continue;
    out.push({
      id,
      start: m.index,
      bodyStart,
      end,
      body: sgml.slice(bodyStart, end),
    });
  }
  return out;
}

function idToRelation(id) {
  let kind = null;
  let stripped = id;
  if (id.startsWith('catalog-pg-'))         { kind = 'catalog'; stripped = id.slice('catalog-'.length); }
  else if (id.startsWith('view-pg-'))       { kind = 'view';    stripped = id.slice('view-'.length); }
  else if (id.startsWith('monitoring-pg-')) { kind = 'stats';   stripped = id.slice('monitoring-'.length); }
  else if (id.startsWith('pg-stat'))        { kind = 'stats';   stripped = id; }
  else return null;
  stripped = stripped.replace(/-view$/, '');
  const name = stripped.replace(/-/g, '_');
  if (!name.startsWith('pg_')) return null;
  return { name, kind };
}

function extractDescription(body) {
  const paraRe = /<para>([\s\S]*?)<\/para>/gi;
  let m;
  while ((m = paraRe.exec(body)) !== null) {
    const text = stripTags(m[1]);
    if (text.length > 30) return text;
  }
  return '';
}

function extractColumns(body) {
  const cols = [];
  const modernRe = /<entry\s+role="catalog_table_entry"[^>]*>([\s\S]*?)<\/entry>/gi;
  let m;
  let sawModern = false;
  while ((m = modernRe.exec(body)) !== null) {
    sawModern = true;
    const inner = m[1];
    const nameMatch = inner.match(/<structfield>([\s\S]*?)<\/structfield>/i);
    if (!nameMatch) continue;
    const name = stripTags(nameMatch[1]);
    const typeMatch = inner.match(/<type>([\s\S]*?)<\/type>/i);
    const type = typeMatch ? stripTags(typeMatch[1]) : '';
    const paras = [...inner.matchAll(/<para[^>]*>([\s\S]*?)<\/para>/gi)];
    let desc = '';
    if (paras.length >= 2) desc = stripTags(paras[1][1]);
    if (name) cols.push({ name, type, description: desc });
  }
  if (sawModern) return cols;

  const rowRe = /<row>([\s\S]*?)<\/row>/gi;
  while ((m = rowRe.exec(body)) !== null) {
    const rowInner = m[1];
    const entries = [...rowInner.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi)]
      .map(e => e[1]);
    if (entries.length < 3) continue;
    const nameMatch = entries[0].match(/<structfield>([\s\S]*?)<\/structfield>/i);
    if (!nameMatch) continue;
    const name = stripTags(nameMatch[1]);
    const type = stripTags(entries[1]);
    const desc = stripTags(entries[entries.length - 1]);
    if (name) cols.push({ name, type, description: desc });
  }
  return cols;
}

function nearestPrecedingPara(sgml, tableStart) {
  const before = sgml.slice(Math.max(0, tableStart - 4000), tableStart);
  const paras = [...before.matchAll(/<para>([\s\S]*?)<\/para>/gi)];
  for (let i = paras.length - 1; i >= 0; i--) {
    const text = stripTags(paras[i][1]);
    if (text.length > 40) return text;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const allTags = listTags();
if (AUTO && !process.env.PG_MAJORS) {
  MAJORS = discoverMajors(allTags, PG_MIN_MAJOR);
  console.log(`[auto] discovered majors: ${MAJORS.join(', ')}`);
}
const versions = [];
for (const major of MAJORS) {
  const tag = pickTagForMajor(major, allTags);
  if (!tag) { console.warn(`no tag found for major ${major}`); continue; }
  versions.push({ major, tag });
}

const relations = new Map();

function upsert(name, kind, major, entry) {
  let rel = relations.get(name);
  if (!rel) {
    rel = { name, kind, byVersion: {} };
    relations.set(name, rel);
  } else if (rel.kind !== kind) {
    const rank = { catalog: 3, view: 2, stats: 1 };
    if ((rank[kind] || 0) > (rank[rel.kind] || 0)) rel.kind = kind;
  }
  const prior = rel.byVersion[major];
  if (!prior || entry.columns.length > prior.columns.length) {
    rel.byVersion[major] = entry;
  }
}

for (const { major, tag } of versions) {
  console.log(`\n=== ${major}  (${tag}) ===`);
  for (const path of SGML_FILES) {
    const sgml = safeShow(tag, path);
    if (!sgml) { console.log(`  ${path}: absent`); continue; }
    let count = 0;

    for (const tagName of ['sect1', 'sect2']) {
      const blocks = findBlocks(sgml, tagName, id =>
        /^(catalog-pg-|view-pg-|monitoring-pg-)/.test(id)
      );
      for (const b of blocks) {
        const info = idToRelation(b.id);
        if (!info) continue;
        const columns = extractColumns(b.body);
        if (columns.length === 0) continue;
        const description = extractDescription(b.body);
        upsert(info.name, info.kind, major, { description, columns });
        count++;
      }
    }

    if (path.endsWith('monitoring.sgml')) {
      const tableBlocks = findBlocks(sgml, 'table', id => /^pg-stat/.test(id));
      for (const tb of tableBlocks) {
        const info = idToRelation(tb.id);
        if (!info) continue;
        const already = relations.get(info.name)?.byVersion[major];
        if (already && already.columns.length > 0) continue;
        const columns = extractColumns(tb.body);
        if (columns.length === 0) continue;
        const description = nearestPrecedingPara(sgml, tb.start);
        upsert(info.name, info.kind, major, { description, columns });
        count++;
      }
    }

    console.log(`  ${path}: ${count} relations`);
  }
}

const sorted = [...relations.values()].sort((a, b) => a.name.localeCompare(b.name));

const dataset = {
  generatedAt: new Date().toISOString(),
  sourceRepo: PG_REPO,
  versions: versions.map(v => v.major),
  versionTags: Object.fromEntries(versions.map(v => [v.major, v.tag])),
  relations: sorted,
};

const outDir = resolve(repoRoot, 'src', 'data');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'catalog.json');
writeFileSync(outPath, JSON.stringify(dataset, null, 2));

const kinds = sorted.reduce((acc, r) => { acc[r.kind] = (acc[r.kind]||0)+1; return acc; }, {});
console.log(`\nWrote ${sorted.length} relations (${JSON.stringify(kinds)}) across ` +
            `${versions.length} versions -> ${outPath}`);
