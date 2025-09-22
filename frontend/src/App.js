import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage'; // Your main page
import Header from './components/Header';
import LeftSidebar from './components/LeftSidebar';
import RightSidebar from './components/RightSidebar';
import Footer from './components/Footer';

// This component assembles your main dashboard layout
const DashboardLayout = () => (
  <div className="App-layout">
    <Header />
    <div className="main-body">
      <LeftSidebar />
      <DashboardPage />
      <RightSidebar />
    </div>
    <Footer />
  </div>
);

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<DashboardLayout />} />
    </Routes>
  );
}

export default App;