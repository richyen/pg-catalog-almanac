import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  versions, diffVersion, KIND_LABEL,
  versionLabel, versionTitle,
} from '../lib/catalog.js';

export default function VersionChanges() {
  const { version } = useParams();
  const navigate = useNavigate();
  const known = versions.includes(version);

  const diff = useMemo(
    () => known ? diffVersion(version) : null,
    [version, known]
  );

  if (!known) {
    return (
      <div className="empty">
        <p>Version <code>{version}</code> isn't tracked.</p>
        <p><Link to="/">&larr; Back to index</Link></p>
      </div>
    );
  }

  const idx = versions.indexOf(version);
  const isFirst = idx === 0;
  const total =
    diff.newRelations.length +
    diff.removedRelations.length +
    diff.changedRelations.length;

  return (
    <>
      <div className="detail-header">
        <div className="detail-title">
          <h2>What changed in PG {versionLabel(version)}</h2>
          <div className="meta">
            {isFirst ? (
              <>Baseline release &mdash; showing the initial relation set tracked here.</>
            ) : (
              <>Diff vs. PG {versionLabel(diff.prev)} &nbsp;·&nbsp; {total} relation{total === 1 ? '' : 's'} affected</>
            )}
          </div>
        </div>
        <div className="detail-controls">
          <label htmlFor="ver">Version:</label>
          <select
            id="ver"
            value={version}
            onChange={e => navigate(`/v/${encodeURIComponent(e.target.value)}`)}
          >
            {versions.map(v => (
              <option key={v} value={v} title={versionTitle(v)}>
                PG {versionLabel(v)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isFirst ? (
        <div className="blurb">
          PG {versionLabel(version)} is the earliest version in this dataset, so
          there's no previous release to diff against. Pick a later version to
          see what was added, removed, or changed.
        </div>
      ) : total === 0 ? (
        <div className="empty">
          No documented schema changes between PG {versionLabel(diff.prev)} and
          PG {versionLabel(version)} in the relations tracked here.
        </div>
      ) : (
        <>
          <SummaryStrip diff={diff} />

          <Section
            title={`New relations (${diff.newRelations.length})`}
            emptyText="No new catalogs, views, or stat views."
            items={diff.newRelations}
            render={r => (
              <li key={r.name}>
                <Link to={`/r/${encodeURIComponent(r.name)}`} className="mono">
                  {r.name}
                </Link>
                <span className={`kind-badge kind-${r.kind}`} style={{ marginLeft: 8 }}>
                  {KIND_LABEL[r.kind]}
                </span>
                <div className="row-summary" style={{ marginTop: 2 }}>
                  {r.byVersion[version]?.description || ''}
                </div>
              </li>
            )}
          />

          <Section
            title={`Removed relations (${diff.removedRelations.length})`}
            emptyText="No relations were dropped."
            items={diff.removedRelations}
            render={r => (
              <li key={r.name}>
                <Link to={`/r/${encodeURIComponent(r.name)}`} className="mono">
                  {r.name}
                </Link>
                <span className={`kind-badge kind-${r.kind}`} style={{ marginLeft: 8 }}>
                  {KIND_LABEL[r.kind]}
                </span>
              </li>
            )}
          />

          <Section
            title={`Column-level changes (${diff.changedRelations.length})`}
            emptyText="No column adds, drops, or type changes."
            items={diff.changedRelations}
            render={c => (
              <li key={c.name} className="change-item">
                <div>
                  <Link to={`/r/${encodeURIComponent(c.name)}`} className="mono">
                    {c.name}
                  </Link>
                  <span className={`kind-badge kind-${c.kind}`} style={{ marginLeft: 8 }}>
                    {KIND_LABEL[c.kind]}
                  </span>
                </div>
                <ul className="change-list">
                  {c.added.map(col => (
                    <li key={'a-' + col.name}>
                      <span className="tag-added">+ added</span>{' '}
                      <span className="mono">{col.name}</span>{' '}
                      <span className="mono" style={{ color: 'var(--fg-dim)' }}>
                        {col.type}
                      </span>
                      {col.description ? (
                        <span className="row-summary"> &mdash; {col.description}</span>
                      ) : null}
                    </li>
                  ))}
                  {c.removed.map(col => (
                    <li key={'r-' + col.name}>
                      <span className="tag-removed">- removed</span>{' '}
                      <span className="mono">{col.name}</span>{' '}
                      <span className="mono" style={{ color: 'var(--fg-dim)' }}>
                        {col.type}
                      </span>
                    </li>
                  ))}
                  {c.typeChanged.map(t => (
                    <li key={'t-' + t.name}>
                      <span className="tag-changed">~ type</span>{' '}
                      <span className="mono">{t.name}</span>{' '}
                      <span className="mono" style={{ color: 'var(--fg-dim)' }}>
                        {t.oldType} &rarr; {t.newType}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            )}
          />
        </>
      )}
    </>
  );
}

function SummaryStrip({ diff }) {
  return (
    <div className="summary-strip">
      <StripStat label="new relations"     value={diff.newRelations.length}     tone="added" />
      <StripStat label="removed relations" value={diff.removedRelations.length} tone="removed" />
      <StripStat
        label="columns added"
        value={diff.changedRelations.reduce((n, r) => n + r.added.length, 0)}
        tone="added"
      />
      <StripStat
        label="columns removed"
        value={diff.changedRelations.reduce((n, r) => n + r.removed.length, 0)}
        tone="removed"
      />
      <StripStat
        label="type changes"
        value={diff.changedRelations.reduce((n, r) => n + r.typeChanged.length, 0)}
        tone="changed"
      />
    </div>
  );
}

function StripStat({ label, value, tone }) {
  return (
    <div className={`strip-stat tone-${tone}`}>
      <div className="strip-value">{value}</div>
      <div className="strip-label">{label}</div>
    </div>
  );
}

function Section({ title, items, render, emptyText }) {
  return (
    <>
      <div className="section-title">{title}</div>
      {items.length === 0 ? (
        <div className="empty" style={{ padding: '18px 0', textAlign: 'left' }}>
          {emptyText}
        </div>
      ) : (
        <ul className="change-section">{items.map(render)}</ul>
      )}
    </>
  );
}
