import React from 'react';
import './Header.css';
import { VscChromeMinimize, VscChromeMaximize, VscChromeClose } from "react-icons/vsc";

const Header = () => {
    return (
        <header className="app-header">
            <div className="header-title">
                INDIAN RAILWAYS - SECTION CONTROLLER (GHAZIABAD REGION)
            </div>
            <div className="header-time">
                10:30 AM, 26 NOV, 2024
            </div>
            <div className="window-controls">
                <VscChromeMinimize className="control-icon" />
                <VscChromeMaximize className="control-icon" />
                <VscChromeClose className="control-icon close-icon" />
            </div>
        </header>
    );
};

export default Header;