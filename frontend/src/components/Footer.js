import React, { useState } from 'react';
import './Footer.css';

const Footer = () => {
    const [weatherEnabled, setWeatherEnabled] = useState(true);

    return (
        <footer className="app-footer">
            <div className="footer-status">
                SYSTEM STATUS: <span className="status-ok">OPERATIONAL</span>
            </div>
            <div className="footer-actions">
                <button 
                    className={`weather-btn ${weatherEnabled ? 'enabled' : ''}`}
                    onClick={() => setWeatherEnabled(!weatherEnabled)}
                >
                    {weatherEnabled ? 'Weather AI Enabled' : 'Weather AI Disabled'}
                </button>
            </div>
        </footer>
    );
};

export default Footer;