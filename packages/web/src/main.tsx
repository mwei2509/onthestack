import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { GamePage } from './game/GamePage.js';
import { Home } from './pages/Home.js';
import './theme.css';

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/g/:code', element: <GamePage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
