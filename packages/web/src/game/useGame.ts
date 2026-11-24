import type { DeviceMessage, ServerMessage } from '@onthestack/server/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { afterClaimRefused, afterUpdate, loadMemory, onOpen, saveMemory, type SeatMemory } from './seatMemory.js';

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
}

const RETRY_MS = [500, 1000, 2000, 4000, 8000];

/** One WebSocket to the game (ADR 0055), reconnecting until the page closes, and the seat this browser remembers. */
export function useGame(code: string): GameConnection {
  const [connection, setConnection] = useState<Connection>('connecting');
  const [update, setUpdate] = useState<Update | null>(null);
  const [memory, setMemoryState] = useState<SeatMemory>(() => loadMemory(code));
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const retryNow = useRef<() => void>(() => undefined);
  const memoryRef = useRef(memory);

  const setMemory = useCallback(
    (next: SeatMemory) => {
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

    const connect = async () => {
      if (attempt === 0) {
        const res = await fetch(`/api/games/${encodeURIComponent(code)}`).catch(() => null);
        if (closed) return;
        if (res?.status === 404) return setConnection('missing');
      }
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
      void connect();
    };
    void connect();
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

  return { connection, update, memory, error, send, watch, stopWatching, retry, updatedAt };
}

export interface ScreenProps {
  code: string;
  game: GameConnection;
  update: Update;
}
