import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Home from './pages/Home.jsx';
import Relation from './pages/Relation.jsx';
import VersionChanges from './pages/VersionChanges.jsx';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', {
      page_path: window.location.pathname + window.location.search + window.location.hash,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = e => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // Scroll to top on location change
  useEffect(() => {
    mainRef.current.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  }, [location.pathname]);

  return (
    <div className={'app' + (sidebarOpen ? ' sidebar-open' : '')}>
      <div className="topbar">
        <button
          type="button"
          className="hamburger"
          aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={sidebarOpen}
          aria-controls="site-sidebar"
          onClick={() => setSidebarOpen(v => !v)}
        >
          <span className="hamburger-bars" aria-hidden="true">
            <span /><span /><span />
          </span>
        </button>
        <Link to="/" className="topbar-title">pg-catalog-almanac</Link>
      </div>
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar id="site-sidebar" open={sidebarOpen} />
      <main className="main" ref={mainRef}>
        <div className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/r/:name" element={<Relation />} />
            <Route path="/v/:version" element={<VersionChanges />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
