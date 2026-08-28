import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  relations, relationsByName, versions, KIND_LABEL, buildColumnMatrix, lifespan,
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
              : `Introduced in PG ${life.first}`}
            {life.last !== versions[versions.length - 1] &&
              ` · gone after PG ${life.last}`}
            &nbsp;·&nbsp; {life.all.length} of {versions.length} tracked versions
          </div>
        </div>
        <div className="detail-controls">
          <label htmlFor="jump">Jump to:</label>
          <select
            id="jump"
            onChange={e => {
              const v = e.target.value;
              if (v) navigate(`/r/${encodeURIComponent(v)}`);
            }}
            value=""
          >
            <option value="">Other relation...</option>
            {relations.map(r => (
              <option key={r.name} value={r.name}>
                {r.name}  ({KIND_LABEL[r.kind]})
              </option>
            ))}
          </select>
          <label htmlFor="ver">Version:</label>
          <select
            id="ver"
            value={selectedVersion}
            onChange={e => setSelectedVersion(e.target.value)}
          >
            {versions.map(v => (
              <option key={v} value={v} disabled={!rel.byVersion[v]}>
                PG {v}{!rel.byVersion[v] ? ' (n/a)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {versionEntry?.description ? (
        <div className="blurb">
          <strong style={{ color: 'var(--fg)' }}>PG {selectedVersion}:</strong>{' '}
          {versionEntry.description}
        </div>
      ) : (
        <div className="blurb">
          No description recorded for PG {selectedVersion}.
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
                <th key={v} className="cell">{v}</th>
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

      <div className="section-title">Full column list in PG {selectedVersion}</div>
      {versionEntry ? (
        <div className="version-cols-wrap">
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
        <div className="empty">Relation not present in PG {selectedVersion}.</div>
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
