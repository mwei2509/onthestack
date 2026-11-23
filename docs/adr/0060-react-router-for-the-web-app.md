# React Router for the web app

Status: Accepted (decided with Melissa, 2026-11-23, in the planning session for #42).

The web app starts with a few pages (home, Decks, a game) and will gain more: accounts, dashboards, saved Decks and past games. It uses React Router (v7, as a library in the Vite single-page app) rather than hand-written routing, which would only last until the second or third page. The Worker already serves the app for any path.

## Considered options

- **TanStack Router:** type-safe routes, but more setup than a few pages need.
- **wouter:** tiny, but thin for nested layouts and data loading later.
- **Hand-written routing:** no dependency, but it would be replaced soon.
