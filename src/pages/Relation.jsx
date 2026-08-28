import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  relations, relationsByName, versions, KIND_LABEL, buildColumnMatrix, lifespan,
  versionLabel, versionTitle, isBetaVersion, docsUrl, docsUrlVersionLabel,
} from '../lib/catalog.js';

export default function Relation() {
  const { name } = useParams();
  const navigate = useNavigate();
  const rel = relationsByName.get(name);

  const life = rel ? lifespan(rel) : null;
  const latestVersion = life?.last || versions[versions.length - 1];
  const [selectedVersion, setSelectedVersion] = useState(latestVersion);

  const matrix = useMemo(() => rel ? buildColumnMatrix(rel) : null, [rel]);

  if (!rel) {
    return (
      <div className="empty">
        <p>Relation <code>{name}</code> not found.</p>
        <p><Link to="/">&larr; Back to index</Link></p>
      </div>
    );
  }

  const versionEntry = rel.byVersion[selectedVersion];
  const docHref = docsUrl(rel);
  const docVerLabel = docsUrlVersionLabel(rel);
  const lastIsLatestStable = life.last &&
    !isBetaVersion(life.last) &&
    versions.slice(versions.indexOf(life.last) + 1).every(isBetaVersion);

  return (
    <>
      <div className="detail-header">
        <div className="detail-title">
          <h2>{rel.name}</h2>
          <div className="meta">
            <span className={`kind-badge kind-${rel.kind}`}>
              {KIND_LABEL[rel.kind]}
            </span>
            &nbsp;·&nbsp;
            {life.first === versions[0]
              ? `Present since ${versions[0]}`
              : `Introduced in PG ${versionLabel(life.first)}`}
            {life.last !== versions[versions.length - 1] &&
              ` · gone after PG ${versionLabel(life.last)}`}
            &nbsp;·&nbsp; {life.all.length} of {versions.length} tracked versions
          </div>
          {docHref && (
            <div className="docs-link">
              <a href={docHref} target="_blank" rel="noopener noreferrer">
                postgresql.org docs
                <span className="docs-link-ver">
                  ({lastIsLatestStable ? 'latest' : `PG ${docVerLabel}`})
                </span>
                <span className="ext" aria-hidden="true"> ↗</span>
              </a>
            </div>
          )}
        </div>
        <div className="detail-controls">
          <RelationCombobox
            currentName={rel.name}
            onPick={r => navigate(`/r/${encodeURIComponent(r.name)}`)}
          />
          <label htmlFor="ver">Version:</label>
          <select
            id="ver"
            value={selectedVersion}
            onChange={e => setSelectedVersion(e.target.value)}
          >
            {versions.map(v => (
              <option key={v} value={v} disabled={!rel.byVersion[v]}>
                PG {versionLabel(v)}{!rel.byVersion[v] ? ' (n/a)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {versionEntry?.description ? (
        <div className="blurb">
          <strong style={{ color: 'var(--fg)' }}>PG {versionLabel(selectedVersion)}:</strong>{' '}
          {versionEntry.description}
        </div>
      ) : (
        <div className="blurb">
          No description recorded for PG {versionLabel(selectedVersion)}.
        </div>
      )}

      <div className="section-title">Column history</div>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type (latest)</th>
              {versions.map(v => (
                <th key={v} className="cell" title={versionTitle(v)}>
                  {versionLabel(v)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.columns.map(colName => {
              const latestType = latestTypeFor(rel, colName);
              return (
                <tr key={colName}>
                  <td className="col-name">{colName}</td>
                  <td className="col-type">{latestType || '—'}</td>
                  {versions.map(v => {
                    const s = matrix.statuses[colName][v];
                    return <MatrixCell key={v} status={s} />;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span><span className="chip" style={{ background: 'rgba(63,185,80,0.55)' }} /> added in this version</span>
        <span><span className="chip" style={{ background: 'rgba(210,153,34,0.55)' }} /> type changed</span>
        <span><span className="chip" style={{ background: 'rgba(248,81,73,0.55)' }} /> removed</span>
        <span><span className="chip" style={{ background: 'var(--same)' }} /> present · unchanged</span>
        <span style={{ opacity: 0.6 }}><span className="chip" style={{ background: 'transparent', border: '1px dashed var(--border-strong)' }} /> relation not present</span>
      </div>

      <div className="section-title">Full column list in PG {versionLabel(selectedVersion)}</div>
      {versionEntry ? (        <div className="version-cols-wrap">
          <table className="version-cols">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {versionEntry.columns.map(c => (
                <tr key={c.name}>
                  <td className="name">{c.name}</td>
                  <td className="type">{c.type || '—'}</td>
                  <td className="desc">{c.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">Relation not present in PG {versionLabel(selectedVersion)}.</div>
      )}
    </>
  );
}

function MatrixCell({ status }) {
  if (!status) return <td className="cell off" />;
  switch (status.state) {
    case 'added':   return <td className="cell added"   title={`added · ${status.type || ''}`}>+</td>;
    case 'removed': return <td className="cell removed" title="removed">×</td>;
    case 'changed': return <td className="cell changed" title={`type → ${status.type}`}>~</td>;
    case 'present': return <td className="cell on"      title={status.type || ''}>•</td>;
    case 'absent':  return <td className="cell off"     title="not in this version">·</td>;
    case 'norel':   return <td className="cell off"     title="relation not present">·</td>;
    default:        return <td className="cell off" />;
  }
}

function latestTypeFor(rel, colName) {
  for (let i = versions.length - 1; i >= 0; i--) {
    const e = rel.byVersion[versions[i]];
    if (!e) continue;
    const c = e.columns.find(x => x.name === colName);
    if (c) return c.type;
  }
  return '';
}

function RelationCombobox({ currentName, onPick }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const wrapRef = useRef(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out = [];
    for (const r of relations) {
      if (r.name === currentName) continue;
      if (needle && !r.name.includes(needle)) continue;
      out.push(r);
    }
    return out;
  }, [query, currentName]);

  useEffect(() => { setCursor(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${cursor}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [cursor, open, results]);

  const pick = r => {
    setOpen(false);
    setQuery('');
    onPick(r);
  };

  const onKeyDown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setCursor(c => Math.min(results.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setCursor(c => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      if (open && results[cursor]) {
        e.preventDefault();
        pick(results[cursor]);
      }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); }
    } else if (e.key === 'Home') {
      if (open) { e.preventDefault(); setCursor(0); }
    } else if (e.key === 'End') {
      if (open) { e.preventDefault(); setCursor(results.length - 1); }
    }
  };

  return (
    <div className="combobox" ref={wrapRef}>
      <label htmlFor="jump" className="combobox-label">Jump to:</label>
      <div className="combobox-field">
        <input
          id="jump"
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="jump-listbox"
          aria-autocomplete="list"
          aria-activedescendant={open && results[cursor] ? `jump-opt-${cursor}` : undefined}
          placeholder="Other relation..."
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="combobox-clear"
            aria-label="Clear"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); setOpen(true); inputRef.current?.focus(); }}
          >×</button>
        )}
      </div>
      {open && (
        <ul
          id="jump-listbox"
          role="listbox"
          className="combobox-list"
          ref={listRef}
        >
          {results.length === 0 ? (
            <li className="combobox-empty">No matches</li>
          ) : results.map((r, i) => (
            <li
              key={r.name}
              id={`jump-opt-${i}`}
              data-idx={i}
              role="option"
              aria-selected={i === cursor}
              className={'combobox-item' + (i === cursor ? ' active' : '')}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={e => { e.preventDefault(); pick(r); }}
            >
              <span className={`swatch dot-${r.kind}`} />
              <span className="combobox-name">
                {highlightMatch(r.name, query)}
              </span>
              <span className="combobox-kind">{KIND_LABEL[r.kind]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function highlightMatch(text, query) {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
