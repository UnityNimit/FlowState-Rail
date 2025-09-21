import React from 'react'; // Removed useState as it's no longer needed
import './Footer.css';

const Footer = () => {
    // weatherEnabled state and setWeatherEnabled are removed as the button is removed

    return (
        <footer className="app-footer">
            <div className="footer-status">
                SYSTEM STATUS: <span className="status-ok">OPERATIONAL</span>
            </div>
            <div className="footer-actions">
                {/* Removed the weather button and added the new text */}
                <span className="team-rose-text">Built by Team Rose A</span>
            </div>
        </footer>
    );
};

export default Footer;