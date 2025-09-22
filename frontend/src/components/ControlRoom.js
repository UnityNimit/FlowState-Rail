// frontend/src/components/ControlRoom.js

import React from 'react';
import './ControlRoom.css';
import Header from './Header';
import LeftSidebar from './LeftSidebar';
import DashboardPage from '../pages/DashboardPage';
import RightSidebar from './RightSidebar';
import Footer from './Footer';

const ControlRoom = () => {
  return (
    <div className="control-room-layout">
      <Header />
      <div className="main-body">
        <LeftSidebar />
        <DashboardPage />
        <RightSidebar />
      </div>
      <Footer />
    </div>
  );
};

export default ControlRoom;