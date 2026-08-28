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

export function isBetaVersion(v) {
  return typeof v === 'string' && v.endsWith('b');
}

export function versionLabel(v) {
  return isBetaVersion(v) ? `${v.slice(0, -1)}β` : v;
}

export function versionTitle(v) {
  return isBetaVersion(v)
    ? `PG ${v.slice(0, -1)} beta (unreleased)`
    : `PG ${v}`;
}

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

// Compute what changed *between the previous tracked version and this one*.
// Returns { newRelations, removedRelations, changedRelations } where
// changedRelations = [{ name, kind, added: [], removed: [], typeChanged: [{name, oldType, newType}] }]
export function diffVersion(version) {
  const idx = versions.indexOf(version);
  const prev = idx > 0 ? versions[idx - 1] : null;
  const newRelations = [];
  const removedRelations = [];
  const changedRelations = [];

  for (const rel of relations) {
    const curr = rel.byVersion[version];
    const before = prev ? rel.byVersion[prev] : null;
    if (curr && !before) {
      if (prev) newRelations.push(rel);
      continue;
    }
    if (!curr && before) {
      removedRelations.push(rel);
      continue;
    }
    if (!curr || !before) continue;

    const byName = new Map(before.columns.map(c => [c.name, c]));
    const added = [];
    const typeChanged = [];
    const currNames = new Set();
    for (const c of curr.columns) {
      currNames.add(c.name);
      const old = byName.get(c.name);
      if (!old) added.push(c);
      else if (old.type && c.type && old.type !== c.type) {
        typeChanged.push({ name: c.name, oldType: old.type, newType: c.type });
      }
    }
    const removed = before.columns.filter(c => !currNames.has(c.name));

    if (added.length || removed.length || typeChanged.length) {
      changedRelations.push({
        name: rel.name,
        kind: rel.kind,
        added,
        removed,
        typeChanged,
      });
    }
  }

  return { prev, newRelations, removedRelations, changedRelations };
}
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
