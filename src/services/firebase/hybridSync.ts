// Hybrid sync engine — localStorage + Firestore.
// Ported from App.jsx:330-515, adapted for Zustand.
//
// This provides a hook that syncs data bidirectionally:
// 1. Local state (React) ← → localStorage (immediate)
// 2. localStorage ← → Firestore (debounced, per-user)
//
// When Firestore is unavailable or permissions are denied,
// falls back gracefully to localStorage-only mode.

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

  const flushRemoteWrite = useCallback(async () => {
    if (writeInFlightRef.current) return;
    if (!user || !canUseRemoteSync()) return;
    if (!hasPendingRemoteWriteRef.current) return;
    const payload = pendingRemotePayloadRef.current;
    if (typeof payload !== 'string') return;

    writeInFlightRef.current = true;
    hasPendingRemoteWriteRef.current = false;

    const docRef = doc(db!, 'artifacts', APP_ID, 'users', user.uid, collectionName, key);

    try {
      await setDoc(docRef, { value: payload }, { merge: true });
      lastKnownPayloadRef.current = payload;
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
  }, [user, canUseRemoteSync, collectionName, key, markRemoteAccessDenied]);

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
          if (payload === lastKnownPayloadRef.current) return;

          // Suppress echo-back while we have pending or in-flight writes.
          // Without this guard, the listener can overwrite local state with
          // stale Firestore data mid-type (e.g. user types "abc", debounced
          // write sends "ab", Firestore echoes "ab" back, overwrites "abc").
          if (writeInFlightRef.current || hasPendingRemoteWriteRef.current) {
            return;
          }

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
        lastKnownPayloadRef.current = payload;
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
    [key, canUseRemoteSync, user, scheduleRemoteFlush],
  );

  return [data, saveData];
}
