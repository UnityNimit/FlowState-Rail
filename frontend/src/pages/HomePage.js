import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

const HomePage = () => {
  return (
    <main className="minimal-home">
      <div className="home-panel">
        <div className="home-badge">MINISTRY OF RAILWAYS · SIH PS 26027</div>
        <h1 className="home-title">FLOWSTATE-RAIL</h1>
        <p className="home-subtitle">
          AUTOMATIC BLOCK SECTION DISPATCH & SECTIONAL INTERLOCKING DIGITAL TWIN
        </p>

        <div className="specs-grid">
          <div className="spec-card">
            <span className="spec-label">OPTIMIZATION ENGINE</span>
            <span className="spec-value">OR-Tools CP-SAT (MIP)</span>
          </div>
          <div className="spec-card">
            <span className="spec-label">INTERLOCKING SPEC</span>
            <span className="spec-value">IR MACLS 4-Aspect / EI</span>
          </div>
          <div className="spec-card">
            <span className="spec-label">CORRIDOR FOCUS</span>
            <span className="spec-value">DLI Yard & DLI-GZB Quad</span>
          </div>
        </div>

        <Link to="/dashboard" className="launch-btn" aria-label="Initialize Dispatch Console">
          INITIALIZE DISPATCH CONSOLE
        </Link>
      </div>
    </main>
  );
};

export default HomePage;