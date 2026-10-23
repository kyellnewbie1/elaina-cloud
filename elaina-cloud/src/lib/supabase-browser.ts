import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Persist the Supabase auth session in this browser's IndexedDB instead of localStorage.
// Each browser profile/device has its own IndexedDB; Supabase remains the identity provider.
const idbStorage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === "undefined" || !("indexedDB" in window)) return null;
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction("auth", "readonly").objectStore("auth").get(key);
      req.onsuccess = () => { db.close(); resolve(typeof req.result === "string" ? req.result : null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === "undefined" || !("indexedDB" in window)) return;
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("auth", "readwrite"); tx.objectStore("auth").put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
    });
  },
  async removeItem(key: string): Promise<void> {
    if (typeof window === "undefined" || !("indexedDB" in window)) return;
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("auth", "readwrite"); tx.objectStore("auth").delete(key);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
};

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("elaina-user-cache", 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("auth")) db.createObjectStore("auth");
      if (!db.objectStoreNames.contains("feeds")) db.createObjectStore("feeds", { keyPath: "userId" });
      if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const supabase = url && anon ? createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: idbStorage }
}) : null;
