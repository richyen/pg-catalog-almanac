import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  relations, versions, KIND_LABEL, KIND_ORDER, lifespan,
} from '../lib/catalog.js';

const KIND_TABS = [
  { key: 'all',     label: 'All' },
  { key: 'catalog', label: 'Catalogs' },
  { key: 'view',    label: 'Views' },
  { key: 'stats',   label: 'Stat views' },
];

export default function Home() {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return relations.filter(r => {
      if (kind !== 'all' && r.kind !== kind) return false;
      if (needle && !r.name.includes(needle)) return false;
      return true;
    });
  }, [kind, q]);

  const counts = useMemo(() => {
    const c = { all: relations.length, catalog: 0, view: 0, stats: 0 };
    for (const r of relations) c[r.kind]++;
    return c;
  }, []);

  return (
    <>
      <header className="page-header">
        <h2>PostgreSQL system catalog changes across versions</h2>
        <p>
          Every table and view under <code>pg_catalog</code> that ships with
          PostgreSQL &mdash; <code>pg_class</code>, <code>pg_stat_activity</code>,
          <code>pg_roles</code>, and the rest &mdash; along with how their
          columns evolved between {versions[0]} and {versions[versions.length - 1]}.
          Click any relation to see what was added, changed, or removed in each
          release.
        </p>
      </header>

      <div className="toolbar">
        <div className="filters">
          {KIND_TABS.map(t => (
            <button
              key={t.key}
              className={kind === t.key ? 'active' : ''}
              onClick={() => setKind(t.key)}
            >
              {t.label} <span style={{opacity: 0.7}}>({counts[t.key]})</span>
            </button>
          ))}
        </div>
        <div className="search">
          <input
            type="search"
            placeholder="Search relations..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">No relations match that filter.</div>
      ) : (
        <div className="relation-grid">
          {filtered.map(r => <RelationCard key={r.name} rel={r} />)}
        </div>
      )}

      <div className="footer-note">
        Data extracted from the <code>doc/src/sgml</code> SGML sources at each
        release tag. This visualizer intentionally focuses on the shape of each
        relation (name, columns, types), not the underlying data.
      </div>
    </>
  );
}

function RelationCard({ rel }) {
  const life = lifespan(rel);
  return (
    <Link to={`/r/${encodeURIComponent(rel.name)}`} className="relation-card">
      <div className="name">
        <span className={`swatch dot-${rel.kind}`} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5 }} />
        {rel.name}
        <span className={`kind-badge kind-${rel.kind}`}>{KIND_LABEL[rel.kind]}</span>
      </div>
      <div className="subtitle">
        {life.first === versions[0]
          ? `Present since ${versions[0]}`
          : `Introduced in ${life.first}`}
        {life.last !== versions[versions.length - 1] && ` · gone after ${life.last}`}
      </div>
      <div className="presence">
        {versions.map(v => {
          const on = !!rel.byVersion[v];
          const isFirst = v === life.first && life.first !== versions[0];
          const isLast = v === life.last && life.last !== versions[versions.length - 1];
          const cls = ['cell'];
          if (on) cls.push('on');
          if (isFirst) cls.push('new');
          if (isLast) cls.push('gone');
          return (
            <span key={v} className={cls.join(' ')} title={`PG ${v}`}>
              {v}
            </span>
          );
        })}
      </div>
    </Link>
  );
}
