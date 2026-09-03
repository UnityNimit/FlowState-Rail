import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

const HomePage = () => {
  return (
    <div className="minimal-home">
      <Link to="/dashboard" className="launch-text">
        Launch
      </Link>
    </div>
  );
};

export default HomePage;
