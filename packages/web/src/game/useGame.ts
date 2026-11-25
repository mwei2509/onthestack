import type { DeviceMessage, InterpretationRecord, ServerMessage } from '@onthestack/server/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { afterClaimRefused, afterUpdate, loadMemory, onOpen, sameMemory, saveMemory, type SeatMemory } from './seatMemory.js';

export type Update = Extract<ServerMessage, { type: 'update' }>;
export type Connection = 'connecting' | 'open' | 'reconnecting' | 'missing';

export interface GameConnection {
  connection: Connection;
  update: Update | null;
  memory: SeatMemory;
  error: string | null;
  send: (message: DeviceMessage) => void;
  watch: () => void;
  /** Forget being a Shared screen, back to choosing a seat. */
  stopWatching: () => void;
  /** While reconnecting: try again now instead of waiting. */
  retry: () => void;
  /** When the last update arrived, to say how old the board is while offline. */
  updatedAt: Date | null;
  /** The game's last interpretations, newest first, once the debug panel has asked (ADR 0109). */
  debugLog: InterpretationRecord[] | null;
}

const RETRY_MS = [500, 1000, 2000, 4000, 8000];

/** One WebSocket to the game (ADR 0055), reconnecting until the page closes, and the seat this browser remembers. */
export function useGame(code: string): GameConnection {
  const [connection, setConnection] = useState<Connection>('connecting');
  const [update, setUpdate] = useState<Update | null>(null);
  const [memory, setMemoryState] = useState<SeatMemory>(() => loadMemory(code));
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [debugLog, setDebugLog] = useState<InterpretationRecord[] | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const retryNow = useRef<() => void>(() => undefined);
  const memoryRef = useRef(memory);

  const setMemory = useCallback(
    (next: SeatMemory) => {
      if (sameMemory(memoryRef.current, next)) return;
      memoryRef.current = next;
      saveMemory(code, next);
      setMemoryState(next);
    },
    [code],
  );

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let version = 0;

    // A browser can't read why a WebSocket upgrade failed, so a missing game is detected by a plain request, sent
    // alongside the first socket rather than before it.
    void fetch(`/api/games/${encodeURIComponent(code)}`)
      .then((res) => {
        if (res.status !== 404 || closed) return;
        closed = true;
        clearTimeout(timer);
        socket.current?.close();
        setConnection('missing');
      })
      .catch(() => undefined);

    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/games/${encodeURIComponent(code)}/ws`);
      socket.current = ws;
      let heldBefore: string | null = null;
      let claiming = false;

      ws.onopen = () => {
        attempt = 0;
        setConnection('open');
        const first = onOpen(memoryRef.current);
        claiming = first?.type === 'claim';
        if (first) ws.send(JSON.stringify(first));
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as ServerMessage;
        if (message.type === 'error') {
          if (claiming) {
            claiming = false;
            setMemory(afterClaimRefused(memoryRef.current));
            return;
          }
          return setError(message.message);
        }
        if (message.type === 'debugLog') return setDebugLog(message.interpretations);
        if (message.type === 'reported') return;
        if (message.version < version) return;
        version = message.version;
        if (message.you) claiming = false;
        setMemory(afterUpdate(memoryRef.current, message, heldBefore));
        heldBefore = message.you;
        setUpdate(message);
        setUpdatedAt(new Date());
      };
      ws.onclose = () => {
        if (socket.current === ws) socket.current = null;
        if (closed) return;
        setConnection('reconnecting');
        timer = setTimeout(connect, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
      };
    };

    retryNow.current = () => {
      if (socket.current || closed) return;
      clearTimeout(timer);
      connect();
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket.current?.close();
    };
  }, [code, setMemory]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const send = useCallback((message: DeviceMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
    else setError('Not connected. Trying again…');
  }, []);

  const watch = useCallback(() => {
    setMemory('watching');
    send({ type: 'watch' });
  }, [send, setMemory]);

  const stopWatching = useCallback(() => setMemory(null), [setMemory]);

  const retry = useCallback(() => retryNow.current(), []);

  return { connection, update, memory, error, send, watch, stopWatching, retry, updatedAt, debugLog };
}

export interface ScreenProps {
  code: string;
  game: GameConnection;
  update: Update;
}
