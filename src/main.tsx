import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './router';
import { Analytics } from '@vercel/analytics/react';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppRouter />
    <Analytics />
  </React.StrictMode>
);
