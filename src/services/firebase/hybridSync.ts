// Hybrid sync engine — localStorage + Firestore.
// Ported from App.jsx:330-515, adapted for Zustand.
//
// This provides a hook that syncs data bidirectionally:
// 1. Local state (React) ← → localStorage (immediate)
// 2. localStorage ← → Firestore (debounced, per-user)
//
// When Firestore is unavailable or permissions are denied,
// falls back gracefully to localStorage-only mode.
//
// ECHO SUPPRESSION STRATEGY:
// Firestore's onSnapshot fires for both remote AND local writes.  When we
// write a value via setDoc, the SDK immediately fires the local listener,
// and later fires again when the server confirms.  During a drag gesture
// (many rapid writes), the debounce coalesces intermediate values so only
// the latest is sent — but the server may echo back earlier writes after
// the fence has dropped.
//
// We use a three-layer approach:
//   1. Write fence — suppress ALL snapshots while writes are pending/in-flight
//   2. Sent payloads set — remember every payload we've flushed to Firestore
//      and suppress any snapshot that matches (catches delayed server echoes)
//   3. lastKnownPayloadRef — the original single-value check (catches the
//      common case where the echo matches the most recent local value)

import { useRef, useEffect, useCallback, useState } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, APP_ID } from '../../config/firebase';
import { HYBRID_SYNC_DEBOUNCE_MS } from '../../config/constants';
import {
  canUseFirestore,
  isPermissionDeniedError,
  shouldDisableFirestore,
  disableFirestore,
  warnFirestoreOnce,
  handleFirestoreListenerError,
} from './firestore';
import { useAuthStore } from '../../stores/authStore';

/**
 * Hook that provides hybrid localStorage + Firestore sync.
 * Returns [data, setData] similar to useState.
 */
export function useHybridState<T>(
  key: string,
  initialValue: T,
  collectionName: string,
): [T, (valueOrFn: T | ((prev: T) => T)) => void] {
  const [data, setData] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      const parsed = item ? JSON.parse(item) : initialValue;
      if (!parsed) return initialValue;
      if (Array.isArray(initialValue) && !Array.isArray(parsed)) return initialValue;
      return parsed as T;
    } catch {
      return initialValue;
    }
  });

  const user = useAuthStore((s) => s.user);
  const dataRef = useRef(data);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeInFlightRef = useRef(false);
  const hasPendingRemoteWriteRef = useRef(false);
  const pendingRemotePayloadRef = useRef<string | null>(null);
  const lastKnownPayloadRef = useRef<string | null>(null);
  const remoteAccessDeniedRef = useRef(false);
  const unmountedRef = useRef(false);
  const writeVersionRef = useRef(0);

  // Set of all payloads we've sent to Firestore recently.  Used to detect
  // delayed server echoes that arrive after the write fence has dropped.
  // Entries auto-expire after 5 seconds to avoid unbounded memory growth.
  const sentPayloadsRef = useRef<Set<string>>(new Set());
  const sentPayloadTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }
      // Clean up sent payload timers
      for (const timer of sentPayloadTimersRef.current.values()) {
        clearTimeout(timer);
      }
      sentPayloadTimersRef.current.clear();
      sentPayloadsRef.current.clear();
    };
  }, []);

  const canUseRemoteSync = useCallback(
    () => canUseFirestore() && !remoteAccessDeniedRef.current,
    [],
  );

  const markRemoteAccessDenied = useCallback(
    (context: string, err: unknown) => {
      if (remoteAccessDeniedRef.current) return;
      remoteAccessDeniedRef.current = true;
      hasPendingRemoteWriteRef.current = false;
      pendingRemotePayloadRef.current = null;
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }
      warnFirestoreOnce(
        `hybrid-permission:${collectionName}/${key}`,
        `Firestore access denied for ${collectionName}/${key}. Using localStorage-only for this key in this session.`,
        { context, error: err },
      );
    },
    [collectionName, key],
  );

  /** Track a payload we've sent to Firestore, with auto-expiry. */
  const trackSentPayload = useCallback((payload: string) => {
    sentPayloadsRef.current.add(payload);
    // Clear any existing timer for this payload and set a new one
    const existing = sentPayloadTimersRef.current.get(payload);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      sentPayloadsRef.current.delete(payload);
      sentPayloadTimersRef.current.delete(payload);
    }, 5000); // 5s — well beyond any realistic Firestore round-trip
    sentPayloadTimersRef.current.set(payload, timer);
  }, []);

  const flushRemoteWrite = useCallback(async () => {
    if (writeInFlightRef.current) return;
    if (!user || !canUseRemoteSync()) return;
    if (!hasPendingRemoteWriteRef.current) return;
    const payload = pendingRemotePayloadRef.current;
    if (typeof payload !== 'string') return;

    writeInFlightRef.current = true;
    hasPendingRemoteWriteRef.current = false;
    const versionAtFlushStart = writeVersionRef.current;

    const docRef = doc(db!, 'artifacts', APP_ID, 'users', user.uid, collectionName, key);

    try {
      // Track this payload BEFORE sending so the onSnapshot from the local
      // SDK write is already in the set when it fires.
      trackSentPayload(payload);

      await setDoc(docRef, { value: payload }, { merge: true });

      // Only update lastKnownPayloadRef if no newer saveData() call happened
      // while setDoc was in-flight.
      const superseded = writeVersionRef.current !== versionAtFlushStart;
      if (!superseded) {
        lastKnownPayloadRef.current = payload;
      }
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        markRemoteAccessDenied(`save:${collectionName}/${key}`, err);
      } else if (shouldDisableFirestore(err)) {
        disableFirestore(err, `save:${collectionName}/${key}`);
        pendingRemotePayloadRef.current = null;
        hasPendingRemoteWriteRef.current = false;
      } else {
        hasPendingRemoteWriteRef.current = true;
        console.warn('Failed to save to Firestore:', err);
      }
    } finally {
      writeInFlightRef.current = false;
      if (!unmountedRef.current && hasPendingRemoteWriteRef.current && canUseRemoteSync()) {
        scheduleRemoteFlush();
      }
    }
  }, [user, canUseRemoteSync, collectionName, key, markRemoteAccessDenied, trackSentPayload]);

  const scheduleRemoteFlush = useCallback(() => {
    if (writeTimerRef.current || !canUseRemoteSync()) return;
    writeTimerRef.current = setTimeout(() => {
      writeTimerRef.current = null;
      void flushRemoteWrite();
    }, HYBRID_SYNC_DEBOUNCE_MS);
  }, [canUseRemoteSync, flushRemoteWrite]);

  // Subscribe to Firestore doc updates (per-user path)
  useEffect(() => {
    if (!user || !canUseRemoteSync()) return;

    const docRef = doc(db!, 'artifacts', APP_ID, 'users', user.uid, collectionName, key);
    let unsubscribe = (): void => {};

    unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        try {
          const payload = snapshot.data()?.value;
          if (typeof payload !== 'string') return;

          // Layer 1: exact match with latest known payload
          if (payload === lastKnownPayloadRef.current) return;

          // Layer 2: write fence — suppress while writes are pending/in-flight
          if (hasPendingRemoteWriteRef.current || writeInFlightRef.current) return;

          // Layer 3: check if this is a delayed echo of any recently sent payload
          if (sentPayloadsRef.current.has(payload)) return;

          // Genuine remote update — apply it
          const next = JSON.parse(payload) as T;
          lastKnownPayloadRef.current = payload;
          dataRef.current = next;
          setData(next);
          window.localStorage.setItem(key, payload);
        } catch (e) {
          console.warn('Failed to parse Firestore payload:', e);
        }
      },
      (error) => {
        if (handleFirestoreListenerError(error, `listen:${collectionName}/${key}`)) {
          if (isPermissionDeniedError(error)) {
            markRemoteAccessDenied(`listen:${collectionName}/${key}`, error);
          }
          unsubscribe();
        }
      },
    );

    return () => unsubscribe();
  }, [user, key, collectionName, canUseRemoteSync, markRemoteAccessDenied]);

  // Flush pending writes when user becomes available
  useEffect(() => {
    if (!user || !canUseRemoteSync()) return;
    if (!hasPendingRemoteWriteRef.current) return;
    scheduleRemoteFlush();
  }, [user, key, collectionName, canUseRemoteSync, scheduleRemoteFlush]);

  // Save (local + optional Firestore)
  const saveData = useCallback(
    (newValueOrFn: T | ((prev: T) => T)) => {
      const newValue =
        typeof newValueOrFn === 'function'
          ? (newValueOrFn as (prev: T) => T)(dataRef.current)
          : newValueOrFn;

      dataRef.current = newValue;
      setData(newValue);

      let payload: string | null = null;
      try {
        payload = JSON.stringify(newValue);
        writeVersionRef.current += 1;
        lastKnownPayloadRef.current = payload;
        // Also track the local payload — the debounce will coalesce rapid
        // writes but an intermediate snapshot might arrive carrying this
        // exact value.
        trackSentPayload(payload);
        window.localStorage.setItem(key, payload);
      } catch (err) {
        console.warn('Failed to serialize hybrid state:', err);
      }

      if (typeof payload === 'string' && canUseRemoteSync()) {
        pendingRemotePayloadRef.current = payload;
        hasPendingRemoteWriteRef.current = true;
        if (user) scheduleRemoteFlush();
      }
    },
    [key, canUseRemoteSync, user, scheduleRemoteFlush, trackSentPayload],
  );

  return [data, saveData];
}
