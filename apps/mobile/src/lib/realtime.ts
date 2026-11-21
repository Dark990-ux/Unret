import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_ORIGIN, getAccessToken } from './api';

let socket: Socket | null = null;
let socketToken: string | null = null;
/** Every subscribed handler, so they survive the connection being replaced (e.g. after a token refresh or a new login). */
const handlers = new Map<string, Set<(p: any) => void>>();

function getSocket(): Socket | null {
  const token = getAccessToken();
  if (!token) return null;
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  // auth as a function: automatic reconnects always use the current token.
  socket = io(`${API_ORIGIN}/realtime`, { auth: (cb) => cb({ token: getAccessToken() }), transports: ['websocket'] });
  handlers.forEach((set, event) => set.forEach((fn) => socket!.on(event, fn)));
  return socket;
}

/** Subscribe to a realtime event ("message", "notification", "typing", "read"). */
export function useRealtime<T = any>(event: string, handler: (payload: T) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const fn = (p: T) => ref.current(p);
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(fn);
    getSocket()?.on(event, fn);
    return () => {
      handlers.get(event)?.delete(fn);
      socket?.off(event, fn);
    };
  }, [event, enabled]);
}

/** Send an event to the server (e.g. "typing"). Does nothing while offline. */
export function emitRealtime(event: string, payload: unknown) {
  getSocket()?.emit(event, payload);
}

// In-app signals between screens (e.g. a conversation was read → refresh the Messages badge).
const local = new Map<string, Set<() => void>>();
export function signal(name: string) {
  local.get(name)?.forEach((fn) => fn());
}
export function useSignal(name: string, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const f = () => ref.current();
    if (!local.has(name)) local.set(name, new Set());
    local.get(name)!.add(f);
    return () => { local.get(name)!.delete(f); };
  }, [name]);
}
