import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import HomePage from './pages/HomePage';
import WorkspaceApp from './pages/WorkspaceApp';

export default function App() {
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/dashboard/*" element={<WorkspaceApp />} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes>;
}
