import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  relations, versions, KIND_LABEL, KIND_ORDER,
  versionLabel, versionTitle, isBetaVersion,
} from '../lib/catalog.js';

export default function Sidebar() {
  const [q, setQ] = useState('');
  const location = useLocation();
  const activeName = location.pathname.startsWith('/r/')
    ? decodeURIComponent(location.pathname.slice(3))
    : null;
  const activeVersion = location.pathname.startsWith('/v/')
    ? decodeURIComponent(location.pathname.slice(3))
    : null;

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const groups = { catalog: [], view: [], stats: [] };
    for (const r of relations) {
      if (needle && !r.name.includes(needle)) continue;
      groups[r.kind].push(r);
    }
    return groups;
  }, [q]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1><Link to="/">pg-catalog-almanac</Link></h1>
        <div className="tag">PG {versions[0]} &rarr; {versionLabel(versions[versions.length - 1])}</div>
      </div>
      <div className="sidebar-search">
        <input
          type="search"
          placeholder="Filter relations..."
          value={q}
          onChange={e => setQ(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="sidebar-list">
        <div className="sidebar-group">By version</div>
        <div className="sidebar-versions">
          {versions.map(v => (
            <Link
              key={v}
              to={`/v/${encodeURIComponent(v)}`}
              className={
                'sidebar-version' +
                (v === activeVersion ? ' active' : '') +
                (isBetaVersion(v) ? ' beta' : '')
              }
              title={versionTitle(v) + ' — changelog'}
            >
              {versionLabel(v)}
            </Link>
          ))}
        </div>
        {KIND_ORDER.map(kind => {
          const items = grouped[kind];
          if (items.length === 0) return null;
          return (
            <div key={kind}>
              <div className="sidebar-group">
                {KIND_LABEL[kind]}s <span style={{ color: 'var(--fg-mute)' }}>({items.length})</span>
              </div>
              {items.map(r => (
                <Link
                  key={r.name}
                  to={`/r/${encodeURIComponent(r.name)}`}
                  className={
                    'sidebar-item' + (r.name === activeName ? ' active' : '')
                  }
                >
                  <span className={`swatch dot-${r.kind}`} />
                  {r.name}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
