import React from 'react';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="app-footer">
            <div className="footer-status">
                SYSTEM STATUS: <span className="status-ok">OK</span> | LAST REFRESH: {new Date().toLocaleTimeString()}
            </div>
            <div className="footer-actions">
                <button className="action-btn primary">SET</button>
                <button className="action-btn">CANCEL</button>
                <button className="action-btn">SETTINGS</button>
            </div>
        </footer>
    );
};

export default Footer;