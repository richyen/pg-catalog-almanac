import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Home from './pages/Home.jsx';
import Relation from './pages/Relation.jsx';
import VersionChanges from './pages/VersionChanges.jsx';

export default function App() {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
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
