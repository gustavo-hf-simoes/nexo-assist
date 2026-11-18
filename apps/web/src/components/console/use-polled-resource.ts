"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PolledResource<T> {
  data: T | null;
  // A última tentativa falhou (os dados anteriores, se houver, continuam em `data`).
  error: boolean;
  loading: boolean;
  reload: () => Promise<void>;
}

interface Slot<T> {
  url: string | null;
  data: T | null;
  error: boolean;
}

// GET em JSON com polling. Trocar a URL descarta os dados da anterior; respostas atrasadas são ignoradas.
export function usePolledResource<T>(url: string | null, intervalMs = 3000): PolledResource<T> {
  const [slot, setSlot] = useState<Slot<T>>({ url, data: null, error: false });
  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    let latest = 0;
    const load = async (): Promise<void> => {
      latest += 1;
      const mine = latest;
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as T;
        if (!cancelled && mine === latest) setSlot({ url, data, error: false });
      } catch {
        if (!cancelled && mine === latest) setSlot((s) => ({ url, data: s.url === url ? s.data : null, error: true }));
      }
    };
    loadRef.current = load;
    void load();
    const timer = setInterval(() => void load(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  const reload = useCallback(() => loadRef.current(), []);
  const current = slot.url === url;
  const data = current ? slot.data : null;
  const error = current && slot.error;
  return { data, error, loading: url !== null && data === null && !error, reload };
}
