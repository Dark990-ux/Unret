import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_ORIGIN, getAccessToken } from './api';

let socket: Socket | null = null;
let socketToken: string | null = null;

function getSocket() {
  const token = getAccessToken();
  if (!token) return null;
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  socket = io(`${API_ORIGIN}/realtime`, { auth: { token }, transports: ['websocket'] });
  return socket;
}

export function useRealtime<T = any>(event: string, handler: (p: T) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    if (!s) return;
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => { s.off(event, fn); };
  }, [event, enabled]);
}
