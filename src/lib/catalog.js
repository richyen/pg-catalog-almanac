import catalog from '../data/catalog.json';

export const versions = catalog.versions;              // e.g. ['9.6','10',...,'18']
export const versionTags = catalog.versionTags;
export const relations = catalog.relations;            // sorted by name

export const relationsByName = new Map(relations.map(r => [r.name, r]));

export const KIND_LABEL = {
  catalog: 'System catalog',
  view:    'System view',
  stats:   'Statistics view',
};

export const KIND_ORDER = ['catalog', 'view', 'stats'];

// For each relation, return an array of { version, present } tuples.
export function presence(rel) {
  return versions.map(v => ({
    version: v,
    present: !!rel.byVersion[v],
  }));
}

// Return { firstVersion, lastVersion, ever } from presence.
export function lifespan(rel) {
  const seen = versions.filter(v => rel.byVersion[v]);
  return {
    first: seen[0] || null,
    last: seen[seen.length - 1] || null,
    all: seen,
  };
}

// Build a per-column matrix for a relation:
//   returns { columns: [colName,...], statuses: { [colName]: { [ver]: 'absent'|'present'|'added'|'removed'|'changed', type: string } } }
export function buildColumnMatrix(rel) {
  const columnFirstSeen = new Map();
  const perVersion = new Map();          // ver -> Map(colName -> {type, description})
  for (const v of versions) {
    const entry = rel.byVersion[v];
    if (!entry) continue;
    const map = new Map();
    for (const c of entry.columns) map.set(c.name, c);
    perVersion.set(v, map);
    for (const [name] of map) {
      if (!columnFirstSeen.has(name)) columnFirstSeen.set(name, v);
    }
  }
  // Ordered column list: use latest-version order first, then any names only
  // present in older versions appended at the end.
  const orderedNames = [];
  const seenNames = new Set();
  for (let i = versions.length - 1; i >= 0; i--) {
    const map = perVersion.get(versions[i]);
    if (!map) continue;
    for (const name of map.keys()) {
      if (!seenNames.has(name)) { seenNames.add(name); orderedNames.push(name); }
    }
  }
  // (orderedNames now walks from newest -> reversed later; keep newest layout)
  // Actually we want columns visible in the newest version first; the loop
  // above visits versions from newest to oldest, so that's fine.

  const statuses = {};
  for (const name of orderedNames) {
    statuses[name] = {};
    let prevType = null;
    let prevPresent = false;
    for (const v of versions) {
      const map = perVersion.get(v);
      if (!map) {
        statuses[name][v] = { state: 'norel' };
        continue;
      }
      const col = map.get(name);
      if (!col) {
        // Column absent in this version
        statuses[name][v] = { state: prevPresent ? 'removed' : 'absent' };
        prevPresent = false;
        continue;
      }
      let state = 'present';
      if (!prevPresent) {
        // First presence in a version where the relation exists.
        state = (v === columnFirstSeen.get(name) && v !== versions[0]) ? 'added' : 'present';
        // If the column exists in the very first version we track, count it as
        // pre-existing rather than "added".
      } else if (prevType && col.type && prevType !== col.type) {
        state = 'changed';
      }
      statuses[name][v] = { state, type: col.type };
      prevType = col.type;
      prevPresent = true;
    }
  }

  return { columns: orderedNames, statuses };
}
