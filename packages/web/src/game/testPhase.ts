import { useEffect, useState } from 'react';

let known: Promise<boolean> | null = null;

/** Whether the test phase is on (ADR 0116), asked of the server once per page load. */
function testPhase(): Promise<boolean> {
  known ??= fetch('/api/health')
    .then(async (res) => (res.ok ? ((await res.json()) as { testPhase?: boolean }) : {}))
    .then((body: { testPhase?: boolean }) => body.testPhase === true)
    .catch(() => false);
  return known;
}

export function useTestPhase(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void testPhase().then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, []);
  return on;
}
