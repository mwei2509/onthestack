import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AccountPage } from './account/AccountPage.js';
import { DeckPage } from './decks/DeckPage.js';
import { DecksPage } from './decks/DecksPage.js';
import { ImportPage } from './decks/ImportPage.js';
import { GamePage } from './game/GamePage.js';
import { Home } from './pages/Home.js';
import './theme.css';

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/account', element: <AccountPage /> },
  { path: '/g/:code', element: <GamePage /> },
  { path: '/decks', element: <DecksPage /> },
  { path: '/decks/import', element: <ImportPage /> },
  { path: '/decks/:id', element: <DeckPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
