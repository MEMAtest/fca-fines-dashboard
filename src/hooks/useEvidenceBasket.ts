import { useCallback, useEffect, useState } from "react";
import type { EvidenceCase } from "../utils/evidenceCase.js";

const STORAGE_KEY = "regactions-evidence-basket-v1";
const CHANGE_EVENT = "regactions:evidence-basket-change";
const MAX_ITEMS = 50;

export type EvidenceBasketItem = EvidenceCase;

function readBasket(): EvidenceBasketItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is EvidenceBasketItem =>
          Boolean(item && typeof item.id === "string" && typeof item.regulator === "string"),
        ).slice(0, MAX_ITEMS)
      : [];
  } catch {
    return [];
  }
}
function writeBasket(items: EvidenceBasketItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function useEvidenceBasket() {
  const [items, setItems] = useState<EvidenceBasketItem[]>(readBasket);

  useEffect(() => {
    const refresh = () => setItems(readBasket());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const add = useCallback((item: EvidenceBasketItem) => {
    const current = readBasket();
    writeBasket([item, ...current.filter((existing) => existing.id !== item.id)]);
  }, []);

  const remove = useCallback((id: string) => {
    writeBasket(readBasket().filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => writeBasket([]), []);
  const contains = useCallback(
    (id: string) => items.some((item) => item.id === id),
    [items],
  );

  return { items, add, remove, clear, contains };
}
