import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { ApiState } from "./types";

export function useApi<T>(path: string | null, fallback: T): ApiState<T> & { reload: () => Promise<T | null> } {
  const [state, setState] = useState<ApiState<T>>({ data: fallback, loading: Boolean(path), error: null });

  const load = useCallback(async (cancelled?: () => boolean) => {
    if (!path) return null;
    setState(current => ({ ...current, loading: true, error: null }));
    try {
      const data = await api<T>(path);
      if (!cancelled?.()) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (!cancelled?.()) setState({ data: fallback, loading: false, error: error instanceof Error ? error.message : "Erreur API" });
      throw error;
    }
    // IMPORTANT: "fallback" est volontairement exclu des dépendances.
    // Il est très souvent passé comme littéral inline par le composant appelant.
    // "fallback" n'est utilisé qu'en cas d'erreur ou à l'état initial, il n'a pas besoin
    // de déclencher un nouveau fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    load(() => cancelled).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path, load]);

  return { ...state, reload: () => load() };
}

export function useSessionFilters<T extends Record<string, string>>(key: string, initial: T) {
  const [filters, setFilters] = useState<T>(() => {
    const saved = sessionStorage.getItem(key);
    return saved ? { ...initial, ...JSON.parse(saved) } : initial;
  });

  function update(next: Partial<T>) {
    setFilters(current => {
      const value = { ...current, ...next };
      sessionStorage.setItem(key, JSON.stringify(value));
      return value;
    });
  }

  function reset() {
    setFilters(initial);
    sessionStorage.removeItem(key);
  }

  return { filters, update, reset };
}
