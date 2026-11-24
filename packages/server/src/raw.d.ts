// Vite (and so Vitest) imports a file's text with `?raw`; tests use it for fixture files.
declare module '*?raw' {
  const content: string;
  export default content;
}
