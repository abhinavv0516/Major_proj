import { useEffect, useRef, useState } from 'react';
import { streamUrl } from '../services/api';

/**
 * Subscribes to the backend's Server-Sent Events stream (GET /api/stream).
 * Returns the newest scored transactions first and whether the stream is connected.
 * `onEvent` fires for every new transaction (e.g. to refresh KPIs or show a toast).
 */
export default function useLiveFeed({ max = 25, onEvent } = {}) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  useEffect(() => { handler.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    let source;
    let failures = 0;
    let retryTimer;
    let closed = false;

    const connect = () => {
      source = new EventSource(streamUrl());
      source.addEventListener('ready', () => { failures = 0; setConnected(true); });
      source.addEventListener('transaction', (e) => {
        try {
          const tx = JSON.parse(e.data);
          setEvents((prev) => [tx, ...prev.filter((p) => p.id !== tx.id)].slice(0, max));
          handler.current?.(tx);
        } catch { /* ignore malformed event */ }
      });
      source.onerror = () => {
        // The server closes each stream every ~30s and the browser reconnects on its own,
        // so one error is normal. Only report/act when reconnects keep failing.
        failures += 1;
        if (failures >= 2) setConnected(false);
        if (failures >= 5 && !closed) {
          source.close();
          retryTimer = setTimeout(() => { failures = 0; connect(); }, 15000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [max]);

  return { events, connected };
}
