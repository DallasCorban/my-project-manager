import TaskRow from "./components/TaskRow";
import GanttView from "./components/GanttView";
import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { 
  Mic, Send, BarChart2, FileText, Plus, ChevronRight, ChevronDown, ChevronLeft, Zap, Layout,
  MessageSquare, ZoomIn, ZoomOut, ArrowUpDown, ChevronsDown, ChevronsUp,
  MoreHorizontal, X, Edit2, Check, Briefcase, LayoutDashboard, Settings, Square, CheckSquare,
  Moon, Sun, CornerDownRight, Trash2, Palette, GripHorizontal, Pipette, CheckCircle2,
  Calendar as CalendarIcon, CalendarOff, Layers, Tag, Eye, Target, Download, Upload,
  Search, LayoutGrid, List, Paperclip
} from 'lucide-react';
import { addDaysToKey, diffDays, formatDateKey, fromLocalDateKey, getTodayKey, isDateKey, normalizeDateKey, toLocalDateKey } from "./utils/date";

// ==================================================================================
// 1. FIREBASE SETUP (Vite + Firestore + Anonymous Auth)
// ==================================================================================
// ✅ Run: npm install firebase

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { 
  getFirestore, doc, setDoc, onSnapshot, getDoc, getDocs, collection, collectionGroup, query, where, addDoc,
  updateDoc, deleteDoc, serverTimestamp, Timestamp
} from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import AuthModal from "./components/AuthModal";

// Replace placeholders with your real Firebase config values.
const YOUR_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAekkLqMvllzRZS-qzkDc8_1HuBMUA0w4E",
  authDomain: "project-managment-app-53a4a.firebaseapp.com",
  projectId: "project-managment-app-53a4a",
  storageBucket: "project-managment-app-53a4a.firebasestorage.app",
  messagingSenderId: "831767621308",
  appId: "1:831767621308:web:f3549c9003ee2fb7f46ab9",
  measurementId: "G-6V290BFQY7" // optional
};

const firebaseEnabled =
  YOUR_FIREBASE_CONFIG &&
  YOUR_FIREBASE_CONFIG.apiKey &&
  YOUR_FIREBASE_CONFIG.projectId &&
  YOUR_FIREBASE_CONFIG.authDomain;

let app = null;
let auth = null;
let db = null;
let storage = null;
let firestoreDisabled = false;

try {
  if (firebaseEnabled) {
    app = initializeApp(YOUR_FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    console.log("Firebase initialized");
  } else {
    console.warn("Firebase disabled (missing config). Running in localStorage-only mode.");
  }
} catch (e) {
  console.warn("Firebase init failed. Running in localStorage-only mode:", e);
}

const shouldDisableFirestore = (err) => {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  if (msg.includes("internal assertion failed")) return true;
  if (msg.includes("internal unhandled error")) return true;
  return false;
};

const isPermissionDeniedError = (err) => {
  if (!err) return false;
  const code = String(err.code || "").toLowerCase();
  if (code === "permission-denied") return true;
  const msg = String(err.message || "").toLowerCase();
  return msg.includes("missing or insufficient permissions");
};

const firestoreWarnedKeys = new Set();
const warnFirestoreOnce = (key, message, payload) => {
  if (firestoreWarnedKeys.has(key)) return;
  firestoreWarnedKeys.add(key);
  if (payload !== undefined) {
    console.warn(message, payload);
    return;
  }
  console.warn(message);
};

const disableFirestore = (err, context) => {
  if (firestoreDisabled) return;
  firestoreDisabled = true;
  console.warn("Firestore disabled for this session. Falling back to localStorage.", {
    context,
    error: err,
  });
};

const canUseFirestore = () => Boolean(db) && !firestoreDisabled;
const HYBRID_SYNC_DEBOUNCE_MS = 250;
const PROJECT_STATE_DOC_ID = "main";
const PROJECT_SYNC_DEBOUNCE_MS = 350;
const handleFirestoreListenerError = (error, context) => {
  if (shouldDisableFirestore(error)) {
    disableFirestore(error, context);
    return true;
  }
  if (isPermissionDeniedError(error)) {
    warnFirestoreOnce(
      `listener-permission:${context}`,
      `Firestore listener permission denied (${context}). Unsubscribing that stream.`
    );
    return true;
  }
  console.warn("Firestore listener failed:", error);
  return false;
};

// ==========================================
// 2. CONSTANTS
// ==========================================

const DEFAULT_STATUSES = [
  { id: 'done', label: 'Done', color: '#00c875' },
  { id: 'working', label: 'Working on it', color: '#fdab3d' },
  { id: 'stuck', label: 'Stuck', color: '#e2445c' },
  { id: 'pending', label: 'Pending', color: '#c4c4c4' },
  { id: 'review', label: 'In Review', color: '#a25ddc' } 
];

const DEFAULT_JOB_TYPES = [
  { id: 'design', label: 'Design', color: '#ff007f' },
  { id: 'dev', label: 'Development', color: '#0086c0' },
  { id: 'marketing', label: 'Marketing', color: '#9cd326' },
  { id: 'planning', label: 'Planning', color: '#a25ddc' },
  { id: 'research', label: 'Research', color: '#ffcb00' }
];

const DEFAULT_BOARD_COLUMNS = {
  select: 40,
  item: 450,
  person: 112,
  status: 144,
  type: 144,
  date: 192,
};

const MONDAY_PALETTE = [
  "#00c875", "#9cd326", "#cab641", "#ffcb00", "#fdab3d", "#ff642e", "#e2445c", "#ff007f",
  "#ff5ac4", "#ffcead", "#a25ddc", "#784bd1", "#579bfc", "#0086c0", "#595ad4", "#037f4c",
  "#00ca72", "#3b85f6", "#175a63", "#333333", "#7f5f3f", "#dff0ff", "#304575", "#7f8c8d",
  "#c4c4c4", "#808080", "#111111", "#b5c0d0"
];

const ROLE_RANK = {
  viewer: 1,
  contributor: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "contributor", label: "Contributor" },
  { value: "viewer", label: "Viewer" },
  { value: "contractor", label: "Contractor" },
];

const PAST_DAYS = 60;
const FUTURE_DAYS = 365;
const TIMELINE_TOTAL_DAYS = PAST_DAYS + FUTURE_DAYS;

// --- TIMELINE BASE DATE (absolute date keys, anchored to real today) ---
const TODAY_KEY = getTodayKey();
const TODAY = fromLocalDateKey(TODAY_KEY) || new Date();

const dateKeyFromRelativeIndex = (relIndex) => {
  if (relIndex === null || relIndex === undefined) return null;
  return addDaysToKey(TODAY_KEY, relIndex);
};

const relativeIndexFromDateKey = (dateKey) => {
  if (!dateKey) return null;
  return diffDays(TODAY_KEY, dateKey);
};



const INITIAL_WORKSPACES = [
  { id: 'w1', name: 'Main Workspace', type: 'workspace' },
  { id: 'w2', name: 'Marketing', type: 'workspace' }
];

const INITIAL_DASHBOARDS = [
  { id: 'd1', name: 'Overview', type: 'dashboard', includedWorkspaces: ['w1'] }
];

const INITIAL_PROJECTS = [
  {
    id: 'p1', workspaceId: 'w1', name: 'Website Redesign', status: 'working',
    groups: [
      { id: 'g1', name: 'Phase 1: Planning', color: '#579bfc' }, 
      { id: 'g2', name: 'Phase 2: Development', color: '#a25ddc' }
    ],
    tasks: [
      { 
        id: 't1', groupId: 'g1', name: 'Discovery Phase', start: dateKeyFromRelativeIndex(0), duration: 15, progress: 100, status: 'done', assignee: 'Sarah', priority: 'High', jobTypeId: 'research',
        subitems: [
           { id: 's1', name: 'Stakeholder Interviews', status: 'done', assignee: 'Sarah', start: dateKeyFromRelativeIndex(0), duration: 5, jobTypeId: 'research' },
           { id: 's2', name: 'Requirement Gathering', status: 'working', assignee: 'Mike', start: dateKeyFromRelativeIndex(5), duration: 10, jobTypeId: 'planning' }
        ]
      },
      { id: 't2', groupId: 'g1', name: 'Wireframing', start: dateKeyFromRelativeIndex(16), duration: 20, progress: 60, status: 'working', assignee: 'Mike', priority: 'Medium', jobTypeId: 'design', subitems: [] },
      { id: 't3', groupId: 'g2', name: 'UI Design', start: dateKeyFromRelativeIndex(30), duration: 30, progress: 0, status: 'pending', assignee: 'Jessica', priority: 'High', jobTypeId: 'design', subitems: [] },
      { id: 't4', groupId: 'g2', name: 'Frontend Dev', start: null, duration: null, progress: 0, status: 'pending', assignee: 'Dev Team', priority: 'High', jobTypeId: 'dev', subitems: [] },
    ]
  }
];

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const getLocalMidnight = (date) => {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const getRelativeFromDate = (date) => {
  const key = toLocalDateKey(getLocalMidnight(date));
  return diffDays(TODAY_KEY, key);
};

const generateTimelineData = () => {
  const days = [];
  const start = new Date(TODAY);
  start.setDate(TODAY.getDate() - PAST_DAYS);

  for (let i = 0; i < TIMELINE_TOTAL_DAYS; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const relativeIndex = i - PAST_DAYS;
    const dayNum = date.getDate();
    const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const dayOfWeek = date.getDay();
    const isMonday = dayOfWeek === 1;
    let weekLabel = "";
    if (isMonday) {
        const friday = new Date(date);
        friday.setDate(date.getDate() + 4);
        weekLabel = `${date.getDate()} - ${friday.getDate()}`;
    }
    days.push({ 
        index: relativeIndex, dayNum, dayName: date.toLocaleDateString('en-US', { weekday: 'short' }), 
        monthName, isWeekend: dayOfWeek === 0 || dayOfWeek === 6, isMonday, isToday: relativeIndex === 0, weekLabel 
    });
  }
  return days;
};

const getMemberEffectiveRole = (member) => {
  if (!member) return "viewer";
  if (member.role === "contractor") {
    return member.baseRole || "viewer";
  }
  return member.role || "viewer";
};

const getMemberAccessUntil = (member) => {
  const value = member?.accessUntil;
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  if (value?.toDate) return value.toDate();
  return null;
};

const isMemberActive = (member) => {
  if (!member) return false;
  if (member.role !== "contractor") return true;
  const until = getMemberAccessUntil(member);
  if (!until || Number.isNaN(until.getTime())) return false;
  return until.getTime() > Date.now();
};

const calculateCalendarDuration = (startDateIndex, visualSpan, rawDays, showWeekends) => {
    let currentRelIndex = startDateIndex;
    let visibleDaysCounted = 0;
    let loopSafety = 0;
    while (visibleDaysCounted < visualSpan && loopSafety < 3650) {
         loopSafety++;
         const arrayIndex = currentRelIndex + PAST_DAYS;
         if (arrayIndex < 0 || arrayIndex >= rawDays.length) break; 
         const day = rawDays[arrayIndex];
         if (day) {
             if (showWeekends || !day.isWeekend) visibleDaysCounted++;
         }
         currentRelIndex++;
    }
    return Math.max(1, currentRelIndex - startDateIndex);
};

// --- PERSISTENT STATE (LOCAL STORAGE) ---
function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      const parsed = item ? JSON.parse(item) : initialValue;
      if (!parsed) return initialValue;
      if (Array.isArray(initialValue) && !Array.isArray(parsed)) return initialValue;
      return parsed;
    } catch { return initialValue; }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (e) { console.error("Storage error:", e); }
  }, [key, state]);

  return [state, setState];
}

// --- HYBRID STORAGE HOOK (LOCAL + FIRESTORE) ---
function useHybridState(key, initialValue, collectionName) {
  const [data, setData] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      const parsed = item ? JSON.parse(item) : initialValue;
      if (!parsed) return initialValue;
      if (Array.isArray(initialValue) && !Array.isArray(parsed)) return initialValue;
      return parsed;
    } catch {
      return initialValue;
    }
  });

  const [user, setUser] = useState(null);
  const dataRef = useRef(data);
  const writeTimerRef = useRef(null);
  const writeInFlightRef = useRef(false);
  const hasPendingRemoteWriteRef = useRef(false);
  const pendingRemotePayloadRef = useRef(null);
  const lastKnownPayloadRef = useRef(null);
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

  const markRemoteAccessDenied = (context, err) => {
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
      { context, error: err }
    );
  };

  const canUseRemoteSync = () => canUseFirestore() && !remoteAccessDeniedRef.current;

  const scheduleRemoteFlush = () => {
    if (writeTimerRef.current || !canUseRemoteSync()) return;
    writeTimerRef.current = setTimeout(() => {
      writeTimerRef.current = null;
      void flushRemoteWrite();
    }, HYBRID_SYNC_DEBOUNCE_MS);
  };

  const flushRemoteWrite = async () => {
    if (writeInFlightRef.current) return;
    if (!user || !canUseRemoteSync()) return;
    if (!hasPendingRemoteWriteRef.current) return;
    const payload = pendingRemotePayloadRef.current;
    if (typeof payload !== "string") return;

    writeInFlightRef.current = true;
    hasPendingRemoteWriteRef.current = false;

    const appId = "my-manager-app";
    const docRef = doc(db, "artifacts", appId, "users", user.uid, collectionName, key);

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
        console.warn("Failed to save to Firestore:", err);
      }
    } finally {
      writeInFlightRef.current = false;
      if (!unmountedRef.current && hasPendingRemoteWriteRef.current && canUseRemoteSync()) {
        scheduleRemoteFlush();
      }
    }
  };

  // 1) Ensure anonymous auth
  useEffect(() => {
    if (!auth) return;

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        return;
      }
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.warn("Anonymous sign-in failed:", err);
      }
    });

    return () => unsub();
  }, []);

  // 2) Subscribe to Firestore doc updates (per-user path)
  useEffect(() => {
    if (!user || !canUseRemoteSync()) return;

    const appId = "my-manager-app";
    const docRef = doc(db, "artifacts", appId, "users", user.uid, collectionName, key);
    let unsubscribe = () => {};

    unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        try {
          const payload = snapshot.data()?.value;
          if (typeof payload !== "string") return;
          if (payload === lastKnownPayloadRef.current) return;
          const next = JSON.parse(payload);
          lastKnownPayloadRef.current = payload;
          dataRef.current = next;
          setData(next);
          window.localStorage.setItem(key, payload);
        } catch (e) {
          console.warn("Failed to parse Firestore payload:", e);
        }
      },
      (error) => {
        if (handleFirestoreListenerError(error, `listen:${collectionName}/${key}`)) {
          if (isPermissionDeniedError(error)) {
            markRemoteAccessDenied(`listen:${collectionName}/${key}`, error);
          }
          unsubscribe();
        }
      }
    );

    return () => unsubscribe();
  }, [user, key, collectionName]);

  useEffect(() => {
    if (!user || !canUseRemoteSync()) return;
    if (!hasPendingRemoteWriteRef.current) return;
    scheduleRemoteFlush();
  }, [user, key, collectionName, scheduleRemoteFlush]);

  // 3) Save (local + optional Firestore)
  const saveData = async (newValueOrFn) => {
    const newValue =
      typeof newValueOrFn === "function" ? newValueOrFn(dataRef.current) : newValueOrFn;

    dataRef.current = newValue;
    setData(newValue);
    let payload = null;
    try {
      payload = JSON.stringify(newValue);
      lastKnownPayloadRef.current = payload;
      window.localStorage.setItem(key, payload);
    } catch (err) {
      console.warn("Failed to serialize hybrid state:", err);
    }

    if (typeof payload === "string" && canUseRemoteSync()) {
      pendingRemotePayloadRef.current = payload;
      hasPendingRemoteWriteRef.current = true;
      if (user) scheduleRemoteFlush();
    }
  };

  return [data, saveData];
}

// --- DATA LOGIC BRAIN ---
function useProjectData() {
  // ✅ switched to hybrid (localStorage + Firestore)
  const [projects, setProjects] = useHybridState('pmai_projects', INITIAL_PROJECTS, 'projects');

  useEffect(() => {
    if (!projects || !Array.isArray(projects)) return;
    let needsMigration = false;
    const baseKeyRaw = typeof window !== "undefined" ? window.localStorage.getItem("pmai_baseDate") : null;
    const baseKey = isDateKey(baseKeyRaw) ? baseKeyRaw : toLocalDateKey(new Date());

    const migrateItem = (item) => {
      if (!item) return item;
      if (typeof item.start === "number") {
        needsMigration = true;
        return { ...item, start: addDaysToKey(baseKey, item.start) };
      }
      const normalized = normalizeDateKey(item.start);
      if (normalized && normalized !== item.start) {
        needsMigration = true;
        return { ...item, start: normalized };
      }
      return item;
    };

    const nextProjects = projects.map((p) => ({
      ...p,
      tasks: (p.tasks || []).map((t) => ({
        ...migrateItem(t),
        subitems: (t.subitems || []).map((s) => migrateItem(s)),
      })),
    }));

    if (needsMigration) {
      setProjects(nextProjects);
      try {
        window.localStorage.removeItem("pmai_baseDate");
      } catch {}
    }
  }, [projects, setProjects]);

  const updateTaskField = (pid, tid, sid, field, value, isSubitem) => { 
    setProjects(prev => prev.map(p => { 
        if (p.id !== pid) return p; 
        return { ...p, tasks: p.tasks.map(t => { 
                if (isSubitem) { 
                    if (t.subitems.some(sub => sub.id === tid)) { 
                        return { ...t, subitems: t.subitems.map(sub => sub.id === tid ? { ...sub, [field]: value } : sub) }; 
                    } 
                    return t; 
                } 
                return t.id === tid ? { ...t, [field]: value } : t; 
            }) 
        }; 
    })); 
  };

  const actions = {
    addProjectToWorkspace: (workspaceId, workspaceName, name) => {
      const stamp = Date.now();
      const projectId = `p${stamp}`;
      const groupId = `g${stamp}`;
      const nextName = (name || "New Board").trim() || "New Board";
      const nextProject = {
        id: projectId,
        workspaceId,
        workspaceName: workspaceName || "",
        name: nextName,
        status: "working",
        groups: [{ id: groupId, name: "Group 1", color: "#579bfc" }],
        tasks: [],
      };
      setProjects((prev) => [...prev, nextProject]);
      return projectId;
    },
    addGroup: (pid) => { const newGroup = { id: `g${Date.now()}`, name: 'New Group', color: '#579bfc' }; setProjects(prev => prev.map(p => p.id === pid ? { ...p, groups: [...p.groups, newGroup] } : p)); },
    updateProjectName: (id, v) => setProjects(prev => prev.map(p => p.id === id ? { ...p, name: v } : p)),
    updateGroupName: (pid, gid, v) => setProjects(prev => prev.map(p => p.id === pid ? { ...p, groups: p.groups.map(g => g.id === gid ? { ...g, name: v } : g) } : p)),
    updateTaskName: (pid, tid, v) => setProjects(prev => prev.map(p => p.id === pid ? { ...p, tasks: p.tasks.map(t => t.id === tid ? { ...t, name: v } : t) } : p)),
    updateSubitemName: (pid, tid, sid, v) => setProjects(prev => prev.map(p => p.id === pid ? { ...p, tasks: p.tasks.map(t => t.id === tid ? { ...t, subitems: t.subitems.map(s => s.id === sid ? { ...s, name: v } : s) } : t) } : p)),
    addTaskToGroup: (pid, gid, name) => { const newTask = { id: `t${Date.now()}`, groupId: gid, name: name || 'New Item', start: null, duration: null, progress: 0, status: 'pending', jobTypeId: 'dev', assignee: 'Unassigned', priority: 'Low', subitems: [] }; setProjects(prev => prev.map(p => p.id === pid ? { ...p, tasks: [...p.tasks, newTask] } : p)); },
    addSubitem: (pid, tid, name) => { const newSub = { id: `s${Date.now()}`, name: name || 'New Subitem', status: 'pending', jobTypeId: 'dev', assignee: 'Unassigned', start: null, duration: null }; setProjects(prev => prev.map(p => p.id === pid ? { ...p, tasks: p.tasks.map(t => t.id === tid ? { ...t, subitems: [...t.subitems, newSub] } : t) } : p)); },
    updateTaskDate: (pid, tid, sid, start, duration) => { setProjects(prev => prev.map(p => { if (p.id !== pid) return p; return { ...p, tasks: p.tasks.map(t => { if (sid) { if (t.id === tid) { return { ...t, subitems: t.subitems.map(sub => { if (sub.id === sid) { return { ...sub, start, duration }; } return sub; }) }; } return t; } if (t.id === tid) { return { ...t, start, duration }; } return t; }) }; })); },
    changeStatus: (pid, tid, sid, val) => { if (sid) updateTaskField(pid, sid, null, 'status', val, true); else updateTaskField(pid, tid, null, 'status', val, false); },
    changeJobType: (pid, tid, sid, val) => { if (sid) updateTaskField(pid, sid, null, 'jobTypeId', val, true); else updateTaskField(pid, tid, null, 'jobTypeId', val, false); },
    addUpdate: (pid, tid, sid, update) => { setProjects(prev => prev.map(p => { if (p.id !== pid) return p; return { ...p, tasks: p.tasks.map(t => { if (sid) { if (t.id === tid) { return { ...t, subitems: t.subitems.map(sub => sub.id === sid ? { ...sub, updates: [update, ...(sub.updates || [])] } : sub) }; } return t; } if (t.id === tid) { return { ...t, updates: [update, ...(t.updates || [])] }; } return t; }) }; })); },
    addFile: (pid, tid, sid, file) => { setProjects(prev => prev.map(p => { if (p.id !== pid) return p; return { ...p, tasks: p.tasks.map(t => { if (sid) { if (t.id === tid) { return { ...t, subitems: t.subitems.map(sub => sub.id === sid ? { ...sub, files: [file, ...(sub.files || [])] } : sub) }; } return t; } if (t.id === tid) { return { ...t, files: [file, ...(t.files || [])] }; } return t; }) }; })); },
    addReply: (pid, tid, sid, updateId, reply) => { setProjects(prev => prev.map(p => { if (p.id !== pid) return p; return { ...p, tasks: p.tasks.map(t => { if (sid) { if (t.id === tid) { return { ...t, subitems: t.subitems.map(sub => sub.id === sid ? { ...sub, updates: (sub.updates || []).map(u => u.id === updateId ? { ...u, replies: [reply, ...(u.replies || [])] } : u) } : sub) }; } return t; } if (t.id === tid) { return { ...t, updates: (t.updates || []).map(u => u.id === updateId ? { ...u, replies: [reply, ...(u.replies || [])] } : u) }; } return t; }) }; })); },
    toggleChecklistItem: (pid, tid, sid, updateId, itemId) => { setProjects(prev => prev.map(p => { if (p.id !== pid) return p; return { ...p, tasks: p.tasks.map(t => { if (sid) { if (t.id === tid) { return { ...t, subitems: t.subitems.map(sub => sub.id === sid ? { ...sub, updates: (sub.updates || []).map(u => { if (u.id !== updateId) return u; const next = (u.checklist || []).map(item => item.id === itemId ? { ...item, done: !item.done } : item); return { ...u, checklist: next }; }) } : sub) }; } return t; } if (t.id === tid) { return { ...t, updates: (t.updates || []).map(u => { if (u.id !== updateId) return u; const next = (u.checklist || []).map(item => item.id === itemId ? { ...item, done: !item.done } : item); return { ...u, checklist: next }; }) }; } return t; }) }; })); },
    deleteSelection: (ids) => { setProjects(prev => prev.map(p => ({ ...p, tasks: p.tasks.filter(t => !ids.has(t.id)).map(t => ({ ...t, subitems: t.subitems.filter(s => !ids.has(s.id)) })) }))); }
  };

  return { projects, setProjects, ...actions };
}

// ==========================================
// 3. UI COMPONENTS
// ==========================================

const EditableText = ({ value, onChange, className, style, placeholder, autoFocus, onBlur, readOnly = false }) => {
  const spanRef = useRef(null);
  const [width, setWidth] = useState('auto');
  useLayoutEffect(() => { if (spanRef.current) setWidth(`${Math.max(20, spanRef.current.offsetWidth + 12)}px`); }, [value, placeholder]);
  return (
    <div className="relative max-w-full flex items-center no-drag">
        <span ref={spanRef} className={`absolute opacity-0 pointer-events-none whitespace-pre px-1 ${className}`} style={style} aria-hidden="true">{value || placeholder || ''}</span>
        <input value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} onBlur={onBlur} readOnly={readOnly} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} draggable={false} className={`bg-transparent border border-transparent rounded px-1 -ml-1 transition-all outline-none truncate ${readOnly ? 'cursor-default' : 'cursor-text hover:border-gray-400/50'} ${className}`} style={{ ...style, width }} />
    </div>
  );
};

const Sidebar = ({
  darkMode,
  workspaces,
  selectedWorkspaceId,
  setSelectedWorkspaceId,
  boards,
  activeBoardId,
  setActiveBoardId,
  createWorkspace,
  createBoard,
  canCreateBoard = false,
  setDarkMode,
}) => (
    <div className={`w-64 border-r flex flex-col hidden md:flex ${darkMode ? 'bg-[#111322] border-[#2b2c32]' : 'bg-white border-[#d0d4e4]'}`}>
        <div className={`p-4 border-b ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'} `}><h2 className="font-bold text-lg">Workspaces</h2></div>
        <div className="flex-1 overflow-y-auto p-3 space-y-6">
           <div>
             <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2"><span>Workspaces</span><Plus size={14} className="cursor-pointer hover:text-blue-500" onClick={createWorkspace} /></div>
             {workspaces.length > 0 ? (
               <select
                 value={selectedWorkspaceId || ""}
                 onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                 className={`w-full rounded-md border text-sm px-3 py-2 outline-none ${
                   darkMode
                     ? "bg-[#1c213e] border-[#2b2c32] text-gray-200"
                     : "bg-white border-gray-200 text-gray-700"
                 }`}
               >
                 {workspaces.map((workspace) => (
                   <option key={workspace.id} value={workspace.id}>
                     {workspace.name}
                   </option>
                 ))}
               </select>
             ) : (
               <div className={`text-xs px-3 py-2 rounded-md border ${darkMode ? "border-[#2b2c32] text-gray-500" : "border-gray-200 text-gray-500"}`}>
                 No workspaces yet. Click + to create one.
               </div>
             )}
           </div>
           <div>
             <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2"><span>Boards</span><Plus size={14} className={`${canCreateBoard ? "cursor-pointer hover:text-blue-500" : "opacity-40 cursor-not-allowed"}`} onClick={() => canCreateBoard && createBoard()} /></div>
             <div className="space-y-1">
               {boards.map((board) => (
                 <div
                   key={board.id}
                   onClick={() => setActiveBoardId(board.id)}
                   className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                     activeBoardId === board.id
                       ? darkMode ? "bg-[#1c213e] text-blue-400" : "bg-blue-50 text-blue-600"
                       : darkMode ? "hover:bg-[#1c213e] text-gray-400" : "hover:bg-gray-100 text-gray-700"
                   }`}
                 >
                   <LayoutGrid size={16} />
                   <span className="truncate font-medium">{board.name || "Untitled Board"}</span>
                 </div>
               ))}
               {boards.length === 0 && (
                 <div className={`px-3 py-2 text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                   No boards in this workspace.
                 </div>
               )}
             </div>
           </div>
        </div>
        <div className={`p-4 border-t ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'} flex items-center justify-between`}>
             <span className="text-xs text-gray-500">Theme</span>
             <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full ${darkMode ? 'bg-[#2b2c32] text-yellow-400' : 'bg-gray-100 text-gray-600'}`}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
    </div>
);

const AppHeader = ({ activeEntity, activeTab, setActiveTab, darkMode, setSettingsMenuOpen, settingsMenuOpen, showWeekends, onToggleWeekends, showLabels, setShowLabels, colorBy, setColorBy, zoomLevel, handleZoomChange, rowHeight, setRowHeight, isChatOpen, setIsChatOpen, scrollToToday, updateEntityName, canEditEntityName = true, onExport, onExportJson, onImportJson, onResetData, authUser, onOpenAuth, onOpenMembers }) => (
    <>
        <div className={`h-16 border-b px-8 flex items-center justify-between shrink-0 ${darkMode ? 'border-[#2b2c32] bg-[#181b34]' : 'border-[#d0d4e4] bg-white'}`}>
          <div>
            <div className="flex items-center gap-3 text-2xl font-bold">
              {activeEntity.type === 'workspace' ? <Briefcase className="text-gray-400" /> : <LayoutDashboard className="text-purple-500" />}
              <EditableText value={activeEntity.name} onChange={(e) => { if (!canEditEntityName) return; updateEntityName(e.target.value); }} readOnly={!canEditEntityName} className={`hover:bg-opacity-10 px-2 -ml-2 rounded ${darkMode ? 'text-white hover:bg-white' : 'hover:bg-gray-800'}`} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenMembers}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                darkMode ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200 hover:bg-[#202336]' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
              disabled={!authUser || authUser.isAnonymous}
            >
              Members
            </button>
            <button onClick={onOpenAuth} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${darkMode ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200 hover:bg-[#202336]' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              {authUser ? (authUser.isAnonymous ? 'Guest' : (authUser.email || 'Account')) : 'Account'}
            </button>
          </div>
        </div>
        <div className={`px-8 border-b flex items-center justify-between shrink-0 sticky top-0 z-[80] ${darkMode ? 'border-[#2b2c32] bg-[#181b34]' : 'border-[#d0d4e4] bg-white'}`}>
           <div className="flex gap-6">
            <button onClick={() => setActiveTab('board')} className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'board' ? 'border-[#0073ea] text-[#0073ea]' : 'border-transparent text-gray-500'}`}>Main Table</button>
            <button onClick={() => setActiveTab('gantt')} className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'gantt' ? 'border-[#0073ea] text-[#0073ea]' : 'border-transparent text-gray-500'}`}>Gantt</button>
          </div>
          <div className="flex items-center gap-6">
            {activeTab === 'gantt' && (
              <div className="flex gap-4">
                  <button onClick={() => scrollToToday(true)} className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${darkMode ? 'bg-[#1c213e] border-[#2b2c32] text-gray-300 hover:bg-[#202336]' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}><Target size={14} /> Today</button>
                  <div className="relative">
                     <button onClick={(e) => { e.stopPropagation(); setSettingsMenuOpen(!settingsMenuOpen); }} className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${settingsMenuOpen || !darkMode ? 'bg-white text-gray-700 border-gray-300' : 'bg-[#1c213e] border-[#2b2c32] text-gray-300'}`}><Settings size={14} /> Settings</button>
                     {settingsMenuOpen && (
                         <div className={`absolute top-full right-0 mt-2 w-56 rounded-lg shadow-xl border z-[130] p-2 animate-in fade-in zoom-in-95 duration-100 ${darkMode ? 'bg-[#2b2c32] border-[#3e3f4b]' : 'bg-white border-gray-200'}`} onClick={e => e.stopPropagation()}>
                             <div className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide px-2">View Options</div>
                             <div className={`flex items-center justify-between p-2 rounded cursor-pointer ${darkMode ? 'hover:bg-[#1c213e]' : 'hover:bg-gray-50'}`} onClick={onToggleWeekends}>
                                 <span className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Show Weekends</span>
                                 <div className={`w-8 h-4 rounded-full relative transition-colors ${showWeekends ? 'bg-blue-600' : 'bg-gray-400'}`}><div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showWeekends ? 'translate-x-4' : 'translate-x-0'}`}></div></div>
                             </div>
                             <div className={`flex items-center justify-between p-2 rounded cursor-pointer ${darkMode ? 'hover:bg-[#1c213e]' : 'hover:bg-gray-50'}`} onClick={() => setShowLabels(!showLabels)}>
                                 <span className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Show Labels</span>
                                 <div className={`w-8 h-4 rounded-full relative transition-colors ${showLabels ? 'bg-blue-600' : 'bg-gray-400'}`}><div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showLabels ? 'translate-x-4' : 'translate-x-0'}`}></div></div>
                             </div>
                             <div className="border-t border-gray-600 my-2 opacity-20"></div>
                             <div className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide px-2">Color Bars By</div>
                             <div className="flex bg-black/10 p-1 rounded">
                                 <button onClick={() => setColorBy('status')} className={`flex-1 py-1 text-xs rounded text-center transition-colors ${colorBy === 'status' ? (darkMode ? 'bg-[#1c213e] text-white shadow' : 'bg-white text-black shadow') : 'text-gray-500'}`}>Status</button>
                                 <button onClick={() => setColorBy('type')} className={`flex-1 py-1 text-xs rounded text-center transition-colors ${colorBy === 'type' ? (darkMode ? 'bg-[#1c213e] text-white shadow' : 'bg-white text-black shadow') : 'text-gray-500'}`}>Type</button>
                             </div>
                             <div className="border-t border-gray-600 my-2 opacity-20"></div>
                             <div className={`flex items-center justify-between p-2 rounded cursor-pointer ${darkMode ? 'hover:bg-[#1c213e]' : 'hover:bg-gray-50'}`} onClick={onExport}>
                                 <span className={`text-sm flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}><Download size={14} /> Export CSV</span>
                             </div>
                             <div className={`flex items-center justify-between p-2 rounded cursor-pointer ${darkMode ? 'hover:bg-[#1c213e]' : 'hover:bg-gray-50'}`} onClick={onExportJson}>
                                 <span className={`text-sm flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}><FileText size={14} /> Backup (JSON)</span>
                             </div>
                             <label className={`flex items-center justify-between p-2 rounded cursor-pointer ${darkMode ? 'hover:bg-[#1c213e]' : 'hover:bg-gray-50'}`}>
                                 <span className={`text-sm flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}><Upload size={14} /> Restore (JSON)</span>
                                 <input type="file" accept=".json" className="hidden" onChange={onImportJson} />
                             </label>
                             <div className="border-t border-gray-600 my-2 opacity-20"></div>
                             <div className={`flex items-center justify-between p-2 rounded cursor-pointer ${darkMode ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`} onClick={onResetData}>
                                 <span className={`text-sm flex items-center gap-2 ${darkMode ? 'text-red-300' : 'text-red-700'}`}><Trash2 size={14} /> Reset Boards & Workspaces</span>
                             </div>
                         </div>
                     )}
                  </div>
                 <div className={`flex items-center gap-3 px-3 py-1.5 rounded-full border ${darkMode ? 'bg-[#1c213e] border-[#2b2c32] text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'}`}><ZoomOut size={14} /><input type="range" min="10" max="100" value={zoomLevel} onChange={handleZoomChange} className="w-20 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-[#0073ea]" /><ZoomIn size={14} /></div>
                 <div className={`flex items-center gap-3 px-3 py-1.5 rounded-full border ${darkMode ? 'bg-[#1c213e] border-[#2b2c32] text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'}`}><ArrowUpDown size={14} /><input type="range" min="32" max="80" value={rowHeight} onChange={(e) => setRowHeight(Number(e.target.value))} className="w-20 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-[#0073ea]" /></div>
              </div>
            )}
            {!isChatOpen && <button onClick={() => setIsChatOpen(true)} className="flex items-center gap-2 text-sm text-[#0073ea] font-medium hover:bg-blue-50 px-3 py-1 rounded"><MessageSquare size={16} /> Open AI Chat</button>}
          </div>
        </div>
    </>
);

const GroupHeaderRow = ({ darkMode, boardColumns, onStartResize }) => {
    const col = boardColumns;
    const handle = (key) =>
        (e) => {
            e.stopPropagation();
            onStartResize(key, e.clientX);
        };
    const resizerClass = `absolute right-0 top-0 bottom-0 w-1 cursor-col-resize ${
        darkMode ? 'hover:bg-blue-500/30' : 'hover:bg-blue-400/30'
    }`;
    return (
        <div className={`flex border-b text-xs font-bold text-gray-500 uppercase tracking-wide ${darkMode ? 'bg-[#181b34] border-[#2b2c32]' : 'bg-white border-[#d0d4e4]'}`}>
            <div
                className={`border-r flex items-center justify-center py-2 relative min-w-0 ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}
                style={{ width: col.select }}
            >
                <Square size={14} className="opacity-50" />
                <div className={resizerClass} onMouseDown={handle('select')} />
            </div>
            <div
                className={`border-r px-4 py-2 flex items-center relative min-w-0 ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}
                style={{ width: col.item }}
            >
                <span className="truncate">Item</span>
                <div className={resizerClass} onMouseDown={handle('item')} />
            </div>
            <div
                className={`border-r px-4 py-2 flex items-center justify-center relative min-w-0 ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}
                style={{ width: col.person }}
            >
                <span className="truncate">Person</span>
                <div className={resizerClass} onMouseDown={handle('person')} />
            </div>
            <div
                className={`border-r px-4 py-2 flex items-center justify-center relative min-w-0 ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}
                style={{ width: col.status }}
            >
                <span className="truncate">Status</span>
                <div className={resizerClass} onMouseDown={handle('status')} />
            </div>
            <div
                className={`border-r px-4 py-2 flex items-center justify-center relative min-w-0 ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}
                style={{ width: col.type }}
            >
                <span className="truncate">Type</span>
                <div className={resizerClass} onMouseDown={handle('type')} />
            </div>
            <div className="px-4 py-2 flex items-center justify-center relative min-w-0" style={{ width: col.date }}>
                <span className="truncate">Date</span>
                <div className={resizerClass} onMouseDown={handle('date')} />
            </div>
        </div>
    );
};

const LabelEditorModal = ({ isOpen, onClose, items, onSave, title, darkMode }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className={`w-96 rounded-lg shadow-2xl p-6 ${darkMode ? 'bg-[#2b2c32] text-white' : 'bg-white text-gray-800'}`} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">{title}</h3><X className="cursor-pointer opacity-50 hover:opacity-100" onClick={onClose} size={20}/></div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                    {items.map((item, idx) => (
                        <div key={item.id} className="flex gap-2 items-center">
                            <input type="color" value={item.color} onChange={(e) => { const newItems = [...items]; newItems[idx].color = e.target.value; onSave(newItems); }} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
                            <input type="text" value={item.label} onChange={(e) => { const newItems = [...items]; newItems[idx].label = e.target.value; onSave(newItems); }} className={`flex-1 px-2 py-1.5 rounded border ${darkMode ? 'bg-[#181b34] border-[#3e3f4b]' : 'bg-gray-50 border-gray-200'}`} />
                        </div>
                    ))}
                </div>
                <div className="mt-4 pt-4 border-t flex justify-end"><button onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium">Done</button></div>
            </div>
        </div>
    );
};

const StatusDropdown = ({ statuses, currentStatusId, onSelect, darkMode, onEdit, onAddLabel }) => {
    const [query, setQuery] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newColor, setNewColor] = useState(MONDAY_PALETTE[statuses.length % MONDAY_PALETTE.length] || '#579bfc');

    const filtered = statuses.filter(s => s.label.toLowerCase().includes(query.trim().toLowerCase()));

    const commitAdd = () => {
        const label = newLabel.trim();
        if (!label) return;
        onAddLabel(label, newColor);
        setNewLabel('');
        setQuery('');
        setNewColor(MONDAY_PALETTE[(statuses.length + 1) % MONDAY_PALETTE.length] || '#579bfc');
    };

    return (
        <div className={`w-64 rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${darkMode ? 'bg-[#161a33] border-[#2b2c32]' : 'bg-white border-gray-200'}`}>
            <div className={`px-4 pt-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Status
            </div>
            <div className="px-3 pb-2">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search status…"
                    className={`w-full h-8 px-2.5 rounded-md text-xs outline-none border ${
                        darkMode
                            ? 'bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                            : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'
                    }`}
                />
            </div>
            <div className="py-1 max-h-56 overflow-y-auto">
                {filtered.length === 0 && (
                    <div className={`px-3 py-4 text-xs text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        No matches
                    </div>
                )}
                {filtered.map(s => {
                    const isCurrent = s.id === currentStatusId;
                    return (
                        <div
                            key={s.id}
                            onClick={(e) => { e.stopPropagation(); onSelect(s.id); }}
                            className={`mx-2 my-0.5 px-2.5 py-2 text-xs font-medium cursor-pointer flex items-center gap-2 rounded-lg transition-colors ${
                                isCurrent
                                    ? darkMode
                                        ? 'bg-blue-500/20 text-white'
                                        : 'bg-blue-50 text-blue-700'
                                    : darkMode
                                    ? 'hover:bg-[#0f1224] text-gray-200'
                                    : 'hover:bg-gray-50 text-gray-700'
                            }`}
                        >
                            <div className="w-3.5 h-3.5 rounded-sm shrink-0 ring-1 ring-white/20" style={{ backgroundColor: s.color }}></div>
                            <span className="flex-1">{s.label}</span>
                            {isCurrent && <Check size={12} className="opacity-70" />}
                        </div>
                    );
                })}
            </div>
            <div className={`px-3 py-3 border-t ${darkMode ? 'border-[#2b2c32]' : 'border-gray-100'}`}>
                <div className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Add Label
                </div>
                <div className="flex items-center gap-2">
                    <input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitAdd();
                        }}
                        placeholder="New status…"
                        className={`flex-1 h-8 px-2.5 rounded-md text-xs outline-none border ${
                            darkMode
                                ? 'bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                                : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'
                        }`}
                    />
                    <input
                        type="color"
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                    />
                </div>
                <button
                    onClick={commitAdd}
                    className={`mt-2 w-full h-8 rounded-md text-xs font-semibold transition-colors ${
                        darkMode
                            ? 'bg-blue-600/90 hover:bg-blue-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                    Add Status
                </button>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className={`w-full px-4 py-2.5 text-[11px] font-semibold border-t flex items-center gap-2 transition-colors ${
                    darkMode
                        ? 'border-[#2b2c32] text-blue-300 hover:bg-[#0f1224]'
                        : 'border-gray-100 text-blue-600 hover:bg-gray-50'
                }`}
            >
                <Edit2 size={12} /> Manage Status Labels
            </button>
        </div>
    );
};

const TypeDropdown = ({ jobTypes, currentTypeId, onSelect, darkMode, onEdit, onAddLabel }) => {
    const [query, setQuery] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newColor, setNewColor] = useState(MONDAY_PALETTE[jobTypes.length % MONDAY_PALETTE.length] || '#579bfc');

    const filtered = jobTypes.filter(t => t.label.toLowerCase().includes(query.trim().toLowerCase()));

    const commitAdd = () => {
        const label = newLabel.trim();
        if (!label) return;
        onAddLabel(label, newColor);
        setNewLabel('');
        setQuery('');
        setNewColor(MONDAY_PALETTE[(jobTypes.length + 1) % MONDAY_PALETTE.length] || '#579bfc');
    };

    return (
        <div className={`w-64 rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${darkMode ? 'bg-[#161a33] border-[#2b2c32]' : 'bg-white border-gray-200'}`}>
            <div className={`px-4 pt-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Type
            </div>
            <div className="px-3 pb-2">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search type…"
                    className={`w-full h-8 px-2.5 rounded-md text-xs outline-none border ${
                        darkMode
                            ? 'bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                            : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'
                    }`}
                />
            </div>
            <div className="py-1 max-h-56 overflow-y-auto">
                {filtered.length === 0 && (
                    <div className={`px-3 py-4 text-xs text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        No matches
                    </div>
                )}
                {filtered.map(t => {
                    const isCurrent = t.id === currentTypeId;
                    return (
                        <div
                            key={t.id}
                            onClick={(e) => { e.stopPropagation(); onSelect(t.id); }}
                            className={`mx-2 my-0.5 px-2.5 py-2 text-xs font-medium cursor-pointer flex items-center gap-2 rounded-lg transition-colors ${
                                isCurrent
                                    ? darkMode
                                        ? 'bg-blue-500/20 text-white'
                                        : 'bg-blue-50 text-blue-700'
                                    : darkMode
                                    ? 'hover:bg-[#0f1224] text-gray-200'
                                    : 'hover:bg-gray-50 text-gray-700'
                            }`}
                        >
                            <div className="w-3.5 h-3.5 rounded-sm shrink-0 ring-1 ring-white/20" style={{ backgroundColor: t.color }}></div>
                            <span className="flex-1">{t.label}</span>
                            {isCurrent && <Check size={12} className="opacity-70" />}
                        </div>
                    );
                })}
            </div>
            <div className={`px-3 py-3 border-t ${darkMode ? 'border-[#2b2c32]' : 'border-gray-100'}`}>
                <div className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Add Label
                </div>
                <div className="flex items-center gap-2">
                    <input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitAdd();
                        }}
                        placeholder="New type…"
                        className={`flex-1 h-8 px-2.5 rounded-md text-xs outline-none border ${
                            darkMode
                                ? 'bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                                : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'
                        }`}
                    />
                    <input
                        type="color"
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
                    />
                </div>
                <button
                    onClick={commitAdd}
                    className={`mt-2 w-full h-8 rounded-md text-xs font-semibold transition-colors ${
                        darkMode
                            ? 'bg-blue-600/90 hover:bg-blue-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                >
                    Add Type
                </button>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className={`w-full px-4 py-2.5 text-[11px] font-semibold border-t flex items-center gap-2 transition-colors ${
                    darkMode
                        ? 'border-[#2b2c32] text-blue-300 hover:bg-[#0f1224]'
                        : 'border-gray-100 text-blue-600 hover:bg-gray-50'
                }`}
            >
                <Edit2 size={12} /> Manage Type Labels
            </button>
        </div>
    );
};

const UpdatesPanel = ({
    darkMode,
    target,
    onClose,
    onAddUpdate,
    onAddReply,
    onToggleChecklistItem,
    onAddFiles,
    permissions,
    onUpdateFileAccess,
    onToggleShareLink,
    shareBaseUrl,
}) => {
    const [draft, setDraft] = useState("");
    const [activeTab, setActiveTab] = useState("updates");
    const [mode, setMode] = useState("update");
    const [checklistTitle, setChecklistTitle] = useState("");
    const [checklistItems, setChecklistItems] = useState([]);
    const [checklistInput, setChecklistInput] = useState("");
    const [openReplyId, setOpenReplyId] = useState(null);
    const [replyDrafts, setReplyDrafts] = useState({});
    const [fileView, setFileView] = useState("grid");
    const [fileSearch, setFileSearch] = useState("");
    const [isDraggingFiles, setIsDraggingFiles] = useState(false);
    const fileInputRef = useRef(null);
    const [previewFile, setPreviewFile] = useState(null);

    useEffect(() => {
        setDraft("");
        setActiveTab("updates");
        setMode("update");
        setChecklistTitle("");
        setChecklistItems([]);
        setChecklistInput("");
        setOpenReplyId(null);
        setReplyDrafts({});
        setFileView("grid");
        setFileSearch("");
        setIsDraggingFiles(false);
        setPreviewFile(null);
    }, [target?.projectId, target?.taskId, target?.subitemId]);

    if (!target) return null;

    const updates = target.updates || [];
    const files = target.files || [];
    const formatTime = (iso) => {
        if (!iso) return "";
        try {
            if (iso?.toDate) return iso.toDate().toLocaleString();
            return new Date(iso).toLocaleString();
        } catch {
            return "";
        }
    };
    const formatBytes = (bytes) => {
        if (bytes === null || bytes === undefined) return "";
        if (bytes === 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
        const value = bytes / Math.pow(1024, idx);
        return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
    };
    const roleRank = permissions?.rank || 0;
    const visibleFiles = files.filter((file) => {
        const minRole = file.access?.minRole || "viewer";
        const requiredRank = ROLE_RANK[minRole] || 0;
        return roleRank >= requiredRank;
    });
    const filteredFiles = fileSearch.trim()
        ? visibleFiles.filter((f) => (f.name || "").toLowerCase().includes(fileSearch.trim().toLowerCase()))
        : visibleFiles;

    const handleSubmit = () => {
        if (!canEditContent) return;
        if (mode === "checklist") {
            if (checklistItems.length === 0 && !checklistTitle.trim()) return;
            onAddUpdate({
                text: checklistTitle.trim(),
                checklist: checklistItems.map((item) => ({ ...item })),
            });
            setChecklistTitle("");
            setChecklistItems([]);
            setChecklistInput("");
            setMode("update");
            return;
        }
        if (!draft.trim()) return;
        onAddUpdate({ text: draft.trim(), checklist: [] });
        setDraft("");
    };

    const handleAddChecklistItem = () => {
        if (!canEditContent) return;
        const value = checklistInput.trim();
        if (!value) return;
        setChecklistItems((prev) => [...prev, { id: `c${Date.now()}`, text: value, done: false }]);
        setChecklistInput("");
    };

    const handlePickFiles = (e) => {
        const list = e.target.files;
        if (list && list.length > 0) {
            onAddFiles?.(list);
        }
        e.target.value = "";
    };

    const handleDropFiles = (e) => {
        e.preventDefault();
        setIsDraggingFiles(false);
        const list = e.dataTransfer?.files;
        if (list && list.length > 0) {
            onAddFiles?.(list);
        }
    };

    const canViewFiles = permissions?.canView;
    const canUploadFiles = permissions?.canUpload;
    const canDownloadFiles = permissions?.canDownload;
    const canEditFiles = permissions?.canEditFiles;
    const canManageFileAccess = permissions?.canManageFileAccess;
    const canEditContent = roleRank >= ROLE_RANK.contributor;

    return (
        <div className={`fixed top-0 right-0 bottom-0 w-[420px] z-[160] border-l shadow-2xl flex flex-col ${darkMode ? 'bg-[#151726] border-[#2b2c32]' : 'bg-white border-gray-200'}`}>
            <div className={`px-5 py-4 border-b ${darkMode ? 'border-[#2b2c32]' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{target.name}</div>
                        {target.type === "subitem" && (
                            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>in {target.parentName}</div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
                        aria-label="Close updates panel"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs font-semibold">
                    <button
                        onClick={() => setActiveTab("updates")}
                        className={`px-2.5 py-1 rounded-full transition-colors ${
                            activeTab === "updates"
                                ? darkMode ? 'bg-blue-500/15 text-blue-200' : 'bg-blue-50 text-blue-700'
                                : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Updates{updates.length ? ` / ${updates.length}` : ""}
                    </button>
                    <button
                        onClick={() => setActiveTab("files")}
                        className={`px-2.5 py-1 rounded-full transition-colors ${
                            activeTab === "files"
                                ? darkMode ? 'bg-blue-500/15 text-blue-200' : 'bg-blue-50 text-blue-700'
                                : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Files{files.length ? ` / ${files.length}` : ""}
                    </button>
                    <button className={`px-2.5 py-1 rounded-full opacity-50 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} disabled>Activity</button>
                    <button className={`px-2.5 py-1 rounded-full opacity-50 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} disabled>Item Card</button>
                </div>
                {!canEditContent && (
                    <div className={`mt-2 text-[11px] ${darkMode ? 'text-amber-300/80' : 'text-amber-700'}`}>
                        Read-only access: you can view updates and files, but cannot change content.
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto">
                {activeTab === "updates" && (
                    <>
                        <div className="p-4 border-b border-transparent">
                            <div className={`rounded-xl border ${darkMode ? 'border-[#2b2c32] bg-[#0f1224]' : 'border-gray-200 bg-gray-50'}`}>
                                <div className="px-3 pt-2 flex items-center gap-2">
                                    <button
                                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors ${
                                            mode === "update"
                                                ? darkMode
                                                    ? "bg-blue-500/20 text-blue-200"
                                                    : "bg-blue-50 text-blue-700"
                                                : darkMode
                                                ? "text-gray-400 hover:bg-white/5"
                                                : "text-gray-500 hover:bg-gray-100"
                                        }`}
                                        onClick={() => canEditContent && setMode("update")}
                                        disabled={!canEditContent}
                                    >
                                        Update
                                    </button>
                                    <button
                                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-colors ${
                                            mode === "checklist"
                                                ? darkMode
                                                    ? "bg-green-500/20 text-green-200"
                                                    : "bg-green-50 text-green-700"
                                                : darkMode
                                                ? "text-gray-400 hover:bg-white/5"
                                                : "text-gray-500 hover:bg-gray-100"
                                        }`}
                                        onClick={() => canEditContent && setMode("checklist")}
                                        disabled={!canEditContent}
                                    >
                                        Checklist
                                    </button>
                                </div>
                                {mode === "update" ? (
                                    <>
                                        <textarea
                                            value={draft}
                                            onChange={(e) => setDraft(e.target.value)}
                                            placeholder="Write an update..."
                                            readOnly={!canEditContent}
                                            className={`w-full min-h-[120px] resize-none px-3 pb-3 text-sm outline-none bg-transparent ${darkMode ? 'text-gray-200 placeholder-gray-500' : 'text-gray-700 placeholder-gray-400'}`}
                                        />
                                        <div className="px-3 pb-3 flex justify-end">
                                            <button
                                                onClick={handleSubmit}
                                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${draft.trim() ? (darkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white') : (darkMode ? 'bg-white/10 text-gray-500' : 'bg-gray-200 text-gray-400')}`}
                                                disabled={!canEditContent || !draft.trim()}
                                            >
                                                Update
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="px-3 pt-2">
                                            <input
                                                value={checklistTitle}
                                                onChange={(e) => setChecklistTitle(e.target.value)}
                                                placeholder="Checklist title (optional)"
                                                disabled={!canEditContent}
                                                className={`w-full h-8 px-2.5 rounded-md text-xs outline-none border ${
                                                    darkMode
                                                        ? 'bg-[#0b0e1c] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                                                        : 'bg-white border-gray-200 text-gray-700 placeholder-gray-400'
                                                }`}
                                            />
                                        </div>
                                        <div className="px-3 pt-2 space-y-2">
                                            {checklistItems.map((item) => (
                                                <div key={item.id} className="flex items-center gap-2">
                                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}></div>
                                                    <span className={`text-xs ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{item.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="px-3 pt-2 flex items-center gap-2">
                                            <input
                                                value={checklistInput}
                                                onChange={(e) => setChecklistInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        handleAddChecklistItem();
                                                    }
                                                }}
                                                placeholder="Add checklist item..."
                                                disabled={!canEditContent}
                                                className={`flex-1 h-8 px-2.5 rounded-md text-xs outline-none border ${
                                                    darkMode
                                                        ? 'bg-[#0b0e1c] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                                                        : 'bg-white border-gray-200 text-gray-700 placeholder-gray-400'
                                                }`}
                                            />
                                            <button
                                                onClick={handleAddChecklistItem}
                                                className={`px-3 h-8 rounded-md text-xs font-semibold ${darkMode ? 'bg-white/10 text-gray-200 hover:bg-white/20' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                disabled={!canEditContent}
                                            >
                                                Add
                                            </button>
                                        </div>
                                        <div className="px-3 pb-3 flex justify-end">
                                            <button
                                                onClick={handleSubmit}
                                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${checklistItems.length > 0 || checklistTitle.trim() ? (darkMode ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-green-600 hover:bg-green-700 text-white') : (darkMode ? 'bg-white/10 text-gray-500' : 'bg-gray-200 text-gray-400')}`}
                                                disabled={!canEditContent || (checklistItems.length === 0 && !checklistTitle.trim())}
                                            >
                                                Post Checklist
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="px-4 pb-6">
                            {updates.length === 0 && (
                                <div className={`mt-6 text-sm text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>No updates yet</div>
                            )}
                            {updates.map((u) => (
                                <div key={u.id} className={`mt-4 rounded-xl border ${darkMode ? 'border-[#2b2c32] bg-[#101328]' : 'border-gray-200 bg-white'} p-3`}>
                                    <div className="flex items-start gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${darkMode ? 'bg-[#1c213e] text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                                            {(u.author || "U").charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{u.author || "User"}</span>
                                                <span className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatTime(u.createdAt)}</span>
                                            </div>
                                            {u.text && (
                                                <div className={`mt-2 text-sm whitespace-pre-wrap ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{u.text}</div>
                                            )}
                                            {u.checklist && u.checklist.length > 0 && (
                                                <div className="mt-3 space-y-2">
                                                    {u.checklist.map((item) => (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => canEditContent && onToggleChecklistItem?.(u.id, item.id)}
                                                            disabled={!canEditContent}
                                                            className="flex items-center gap-2 text-left"
                                                        >
                                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                                                                item.done
                                                                    ? darkMode ? 'bg-green-500 text-white border-green-400' : 'bg-green-500 text-white border-green-500'
                                                                    : darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-500'
                                                            }`}>
                                                                {item.done ? "✓" : ""}
                                                            </div>
                                                            <span className={`text-sm ${item.done ? 'line-through opacity-60' : ''} ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                                                                {item.text}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className={`mt-3 flex items-center gap-4 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <button
                                            className="hover:text-blue-400"
                                            onClick={() => canEditContent && setOpenReplyId(openReplyId === u.id ? null : u.id)}
                                            disabled={!canEditContent}
                                        >
                                            Reply
                                        </button>
                                    </div>
                                    {openReplyId === u.id && (
                                        <div className={`mt-3 rounded-lg border ${darkMode ? 'border-[#2b2c32] bg-[#0f1224]' : 'border-gray-200 bg-gray-50'} p-2`}>
                                            <textarea
                                                value={replyDrafts[u.id] || ""}
                                                onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                                placeholder="Write a reply..."
                                                readOnly={!canEditContent}
                                                className={`w-full min-h-[70px] resize-none text-xs outline-none bg-transparent ${darkMode ? 'text-gray-200 placeholder-gray-500' : 'text-gray-700 placeholder-gray-400'}`}
                                            />
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => {
                                                        const value = replyDrafts[u.id] || "";
                                                        if (!value.trim()) return;
                                                        onAddReply?.(u.id, value);
                                                        setReplyDrafts((prev) => ({ ...prev, [u.id]: "" }));
                                                        setOpenReplyId(null);
                                                    }}
                                                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                                                        (replyDrafts[u.id] || "").trim()
                                                            ? darkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                                                            : darkMode ? 'bg-white/10 text-gray-500' : 'bg-gray-200 text-gray-400'
                                                    }`}
                                                    disabled={!canEditContent || !((replyDrafts[u.id] || "").trim())}
                                                >
                                                    Reply
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {u.replies && u.replies.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {u.replies.map((r) => (
                                                <div key={r.id} className={`flex items-start gap-2 px-2 py-2 rounded-lg ${darkMode ? 'bg-[#0f1224]' : 'bg-gray-50'}`}>
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${darkMode ? 'bg-[#1c213e] text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                                                        {(r.author || "U").charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[11px] font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{r.author || "User"}</span>
                                                            <span className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatTime(r.createdAt)}</span>
                                                        </div>
                                                        <div className={`text-xs mt-1 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{r.text}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {activeTab === "files" && (
                    <div
                        className="h-full flex flex-col"
                        onDragOver={(e) => {
                            if (!canUploadFiles) return;
                            e.preventDefault();
                            setIsDraggingFiles(true);
                        }}
                        onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget)) {
                                setIsDraggingFiles(false);
                            }
                        }}
                        onDrop={(e) => {
                            if (!canUploadFiles) return;
                            handleDropFiles(e);
                        }}
                    >
                        <div className={`px-5 py-4 border-b ${darkMode ? 'border-[#2b2c32]' : 'border-gray-200'}`}>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => canUploadFiles && fileInputRef.current?.click()}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                                        canUploadFiles
                                            ? darkMode
                                                ? 'border-[#2b2c32] text-gray-200 hover:bg-white/10'
                                                : 'border-gray-200 text-gray-700 hover:bg-gray-100'
                                            : darkMode
                                            ? 'border-[#2b2c32] text-gray-500'
                                            : 'border-gray-200 text-gray-400'
                                    }`}
                                    disabled={!canUploadFiles}
                                >
                                    <Plus size={12} className="inline mr-1" /> Add file
                                </button>
                                <div className={`relative flex-1`}>
                                    <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                                    <input
                                        value={fileSearch}
                                        onChange={(e) => setFileSearch(e.target.value)}
                                        placeholder="Search for files"
                                        className={`w-full h-9 pl-9 pr-3 rounded-md text-xs outline-none border ${
                                            darkMode
                                                ? 'bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                                                : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'
                                        }`}
                                    />
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setFileView("grid")}
                                        className={`p-2 rounded-md border ${
                                            fileView === "grid"
                                                ? darkMode ? 'border-blue-500/40 text-blue-200 bg-blue-500/10' : 'border-blue-500/30 text-blue-700 bg-blue-50'
                                                : darkMode ? 'border-[#2b2c32] text-gray-400 hover:bg-white/5' : 'border-gray-200 text-gray-500 hover:bg-gray-100'
                                        }`}
                                    >
                                        <LayoutGrid size={14} />
                                    </button>
                                    <button
                                        onClick={() => setFileView("list")}
                                        className={`p-2 rounded-md border ${
                                            fileView === "list"
                                                ? darkMode ? 'border-blue-500/40 text-blue-200 bg-blue-500/10' : 'border-blue-500/30 text-blue-700 bg-blue-50'
                                                : darkMode ? 'border-[#2b2c32] text-gray-400 hover:bg-white/5' : 'border-gray-200 text-gray-500 hover:bg-gray-100'
                                        }`}
                                    >
                                        <List size={14} />
                                    </button>
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                onChange={handlePickFiles}
                                className="hidden"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-8">
                            {!canViewFiles ? (
                                <div className={`h-full rounded-2xl border flex flex-col items-center justify-center text-center gap-3 ${
                                    darkMode ? 'border-[#2b2c32] bg-[#0f1224]' : 'border-gray-200 bg-gray-50'
                                }`}>
                                    <div className={`text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                                        You don't have access to files for this item.
                                    </div>
                                    <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                        Contact an admin to request access.
                                    </div>
                                </div>
                            ) : filteredFiles.length === 0 ? (
                                <div className={`h-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center gap-4 ${
                                    isDraggingFiles
                                        ? darkMode ? 'border-blue-400/70 bg-blue-500/10' : 'border-blue-400 bg-blue-50'
                                        : darkMode ? 'border-[#2b2c32] bg-[#0f1224]' : 'border-gray-200 bg-gray-50'
                                }`}>
                                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ${
                                        darkMode ? 'bg-[#1c213e] text-blue-300' : 'bg-blue-50 text-blue-600'
                                    }`}>
                                        <Paperclip size={28} />
                                    </div>
                                    <div>
                                        <div className={`text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Drag & drop or add files here</div>
                                        <div className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                            Upload, comment and review files for this item
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => canUploadFiles && fileInputRef.current?.click()}
                                        className={`px-4 py-2 rounded-md text-xs font-semibold ${
                                            canUploadFiles
                                                ? darkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                                                : darkMode ? 'bg-white/10 text-gray-500' : 'bg-gray-200 text-gray-400'
                                        }`}
                                        disabled={!canUploadFiles}
                                    >
                                        <Plus size={12} className="inline mr-1" /> Add file
                                    </button>
                                </div>
                            ) : (
                                <div className={fileView === "grid" ? "grid grid-cols-2 gap-4" : "space-y-3"}>
                                    {filteredFiles.map((file) => {
                                        const previewSrc = file.url || file.dataUrl;
                                        const isImage = Boolean(previewSrc && file.type?.startsWith("image/"));
                                        const minRole = file.access?.minRole || "viewer";
                                        const canSeeAccess = canManageFileAccess;
                                        return (
                                            <div
                                                key={file.id}
                                                className={`rounded-xl border overflow-hidden ${
                                                    darkMode ? 'border-[#2b2c32] bg-[#0f1224]' : 'border-gray-200 bg-white'
                                                } ${fileView === "list" ? "flex items-center gap-3 p-3" : ""} ${previewSrc ? "cursor-pointer" : ""}`}
                                                onClick={() => {
                                                    if (!previewSrc) return;
                                                    if (canDownloadFiles) {
                                                        window.open(previewSrc, "_blank", "noopener,noreferrer");
                                                    } else {
                                                        setPreviewFile(file);
                                                    }
                                                }}
                                            >
                                                {fileView === "grid" ? (
                                                    <>
                                                        <div className={`h-28 flex items-center justify-center ${darkMode ? 'bg-[#0b0e1c]' : 'bg-gray-50'}`}>
                                                            {isImage ? (
                                                                <img src={previewSrc} alt={file.name} className="h-full w-full object-cover" />
                                                            ) : (
                                                                <FileText size={28} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
                                                            )}
                                                        </div>
                                                        <div className="p-3">
                                                            <div className={`text-xs font-semibold truncate ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{file.name}</div>
                                                            <div className={`text-[11px] mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                                                {formatBytes(file.size)} • {formatTime(file.createdAt)}
                                                            </div>
                                                            {canSeeAccess && (
                                                                <div className="mt-2">
                                                                    <select
                                                                        value={minRole}
                                                                        onChange={(e) => onUpdateFileAccess?.(file.id, { minRole: e.target.value })}
                                                                        className={`text-[11px] px-2 py-1 rounded border outline-none ${
                                                                            darkMode
                                                                                ? 'bg-[#0b0e1c] border-[#2b2c32] text-gray-200'
                                                                                : 'bg-white border-gray-200 text-gray-700'
                                                                        }`}
                                                                    >
                                                                        <option value="owner">Owner only</option>
                                                                        <option value="admin">Admin+</option>
                                                                        <option value="editor">Editor+</option>
                                                                        <option value="contributor">Contributor+</option>
                                                                        <option value="viewer">All members</option>
                                                                    </select>
                                                                </div>
                                                            )}
                                                            {canSeeAccess && (
                                                                <div className="mt-2 flex items-center gap-2 text-[11px]">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onToggleShareLink?.(file);
                                                                        }}
                                                                        className={`px-2 py-1 rounded border ${
                                                                            file.access?.allowShareLink
                                                                                ? darkMode ? 'border-blue-500/40 text-blue-200 bg-blue-500/10' : 'border-blue-500/30 text-blue-700 bg-blue-50'
                                                                                : darkMode ? 'border-[#2b2c32] text-gray-400' : 'border-gray-200 text-gray-500'
                                                                        }`}
                                                                    >
                                                                        {file.access?.allowShareLink ? "Revoke link" : "Enable link"}
                                                                    </button>
                                                                    {file.access?.allowShareLink && file.access?.shareToken && shareBaseUrl && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                const link = `${shareBaseUrl}?token=${file.access.shareToken}`;
                                                                                navigator.clipboard?.writeText(link);
                                                                            }}
                                                                            className={`px-2 py-1 rounded border ${
                                                                                darkMode ? 'border-[#2b2c32] text-gray-200' : 'border-gray-200 text-gray-600'
                                                                            }`}
                                                                        >
                                                                            Copy link
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${darkMode ? 'bg-[#0b0e1c]' : 'bg-gray-50'}`}>
                                                            {isImage ? (
                                                                <img src={previewSrc} alt={file.name} className="w-12 h-12 object-cover rounded-lg" />
                                                            ) : (
                                                                <FileText size={18} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className={`text-xs font-semibold truncate ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{file.name}</div>
                                                            <div className={`text-[11px] mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                                                {formatBytes(file.size)} • {formatTime(file.createdAt)}
                                                            </div>
                                                            {canSeeAccess && (
                                                                <div className="mt-2">
                                                                    <select
                                                                        value={minRole}
                                                                        onChange={(e) => onUpdateFileAccess?.(file.id, { minRole: e.target.value })}
                                                                        className={`text-[11px] px-2 py-1 rounded border outline-none ${
                                                                            darkMode
                                                                                ? 'bg-[#0b0e1c] border-[#2b2c32] text-gray-200'
                                                                                : 'bg-white border-gray-200 text-gray-700'
                                                                        }`}
                                                                    >
                                                                        <option value="owner">Owner only</option>
                                                                        <option value="admin">Admin+</option>
                                                                        <option value="editor">Editor+</option>
                                                                        <option value="contributor">Contributor+</option>
                                                                        <option value="viewer">All members</option>
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {canSeeAccess && (
                                                            <div className="flex items-center gap-2 text-[11px]">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onToggleShareLink?.(file);
                                                                    }}
                                                                    className={`px-2 py-1 rounded border ${
                                                                        file.access?.allowShareLink
                                                                            ? darkMode ? 'border-blue-500/40 text-blue-200 bg-blue-500/10' : 'border-blue-500/30 text-blue-700 bg-blue-50'
                                                                            : darkMode ? 'border-[#2b2c32] text-gray-400' : 'border-gray-200 text-gray-500'
                                                                    }`}
                                                                >
                                                                    {file.access?.allowShareLink ? "Revoke link" : "Enable link"}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        {previewFile && (
                            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setPreviewFile(null)}>
                                <div
                                    className={`w-[80vw] max-w-[920px] max-h-[80vh] rounded-xl overflow-hidden shadow-2xl ${
                                        darkMode ? "bg-[#151726]" : "bg-white"
                                    }`}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className={`px-4 py-3 border-b flex items-center justify-between ${darkMode ? "border-[#2b2c32]" : "border-gray-200"}`}>
                                        <div className={`text-sm font-semibold ${darkMode ? "text-gray-200" : "text-gray-700"}`}>{previewFile.name}</div>
                                        <button
                                            className={`text-xs px-2 py-1 rounded ${darkMode ? "hover:bg-white/10 text-gray-300" : "hover:bg-gray-100 text-gray-600"}`}
                                            onClick={() => setPreviewFile(null)}
                                        >
                                            Close
                                        </button>
                                    </div>
                                    <div className="p-4">
                                        {previewFile.type?.startsWith("image/") ? (
                                            <img src={previewFile.url || previewFile.dataUrl} alt={previewFile.name} className="max-h-[60vh] w-full object-contain" />
                                        ) : previewFile.url || previewFile.dataUrl ? (
                                            <iframe
                                                title={previewFile.name}
                                                src={previewFile.url || previewFile.dataUrl}
                                                className="w-full h-[60vh] rounded-lg bg-white"
                                            />
                                        ) : (
                                            <div className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                                                Preview is unavailable for this file type.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const MembersModal = ({
    open,
    onClose,
    darkMode,
    project,
    members,
    invites,
    currentMember,
    canManageMembers,
    onInvite,
    onUpdateMember,
    onRemoveMember,
    onRevokeInvite,
}) => {
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState("viewer");
    const [inviteBaseRole, setInviteBaseRole] = useState("contributor");
    const [inviteUntil, setInviteUntil] = useState("");

    useEffect(() => {
        if (!open) return;
        setInviteEmail("");
        setInviteRole("viewer");
        setInviteBaseRole("contributor");
        setInviteUntil("");
    }, [open, project?.id]);

    if (!open || !project) return null;
    const canManage = !!canManageMembers;
    const formatDateInput = (dateValue) => {
        if (!dateValue) return "";
        const d = getMemberAccessUntil({ accessUntil: dateValue });
        if (!d || Number.isNaN(d.getTime())) return "";
        return d.toISOString().slice(0, 10);
    };

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div
                className={`w-[640px] max-w-[95vw] max-h-[85vh] rounded-xl shadow-2xl p-6 overflow-y-auto ${
                    darkMode ? "bg-[#1c213e] text-white border border-[#2b2c32]" : "bg-white text-gray-900 border border-gray-200"
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold">Members</h3>
                        <p className={`text-xs mt-1 ${darkMode ? "text-gray-300" : "text-gray-500"}`}>
                            {project.name}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className={`text-sm px-2 py-1 rounded ${darkMode ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                        type="button"
                    >
                        Close
                    </button>
                </div>

                {canManage ? (
                    <div className={`p-4 rounded-lg border mb-5 ${darkMode ? "border-[#2b2c32] bg-[#151726]" : "border-gray-200 bg-gray-50"}`}>
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Invite member</div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <input
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="email@company.com"
                                className={`md:col-span-2 h-9 px-3 rounded-md text-xs outline-none border ${
                                    darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200" : "bg-white border-gray-200 text-gray-700"
                                }`}
                            />
                            <select
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value)}
                                className={`h-9 px-2 rounded-md text-xs outline-none border ${
                                    darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200" : "bg-white border-gray-200 text-gray-700"
                                }`}
                            >
                                {ROLE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <button
                                onClick={async () => {
                                    if (!inviteEmail.trim()) return;
                                    const untilDate = inviteUntil ? new Date(`${inviteUntil}T00:00:00`) : null;
                                    const inviteResult = await onInvite?.({
                                        projectId: project.id,
                                        email: inviteEmail.trim(),
                                        role: inviteRole,
                                        baseRole: inviteRole === "contractor" ? inviteBaseRole : null,
                                        accessUntil: inviteRole === "contractor" ? untilDate : null,
                                    });
                                    if (inviteResult?.inviteLink) {
                                        if (navigator.clipboard?.writeText) {
                                            try {
                                                await navigator.clipboard.writeText(inviteResult.inviteLink);
                                            } catch {}
                                        }
                                        const promptTitle = inviteResult?.emailQueued
                                            ? "Invite created. Keep this link as a backup:"
                                            : "Email delivery is not configured yet. Share this invite link:";
                                        window.prompt(promptTitle, inviteResult.inviteLink);
                                    }
                                    setInviteEmail("");
                                    setInviteRole("viewer");
                                    setInviteBaseRole("contributor");
                                    setInviteUntil("");
                                }}
                                className={`h-9 rounded-md text-xs font-semibold ${
                                    darkMode ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
                                }`}
                            >
                                Send invite
                            </button>
                        </div>
                        {inviteRole === "contractor" && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                                <select
                                    value={inviteBaseRole}
                                    onChange={(e) => setInviteBaseRole(e.target.value)}
                                    className={`h-9 px-2 rounded-md text-xs outline-none border ${
                                        darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200" : "bg-white border-gray-200 text-gray-700"
                                    }`}
                                >
                                    <option value="contributor">Contributor</option>
                                    <option value="editor">Editor</option>
                                    <option value="viewer">Viewer</option>
                                </select>
                                <input
                                    type="date"
                                    value={inviteUntil}
                                    onChange={(e) => setInviteUntil(e.target.value)}
                                    className={`h-9 px-2 rounded-md text-xs outline-none border ${
                                        darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200" : "bg-white border-gray-200 text-gray-700"
                                    }`}
                                />
                                <div className={`text-[11px] self-center ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                    Contractor access expiry
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={`mb-5 text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                        Only admins can invite or edit members.
                    </div>
                )}

                <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Members</div>
                    {members.length === 0 && (
                        <div className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>No members yet.</div>
                    )}
                    {members.map((member) => {
                        const effectiveRole = getMemberEffectiveRole(member);
                        const isActive = isMemberActive(member);
                        const memberId = member.uid || member.id;
                        const isSelf = memberId === currentMember?.uid;
                        const untilValue = formatDateInput(member.accessUntil);
                        return (
                            <div key={memberId} className={`p-3 rounded-lg border ${darkMode ? "border-[#2b2c32] bg-[#151726]" : "border-gray-200 bg-gray-50"}`}>
                                <div className="flex flex-wrap items-center gap-3 justify-between">
                                    <div>
                                        <div className={`text-sm font-semibold ${darkMode ? "text-gray-200" : "text-gray-700"}`}>{member.email || memberId}</div>
                                        <div className={`text-[11px] ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                                            {member.role === "contractor" ? `Contractor (${effectiveRole})` : effectiveRole}
                                            {!isActive && " · expired"}
                                            {isSelf && " · you"}
                                        </div>
                                    </div>
                                    {canManage ? (
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={member.role}
                                                onChange={(e) => onUpdateMember?.(project.id, memberId, { role: e.target.value })}
                                                className={`h-8 px-2 rounded-md text-xs outline-none border ${
                                                    darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200" : "bg-white border-gray-200 text-gray-700"
                                                }`}
                                            >
                                                {ROLE_OPTIONS.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                            {member.role === "contractor" && (
                                                <>
                                                    <select
                                                        value={member.baseRole || "viewer"}
                                                        onChange={(e) => onUpdateMember?.(project.id, memberId, { baseRole: e.target.value })}
                                                        className={`h-8 px-2 rounded-md text-xs outline-none border ${
                                                            darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200" : "bg-white border-gray-200 text-gray-700"
                                                        }`}
                                                    >
                                                        <option value="contributor">Contributor</option>
                                                        <option value="editor">Editor</option>
                                                        <option value="viewer">Viewer</option>
                                                    </select>
                                                    <input
                                                        type="date"
                                                        value={untilValue}
                                                        onChange={(e) => {
                                                            const date = e.target.value ? new Date(`${e.target.value}T00:00:00`) : null;
                                                            onUpdateMember?.(project.id, memberId, { accessUntil: date });
                                                        }}
                                                        className={`h-8 px-2 rounded-md text-xs outline-none border ${
                                                            darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200" : "bg-white border-gray-200 text-gray-700"
                                                        }`}
                                                    />
                                                </>
                                            )}
                                            <button
                                                onClick={() => onRemoveMember?.(project.id, memberId)}
                                                className={`h-8 px-2 rounded-md text-xs font-semibold ${
                                                    darkMode ? "bg-red-500/20 text-red-300" : "bg-red-50 text-red-600"
                                                }`}
                                                disabled={isSelf}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {canManage && invites.length > 0 && (
                    <div className="mt-6 space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pending invites</div>
                        {invites.filter((i) => i.status === "pending").map((invite) => (
                            <div key={invite.id} className={`p-3 rounded-lg border flex items-center justify-between ${darkMode ? "border-[#2b2c32] bg-[#151726]" : "border-gray-200 bg-gray-50"}`}>
                                <div>
                                    <div className={`text-sm font-semibold ${darkMode ? "text-gray-200" : "text-gray-700"}`}>{invite.email}</div>
                                    <div className={`text-[11px] ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                                        {invite.role === "contractor" ? `Contractor (${invite.baseRole || "viewer"})` : invite.role}
                                    </div>
                                </div>
                                <button
                                    onClick={() => onRevokeInvite?.(project.id, invite.id)}
                                    className={`h-8 px-2 rounded-md text-xs font-semibold ${
                                        darkMode ? "bg-white/10 text-gray-300" : "bg-gray-200 text-gray-600"
                                    }`}
                                >
                                    Revoke
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const DatePicker = ({ datePickerOpen, setDatePickerOpen, darkMode, updateTaskDate }) => {
    const [rangeStart, setRangeStart] = useState(null);
    const [rangeEnd, setRangeEnd] = useState(null);
    const [isDraggingRange, setIsDraggingRange] = useState(false);
    const dragAnchorRef = useRef(null);

    useEffect(() => {
        if (!datePickerOpen) {
            setRangeStart(null);
            setRangeEnd(null);
            setIsDraggingRange(false);
            dragAnchorRef.current = null;
            return;
        }
        const safeDuration = Math.max(1, Number(datePickerOpen.duration || 1));
        const nextStart = datePickerOpen.start ? relativeIndexFromDateKey(datePickerOpen.start) : null;
        const nextEnd =
            nextStart !== null && nextStart !== undefined ? nextStart + safeDuration - 1 : null;
        setRangeStart(nextStart);
        setRangeEnd(nextEnd);
        setIsDraggingRange(false);
        dragAnchorRef.current = null;
    }, [datePickerOpen]);

    useEffect(() => {
        if (!isDraggingRange) return;
        const handleMouseUp = () => {
            setIsDraggingRange(false);
            dragAnchorRef.current = null;
        };
        window.addEventListener("mouseup", handleMouseUp);
        return () => window.removeEventListener("mouseup", handleMouseUp);
    }, [isDraggingRange]);

    if (!datePickerOpen) return null;
    const { projectId, taskId, subitemId, el } = datePickerOpen;
    const rect =
        el && typeof el.getBoundingClientRect === "function"
            ? el.getBoundingClientRect()
            : { bottom: window.innerHeight / 2, left: window.innerWidth / 2 };
    const top = Math.min(window.innerHeight - 340, rect.bottom + 5);
    const left = Math.min(window.innerWidth - 300, rect.left);

    const commitRange = (nextStart, nextEnd) => {
        if (nextStart === null || nextStart === undefined) {
            updateTaskDate(projectId, taskId, subitemId, null, null);
            return;
        }
        const safeEnd =
            nextEnd === null || nextEnd === undefined ? nextStart : Math.max(nextEnd, nextStart);
        const nextDuration = Math.max(1, safeEnd - nextStart + 1);
        updateTaskDate(projectId, taskId, subitemId, dateKeyFromRelativeIndex(nextStart), nextDuration);
    };

    const handleDateSelect = (relIndex) => {
        if (relIndex === null || relIndex === undefined) return;
        const hasStart = rangeStart !== null && rangeStart !== undefined;
        const hasEnd = rangeEnd !== null && rangeEnd !== undefined;

        if (!hasStart) {
            setRangeStart(relIndex);
            setRangeEnd(null);
            commitRange(relIndex, relIndex);
            return;
        }

        if (!hasEnd) {
            if (relIndex < rangeStart) {
                setRangeStart(relIndex);
                setRangeEnd(null);
                commitRange(relIndex, relIndex);
                return;
            }
            setRangeEnd(relIndex);
            commitRange(rangeStart, relIndex);
            return;
        }

        if (relIndex < rangeStart) {
            setRangeStart(relIndex);
            commitRange(relIndex, rangeEnd);
            return;
        }
        if (relIndex > rangeEnd) {
            setRangeEnd(relIndex);
            commitRange(rangeStart, relIndex);
            return;
        }

        setRangeEnd(relIndex);
        commitRange(rangeStart, relIndex);
    };

    const handleDragStart = (relIndex) => {
        if (relIndex === null || relIndex === undefined) return;
        dragAnchorRef.current = relIndex;
        setIsDraggingRange(true);
    };

    const handleDragMove = (relIndex) => {
        if (!isDraggingRange) return;
        const anchor = dragAnchorRef.current;
        if (anchor === null || anchor === undefined) return;
        if (relIndex === anchor) return;
        const nextStart = Math.min(anchor, relIndex);
        const nextEnd = Math.max(anchor, relIndex);
        setRangeStart(nextStart);
        setRangeEnd(nextEnd);
        commitRange(nextStart, nextEnd);
    };

    const handleClear = () => {
        updateTaskDate(projectId, taskId, subitemId, null, null);
        setRangeStart(null);
        setRangeEnd(null);
        setIsDraggingRange(false);
        dragAnchorRef.current = null;
        setDatePickerOpen(null);
    };

    const getInputValue = (dayIndex) => {
        if (dayIndex === null || dayIndex === undefined) return "";
        return dateKeyFromRelativeIndex(dayIndex);
    };

    const handleStartInputChange = (value) => {
        if (!value) return handleClear();
        const relIdx = relativeIndexFromDateKey(value);
        if (relIdx === null || relIdx === undefined) return;
        const nextEnd =
            rangeEnd !== null && rangeEnd !== undefined && rangeEnd >= relIdx ? rangeEnd : relIdx;
        setRangeStart(relIdx);
        setRangeEnd(nextEnd);
        commitRange(relIdx, nextEnd);
    };

    const handleEndInputChange = (value) => {
        if (!value) {
            if (rangeStart === null || rangeStart === undefined) return handleClear();
            setRangeEnd(null);
            commitRange(rangeStart, rangeStart);
            return;
        }
        const relIdx = relativeIndexFromDateKey(value);
        if (relIdx === null || relIdx === undefined) return;
        const startIdx = rangeStart !== null && rangeStart !== undefined ? rangeStart : relIdx;
        const endIdx = Math.max(relIdx, startIdx);
        setRangeStart(startIdx);
        setRangeEnd(endIdx);
        commitRange(startIdx, endIdx);
    };

    const displayStart = rangeStart;
    const displayEnd =
        rangeEnd !== null && rangeEnd !== undefined ? rangeEnd : rangeStart;
    const rangeLabel =
        displayStart === null || displayStart === undefined
            ? "No dates selected"
            : displayEnd === displayStart
            ? formatDateKey(dateKeyFromRelativeIndex(displayStart))
            : `${formatDateKey(dateKeyFromRelativeIndex(displayStart))} – ${formatDateKey(
                dateKeyFromRelativeIndex(displayEnd)
              )}`;

    return (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setDatePickerOpen(null)}></div>
          <div
            className={`fixed z-[120] w-64 rounded-lg shadow-2xl border p-3 flex flex-col gap-2 ${darkMode ? 'bg-[#2b2c32] border-[#3e3f4b] text-white' : 'bg-white border-gray-200 text-gray-800'}`}
            style={{ top, left }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">
                  <span>Select Date Range</span>
                  <button className="flex items-center gap-1 cursor-pointer hover:text-red-500" onClick={handleClear} type="button">
                      <Trash2 size={12}/> Clear
                  </button>
              </div>
              <div className="text-[11px] opacity-70">{rangeLabel}</div>
              <label className="text-[10px] uppercase tracking-wide opacity-60">Start date</label>
              <input
                type="date"
                value={getInputValue(rangeStart)}
                onChange={(e) => handleStartInputChange(e.target.value)}
                className={`w-full px-2 py-1.5 rounded text-xs border ${
                  darkMode ? 'bg-[#1c213e] border-[#3e3f4b] text-white' : 'bg-white border-gray-200 text-gray-800'
                }`}
              />
              <label className="text-[10px] uppercase tracking-wide opacity-60">End date</label>
              <input
                type="date"
                value={rangeStart === null || rangeStart === undefined ? "" : getInputValue(displayEnd)}
                onChange={(e) => handleEndInputChange(e.target.value)}
                className={`w-full px-2 py-1.5 rounded text-xs border ${
                  darkMode ? 'bg-[#1c213e] border-[#3e3f4b] text-white' : 'bg-white border-gray-200 text-gray-800'
                }`}
              />
              <div className="text-[10px] uppercase tracking-wide opacity-60 mt-2">Quick pick (next 4 weeks)</div>
              <div
                className="grid grid-cols-7 gap-1"
                onMouseLeave={() => {
                  setIsDraggingRange(false);
                  dragAnchorRef.current = null;
                }}
              >
                  {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} className="text-[10px] text-center opacity-50">{d}</div>)}
                  {Array.from({length: 28}).map((_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() + i); 
                      const relIdx = getRelativeFromDate(d);
                      const activeEnd =
                        rangeEnd !== null && rangeEnd !== undefined ? rangeEnd : rangeStart;
                      const isRangeStart = rangeStart !== null && rangeStart !== undefined && relIdx === rangeStart;
                      const isRangeEnd = rangeEnd !== null && rangeEnd !== undefined && relIdx === rangeEnd;
                      const isInRange =
                        rangeStart !== null &&
                        activeEnd !== null &&
                        activeEnd !== undefined &&
                        relIdx > rangeStart &&
                        relIdx < activeEnd;
                      const baseClass = "h-7 w-7 rounded flex items-center justify-center text-xs cursor-pointer transition-colors";
                      const styleClass = isRangeStart || isRangeEnd
                        ? " bg-blue-600 text-white"
                        : isInRange
                        ? darkMode
                          ? " bg-blue-600/30 text-blue-100"
                          : " bg-blue-100 text-blue-700"
                        : darkMode
                          ? " hover:bg-white/10"
                          : " hover:bg-gray-100";
                      return (
                        <div
                          key={i}
                          onClick={() => handleDateSelect(relIdx)}
                          onMouseDown={() => handleDragStart(relIdx)}
                          onMouseEnter={() => handleDragMove(relIdx)}
                          className={baseClass + styleClass}
                        >
                          {d.getDate()}
                        </div>
                      );
                  })}
              </div>
          </div>
        </>
    );
};



// --- BOARD VIEW ---
const BoardView = (props) => {
    const { visibleProjects, collapsedGroups, toggleGroupCollapse, updateGroupName, statuses, darkMode, addTaskToGroup, addGroup, reorderDrag, boardColumns, onStartResize, canEditProject } = props;
    return (
        <div className={`flex-1 overflow-auto pb-40 ${darkMode ? 'bg-[#181b34]' : 'bg-[#f5f6f8]'}`}>
            {visibleProjects.map(proj => {
                const canEdit = canEditProject ? canEditProject(proj.id) : true;
                const defaultGroups = proj.groups || [{ id: 'default', name: 'Main Group', color: '#579bfc' }];
                return (
                    <div key={proj.id} className="mb-10 px-8 mt-8">
                         <div className={`mb-4 px-1 flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                             <LayoutGrid size={15} className="opacity-70" />
                             <span className="text-sm font-semibold">{proj.name || "Untitled Board"}</span>
                         </div>
                         {defaultGroups.map(group => {
                             const groupTasks = proj.tasks.filter(t => t.groupId === group.id || (!t.groupId && group.id === 'default'));
                             const isGroupCollapsed = collapsedGroups.includes(group.id);
                             return (
                                 <div key={group.id} className="mb-8">
                                     <div
                                         className={`flex items-center gap-2 mb-2 group rounded-md px-1 ${reorderDrag.active && reorderDrag.dropTargetType === 'group' && reorderDrag.dropTargetId === group.id && reorderDrag.dropTargetProjectId === proj.id ? (darkMode ? 'bg-blue-500/10' : 'bg-blue-50') : ''}`}
                                         onDragOver={(e) => canEdit && props.handleGroupDragOver(e, proj.id, group.id)}
                                         onDrop={(e) => canEdit && props.handleGroupDrop(e, proj.id, group.id)}
                                     >
                                         <div onClick={() => toggleGroupCollapse(group.id)} className={`p-1 rounded cursor-pointer transition ${isGroupCollapsed ? '-rotate-90' : 'rotate-0'} ${darkMode ? 'hover:bg-[#2b2c32]' : 'hover:bg-gray-100'}`}><ChevronDown size={18} style={{ color: group.color }} /></div>
                                         <EditableText value={group.name} onChange={(e) => { if (!canEdit) return; updateGroupName(proj.id, group.id, e.target.value); }} className="text-lg font-medium" style={{ color: group.color }} />
                                         <span className="text-xs text-gray-500 font-normal ml-2">{groupTasks.length} Items</span>
                                     </div>
                                     {!isGroupCollapsed ? (
                                         <div className={`shadow-sm border-l-4 rounded-tl-md rounded-bl-md overflow-visible ${darkMode ? 'border-[#2b2c32]' : 'border-gray-200'}`} style={{ borderLeftColor: group.color }}>
                                             <GroupHeaderRow darkMode={darkMode} boardColumns={boardColumns} onStartResize={onStartResize} />
                                             {groupTasks.map((task) => {
                                                 const isExpanded = props.expandedItems.includes(task.id);
                                                 return (
                                                     <React.Fragment key={task.id}>
                                                         <TaskRow {...props} task={task} projectId={proj.id} isSubitem={false} isDragging={props.reorderDrag.active && props.reorderDrag.dragId === task.id} onDragStart={(e) => canEdit && props.handleRowDragStart(e, 'task', task.id, proj.id)} onDragOver={(e) => canEdit && props.handleRowDragOver(e, 'task', task.id)} onDrop={props.handleRowDrop} onDragEnd={props.handleRowDragEnd} isSelected={props.selectedItems.has(task.id)} onToggle={props.toggleSelection} onAddSubitem={props.handleAddSubitem} canEdit={canEdit} onEditStatusLabels={() => props.onEditStatusLabels?.(proj.id)} onEditTypeLabels={() => props.onEditTypeLabels?.(proj.id)} onAddStatusLabel={(label, color) => props.onAddStatusLabel?.(proj.id, label, color)} onAddTypeLabel={(label, color) => props.onAddTypeLabel?.(proj.id, label, color)} />
                                                         {isExpanded && task.subitems.map((sub) => (
                                                             <TaskRow {...props} key={sub.id} task={sub} projectId={proj.id} parentId={task.id} isSubitem={true} isDragging={props.reorderDrag.active && props.reorderDrag.dragId === sub.id} onDragStart={(e) => canEdit && props.handleRowDragStart(e, 'subitem', sub.id, proj.id)} onDragOver={(e) => canEdit && props.handleRowDragOver(e, 'subitem', sub.id)} onDrop={props.handleRowDrop} onDragEnd={props.handleRowDragEnd} isSelected={props.selectedItems.has(sub.id)} onToggle={props.toggleSelection} canEdit={canEdit} onEditStatusLabels={() => props.onEditStatusLabels?.(proj.id)} onEditTypeLabels={() => props.onEditTypeLabels?.(proj.id)} onAddStatusLabel={(label, color) => props.onAddStatusLabel?.(proj.id, label, color)} onAddTypeLabel={(label, color) => props.onAddTypeLabel?.(proj.id, label, color)} />
                                                         ))}
                                                     </React.Fragment>
                                                 );
                                             })}
                                             <div className={`flex h-10 items-center border-b ${darkMode ? 'border-[#2b2c32] hover:bg-[#202336] bg-[#181b34]' : 'border-[#eceff8] hover:bg-[#f5f6f8] bg-white'}`}>
                                                 <div className={`border-r h-full ${darkMode ? 'border-[#2b2c32]' : 'border-[#eceff8]'}`} style={{ width: boardColumns.select }}></div>
                                                 <div className="px-4 flex items-center" style={{ width: boardColumns.item }}><input type="text" placeholder="+ Add Item" disabled={!canEdit} className={`w-full bg-transparent outline-none text-sm ${darkMode ? 'text-gray-400 placeholder-gray-600' : 'text-gray-500 placeholder-gray-400'} ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { if (!canEdit) return; addTaskToGroup(proj.id, group.id, e.target.value); e.target.value = ''; }}} /></div>
                                             </div>
                                         </div>
                                      ) : (
                                          <div className="h-10 flex items-center rounded-md overflow-hidden relative pl-4" style={{ backgroundColor: darkMode ? '#2b2c32' : '#f0f0f0' }}><div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: group.color }}></div><div className="flex-1 flex h-full">{statuses.map(s => { const count = groupTasks.filter(t => t.status === s.id).length; if (count === 0) return null; const pct = (count / groupTasks.length) * 100; return <div key={s.id} style={{ width: `${pct}%`, backgroundColor: s.color }} title={`${s.label}: ${count}`} className="h-full first:rounded-l-none" />; })}</div><div className={`w-32 flex items-center justify-center text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{groupTasks.length} Items</div></div>
                                       )}
                                  </div>
                             );
                         })}
                         <button onClick={() => canEdit && addGroup(proj.id)} className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded border transition-colors ${darkMode ? 'border-[#2b2c32] hover:bg-[#2b2c32] text-gray-300' : 'border-gray-200 hover:bg-gray-50 text-gray-600'} ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={!canEdit}><Plus size={16} /> Add New Group</button>
                    </div>
                );
            })}
        </div>
    );
};

// ==========================================
// 6. MAIN CONTROLLER (BRAIN)
// ==========================================

export default function ProjectManagerAI() {
  const [activeTab, setActiveTab] = useState('board'); 
  const [darkMode, setDarkMode] = useState(true); 
  const [showWeekends, setShowWeekends] = useState(false); 
  const [showLabels, setShowLabels] = useState(true);
  const [colorBy, setColorBy] = useState('status'); 
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  // ✅ switched these to hybrid (localStorage + Firestore)
  const [workspaces, setWorkspaces] = useHybridState('pmai_workspaces', INITIAL_WORKSPACES, 'workspaces');
  const [dashboards, setDashboards] = useHybridState('pmai_dashboards', INITIAL_DASHBOARDS, 'dashboards');
  const [statuses, setStatuses] = useHybridState('pmai_statuses', DEFAULT_STATUSES, 'labels');
  const [jobTypes, setJobTypes] = useHybridState('pmai_jobTypes', DEFAULT_JOB_TYPES, 'labels');
  const [boardColumnsByEntity, setBoardColumnsByEntity] = usePersistentState('pmai_board_columns', {});

  const [activeEntityId, setActiveEntityId] = usePersistentState('pmai_active_workspace_id', INITIAL_WORKSPACES[0].id); 
  const [activeBoardId, setActiveBoardId] = usePersistentState('pmai_active_board_id', INITIAL_PROJECTS[0]?.id || null);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState([{ role: 'ai', text: "Workspace ready." }]);
  const [inputText, setInputText] = useState('');
  const [zoomLevel, setZoomLevel] = useState(30); 
  const [rowHeight, setRowHeight] = useState(40); 
  const [boardColumns, setBoardColumns] = useState(DEFAULT_BOARD_COLUMNS);
  const [statusMenuOpen, setStatusMenuOpen] = useState(null); 
  const [statusMenuType, setStatusMenuType] = useState('status'); 
  const [statusEditorOpen, setStatusEditorOpen] = useState(false); 
  const [jobTypeEditorOpen, setJobTypeEditorOpen] = useState(false); 
  const [datePickerOpen, setDatePickerOpen] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [projectMembersById, setProjectMembersById] = useState({});
  const [myMembershipByProjectId, setMyMembershipByProjectId] = useState({});
  const [projectInvitesById, setProjectInvitesById] = useState({});
  const [projectFilesById, setProjectFilesById] = useState({});
  const [memberProjects, setMemberProjects] = useState([]);
  const [ownedProjects, setOwnedProjects] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState([]);
  const [expandedItems, setExpandedItems] = useState(['t1']); 
  const [updatesPanelTarget, setUpdatesPanelTarget] = useState(null);
  const [reorderDrag, setReorderDrag] = useState({ active: false, type: null, dragId: null, parentId: null, dropTargetId: null, dropTargetType: null, dropTargetProjectId: null, sourceProjectId: null, dropPosition: 'before', originalExpanded: false });
  const reorderDragRef = useRef(reorderDrag);
  const [dragState, setDragState] = useState({ isDragging: false, type: null, taskId: null, subitemId: null, projectId: null, startX: 0, originalStart: 0, originalDuration: 0, currentSpan: 0, currentVisualSlot: 0, hasMoved: false, isDeleteMode: false, origin: null });
  const bodyRef = useRef(null);
  const boardResizeRef = useRef(null);
  const weekendFocusRef = useRef(null);
  const zoomFocusRef = useRef(null);
  const boardColumnsRef = useRef(boardColumns);
  const boardIsResizingRef = useRef(false);
  const prevTabRef = useRef(null);
  const ensuredProjectsRef = useRef(new Set());
  const projectStatePayloadRef = useRef(new Map());
  const projectStateWriteTimersRef = useRef(new Map());

  useEffect(() => {
    return () => {
      projectStateWriteTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      projectStateWriteTimersRef.current.clear();
    };
  }, []);

  // --- DERIVED STATE ---
  const rawDays = useMemo(() => generateTimelineData(), []);
  const { visibleDays, visibleMonths, dayToVisualIndex, visualIndexToDayIndex } = useMemo(() => {
    const days = []; const d2v = {}; const v2d = {}; let visualIndex = 0;
    
    let weekendTodayHidden = false;
    if (!showWeekends) {
        const todayDay = rawDays.find(d => d.index === 0);
        if (todayDay && (todayDay.isWeekend)) {
            weekendTodayHidden = true;
        }
    }

    rawDays.forEach((day) => {
        let isEndOfWeekToday = false;
        
        if (!showWeekends) {
             if (weekendTodayHidden && day.dayName === 'Fri') {
                 const todayIndex = rawDays.findIndex(d => d.index === 0);
                 const thisIndex = rawDays.indexOf(day);
                 if (todayIndex > thisIndex && (todayIndex - thisIndex) <= 2) {
                     isEndOfWeekToday = true;
                 }
             }
        }

        if (showWeekends || !day.isWeekend) { 
            days.push({ ...day, visualIndex, isEndOfWeekToday }); 
            d2v[day.index] = visualIndex; 
            v2d[visualIndex] = day.index; 
            visualIndex++; 
        } else { 
            d2v[day.index] = visualIndex; 
        }
    });

    const months = []; let currentMonthLabel = ''; let currentMonthCount = 0;
    days.forEach(day => { if (day.monthName !== currentMonthLabel) { if (currentMonthLabel) months.push({ name: currentMonthLabel, count: currentMonthCount }); currentMonthLabel = day.monthName; currentMonthCount = 1; } else { currentMonthCount++; } });
    if (currentMonthLabel) months.push({ name: currentMonthLabel, count: currentMonthCount });
    return { visibleDays: days, visibleMonths: months, dayToVisualIndex: d2v, visualIndexToDayIndex: v2d };
  }, [rawDays, showWeekends]);

  const { 
    projects, setProjects, 
    addProjectToWorkspace, addGroup, updateProjectName, updateGroupName, updateTaskName, updateSubitemName, 
    addTaskToGroup, addSubitem, updateTaskDate, changeStatus, changeJobType, addUpdate, addReply, addFile, toggleChecklistItem, deleteSelection
  } = useProjectData();

  const activeEntity = useMemo(() => {
      const allEntities = [...workspaces, ...dashboards];
      const found = allEntities.find(e => e.id === activeEntityId);
      return found || workspaces[0] || { id: 'fallback', name: 'Fallback Workspace', type: 'workspace' };
  }, [workspaces, dashboards, activeEntityId]);

  const memberProjectsById = useMemo(() => {
    const next = {};
    (ownedProjects || []).forEach((row) => {
      const projectId = row?.projectId;
      if (!projectId || next[projectId]) return;
      next[projectId] = row;
    });
    (memberProjects || []).forEach((row) => {
      const projectId = row?.projectId;
      if (!projectId) return;
      next[projectId] = { ...(next[projectId] || {}), ...row };
    });
    return next;
  }, [memberProjects, ownedProjects]);
  const memberProjectIdsKey = useMemo(
    () => Object.keys(memberProjectsById).sort().join("|"),
    [memberProjectsById]
  );

  const boardsInActiveWorkspace = useMemo(() => {
    if (!activeEntity || activeEntity.type !== "workspace") return [];
    return projects.filter((project) => project.workspaceId === activeEntity.id);
  }, [projects, activeEntity]);

  useEffect(() => {
    if (!activeEntity || activeEntity.type !== "workspace") return;
    if (boardsInActiveWorkspace.length === 0) {
      if (activeBoardId !== null) setActiveBoardId(null);
      return;
    }
    const hasActiveBoard = activeBoardId && boardsInActiveWorkspace.some((project) => project.id === activeBoardId);
    if (!hasActiveBoard) {
      setActiveBoardId(boardsInActiveWorkspace[0].id);
    }
  }, [activeEntity?.id, activeEntity?.type, boardsInActiveWorkspace, activeBoardId]);

  const visibleProjects = useMemo(() => {
    if (!activeEntity) return [];
    if (activeEntity.type === 'workspace') {
      if (!activeBoardId) return [];
      return projects.filter((project) => project.workspaceId === activeEntity.id && project.id === activeBoardId);
    }
    const includedWorkspaces = new Set(activeEntity.includedWorkspaces || []);
    return projects.filter((p) => includedWorkspaces.has(p.workspaceId));
  }, [projects, activeEntity, activeBoardId]);
  const visibleProjectsRef = useRef(visibleProjects);
  const visibleProjectIdsKey = useMemo(
    () => visibleProjects.map((project) => project.id).join("|"),
    [visibleProjects]
  );
  const visibleProjectSetupKey = useMemo(
    () => visibleProjects.map((project) => `${project.id}:${project.name || ""}`).join("|"),
    [visibleProjects]
  );

  useEffect(() => {
    visibleProjectsRef.current = visibleProjects;
  }, [visibleProjects]);

  const activeProject = visibleProjects[0] || null;

  useEffect(() => {
    const workspaceNamesById = {};
    (projects || []).forEach((project) => {
      const workspaceId = project?.workspaceId;
      const workspaceName = typeof project?.workspaceName === "string" ? project.workspaceName.trim() : "";
      if (!workspaceId || !workspaceName) return;
      if (!workspaceNamesById[workspaceId]) workspaceNamesById[workspaceId] = workspaceName;
    });
    const nameEntries = Object.entries(workspaceNamesById);
    if (nameEntries.length === 0) return;

    setWorkspaces((prev) => {
      const existingIds = new Set(prev.map((workspace) => workspace.id));
      let changed = false;
      const next = prev.map((workspace) => {
        const sharedName = workspaceNamesById[workspace.id];
        if (sharedName && sharedName !== workspace.name) {
          changed = true;
          return { ...workspace, name: sharedName };
        }
        return workspace;
      });

      nameEntries.forEach(([workspaceId, workspaceName]) => {
        if (!workspaceName || existingIds.has(workspaceId)) return;
        changed = true;
        next.push({ id: workspaceId, name: workspaceName, type: "workspace" });
      });

      return changed ? next : prev;
    });
  }, [projects, setWorkspaces]);

  const getProjectMembers = (projectId) => projectMembersById[projectId] || [];
  const getCurrentMember = (projectId) => {
    if (!authUser || !projectId) return null;
    const self = myMembershipByProjectId[projectId];
    if (self) return self;
    const memberFromList = getProjectMembers(projectId).find((m) => (m.uid || m.id) === authUser.uid);
    if (memberFromList) return memberFromList;
    const knownMembership = memberProjectsById?.[projectId] || null;
    if (!knownMembership) return null;
    return {
      uid: authUser.uid,
      email: authUser.email || "",
      role: knownMembership.role || "viewer",
      baseRole: knownMembership.baseRole || null,
      accessUntil: knownMembership.accessUntil || null,
      status: knownMembership.status || "active",
    };
  };
  const getMemberPermissions = (member) => {
    if (!member) {
      return { role: "viewer", rank: 0, canView: false, canUpload: false, canDownload: false, canEditFiles: false, canManageMembers: false, canManageFileAccess: false };
    }
    const isActive = isMemberActive(member);
    const effectiveRole = getMemberEffectiveRole(member);
    const rank = ROLE_RANK[effectiveRole] || 0;
    if (!isActive) {
      return { role: effectiveRole, rank: 0, canView: false, canUpload: false, canDownload: false, canEditFiles: false, canManageMembers: false, canManageFileAccess: false };
    }
    return {
      role: effectiveRole,
      rank,
      canView: rank >= ROLE_RANK.viewer,
      canUpload: rank >= ROLE_RANK.contributor,
      canDownload: rank >= ROLE_RANK.contributor,
      canEditFiles: rank >= ROLE_RANK.editor,
      canManageMembers: rank >= ROLE_RANK.admin,
      canManageFileAccess: rank >= ROLE_RANK.admin,
    };
  };
  const canWriteProjectState = (projectId) => {
    if (!projectId || !authUser || authUser.isAnonymous) return false;
    const member = myMembershipByProjectId?.[projectId] || memberProjectsById?.[projectId] || null;
    const permissions = getMemberPermissions(member);
    return permissions.rank >= ROLE_RANK.contributor;
  };
  const canEditProject = (projectId) => {
    if (!projectId || !authUser || authUser.isAnonymous) return false;
    const member = myMembershipByProjectId?.[projectId] || memberProjectsById?.[projectId] || null;
    const permissions = getMemberPermissions(member);
    return permissions.rank >= ROLE_RANK.contributor;
  };
  const getProjectPermissions = (projectId) => {
    if (!projectId || !authUser || authUser.isAnonymous) return getMemberPermissions(null);
    const member = myMembershipByProjectId?.[projectId] || memberProjectsById?.[projectId] || null;
    return getMemberPermissions(member);
  };
  const canRenameWorkspace = (workspaceId) => {
    if (!workspaceId || !authUser || authUser.isAnonymous) return false;
    if (!workspaces.some((workspace) => workspace.id === workspaceId)) return false;
    const workspaceProjects = projects.filter((project) => project.workspaceId === workspaceId);
    if (workspaceProjects.length === 0) return true;
    return workspaceProjects.every((project) => getProjectPermissions(project.id).rank >= ROLE_RANK.editor);
  };
  const canCreateProjectInWorkspace = (workspaceId) => {
    if (!workspaceId || !authUser || authUser.isAnonymous) return false;
    if (!workspaces.some((workspace) => workspace.id === workspaceId)) return false;
    const workspaceProjects = projects.filter((project) => project.workspaceId === workspaceId);
    if (workspaceProjects.length === 0) return true;
    return workspaceProjects.every((project) => getProjectPermissions(project.id).rank >= ROLE_RANK.editor);
  };

  const captureTimelineCenter = () => {
    if (activeTab !== 'gantt' || !bodyRef.current) return null;
    const container = bodyRef.current;
    const containerWidth = container.clientWidth;
    const sidebarWidth = 320;
    const centerOffset = (containerWidth - sidebarWidth) / 2;
    const centerX = container.scrollLeft + centerOffset;
    const visualIndexFloat = centerX / zoomLevel;
    const visualIndex = Math.round(visualIndexFloat);
    const clampedIndex = Math.max(0, Math.min(visualIndex, visibleDays.length - 1));
    const dayIndex = visualIndexToDayIndex[clampedIndex];
    return { dayIndex, visualIndexFloat };
  };

  const handleToggleWeekends = () => {
    const anchor = captureTimelineCenter();
    if (anchor && anchor.dayIndex !== undefined && anchor.dayIndex !== null) {
      weekendFocusRef.current = anchor.dayIndex;
    }
    setShowWeekends((prev) => !prev);
  };

  const handleZoomChange = (e) => {
    const anchor = captureTimelineCenter();
    if (anchor && anchor.visualIndexFloat !== undefined && anchor.visualIndexFloat !== null) {
      zoomFocusRef.current = anchor.visualIndexFloat;
    }
    setZoomLevel(Number(e.target.value));
  };

  const hiddenWeekendRanges = useMemo(() => {
    if (showWeekends) return [];
    const ranges = [];
    for (let i = 1; i < visibleDays.length; i++) {
      const prevIndex = visibleDays[i - 1].index;
      const currIndex = visibleDays[i].index;
      if (currIndex > prevIndex + 1) {
        const start = prevIndex + 1;
        const end = currIndex - 1;
        ranges.push({
          start,
          end,
          gapAt: currIndex,
          isTodayGap: 0 >= start && 0 <= end,
        });
      }
    }
    return ranges;
  }, [visibleDays, showWeekends]);

  const hiddenWeekendHeaderMarkers = useMemo(() => {
    if (showWeekends) return {};
    const markers = {};
    hiddenWeekendRanges.forEach((range) => {
      if (range.isTodayGap) {
        markers[range.gapAt] = true;
      }
    });
    return markers;
  }, [showWeekends, hiddenWeekendRanges]);

  const hiddenWeekendItemMarkers = useMemo(() => {
    if (showWeekends) return {};
    const markers = {};
    const getItemColor = (item) => {
      if (!item) return "#c4c4c4";
      if (colorBy === "status") {
        return statuses.find((s) => s.id === item.status)?.color || "#c4c4c4";
      }
      return jobTypes.find((t) => t.id === item.jobTypeId)?.color || "#c4c4c4";
    };
    const findRange = (startIdx, endIdx) =>
      hiddenWeekendRanges.find((r) => startIdx >= r.start && endIdx <= r.end);
    const getWeekendSide = (startKey, duration) => {
      if (!startKey || !duration) return "center";
      let hasSaturday = false;
      let hasSunday = false;
      const span = Math.max(1, Number(duration || 1));
      for (let i = 0; i < span; i++) {
        const date = fromLocalDateKey(addDaysToKey(startKey, i));
        if (!date) continue;
        const day = date.getDay();
        if (day === 6) hasSaturday = true;
        if (day === 0) hasSunday = true;
      }
      if (hasSaturday && hasSunday) return "center";
      if (hasSunday) return "right";
      if (hasSaturday) return "left";
      return "center";
    };

    visibleProjects.forEach((project) => {
      (project.tasks || []).forEach((task) => {
        if (!task.start) return;
        const startIdx = relativeIndexFromDateKey(task.start);
        if (startIdx === null || startIdx === undefined) return;
        const duration = Math.max(1, Number(task.duration || 1));
        const endIdx = startIdx + duration - 1;
        const range = findRange(startIdx, endIdx);
        if (range) {
          markers[task.id] = {
            gapAt: range.gapAt,
            color: getItemColor(task),
            side: getWeekendSide(task.start, duration),
          };
        }
        (task.subitems || []).forEach((sub) => {
          if (!sub.start) return;
          const subStartIdx = relativeIndexFromDateKey(sub.start);
          if (subStartIdx === null || subStartIdx === undefined) return;
          const subDuration = Math.max(1, Number(sub.duration || 1));
          const subEndIdx = subStartIdx + subDuration - 1;
          const subRange = findRange(subStartIdx, subEndIdx);
          if (subRange) {
            markers[sub.id] = {
              gapAt: subRange.gapAt,
              color: getItemColor(sub),
              side: getWeekendSide(sub.start, subDuration),
            };
          }
        });
      });
    });

    return markers;
  }, [showWeekends, hiddenWeekendRanges, visibleProjects, colorBy, statuses, jobTypes]);

  const rememberOwnerMembershipForBoard = (projectId, projectName) => {
    if (!projectId || !authUser || authUser.isAnonymous) return;
    const ownerRecord = {
      id: authUser.uid,
      uid: authUser.uid,
      email: authUser.email ? authUser.email.toLowerCase() : "",
      role: "owner",
      status: "active",
    };

    // Optimistic owner membership to avoid transient "not a member" UI while Firestore listeners catch up.
    setMyMembershipByProjectId((prev) => ({
      ...prev,
      [projectId]: {
        ...(prev?.[projectId] || {}),
        ...ownerRecord,
      },
    }));
    setProjectMembersById((prev) => ({
      ...prev,
      [projectId]: [ownerRecord],
    }));
    setOwnedProjects((prev) => {
      if (prev.some((row) => row.projectId === projectId)) return prev;
      return [
        ...prev,
        {
          projectId,
          projectName,
          role: "owner",
          status: "active",
        },
      ];
    });
    setMemberProjects((prev) => {
      if (prev.some((row) => row.projectId === projectId)) return prev;
      return [
        ...prev,
        {
          projectId,
          projectName,
          role: "owner",
          status: "active",
        },
      ];
    });
  };

  const persistOwnerBoardAccess = async ({ projectId, projectName, workspaceId, workspaceName }) => {
    if (!projectId || !projectName || !workspaceId || !authUser || authUser.isAnonymous || !canUseFirestore() || !db) return;
    try {
      await setDoc(
        doc(db, "projects", projectId),
        {
          name: projectName,
          workspaceId,
          workspaceName: workspaceName || "",
          createdAt: serverTimestamp(),
          createdBy: authUser.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await setDoc(
        doc(db, "projects", projectId, "members", authUser.uid),
        {
          uid: authUser.uid,
          email: authUser.email ? authUser.email.toLowerCase() : "",
          role: "owner",
          status: "active",
          joinedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      if (shouldDisableFirestore(err)) {
        disableFirestore(err, `persist-owner:${projectId}`);
        return;
      }
      console.warn("Failed to persist owner board access:", err);
    }
  };

  // --- LOCAL ACTIONS ---
  const createWorkspace = () => {
    const defaultWorkspaceName = `Workspace ${workspaces.length + 1}`;
    const rawWorkspaceName =
      typeof window !== "undefined"
        ? window.prompt("Name your workspace", defaultWorkspaceName)
        : defaultWorkspaceName;
    if (rawWorkspaceName === null) return;
    const nextWorkspaceName = (rawWorkspaceName || "").trim() || defaultWorkspaceName;

    const newId = `w${Date.now()}`;
    setWorkspaces((prev) => [...prev, { id: newId, name: nextWorkspaceName, type: "workspace" }]);
    setActiveEntityId(newId);
    setActiveBoardId(null);
  };
  const createDashboard = () => { const newId = `d${Date.now()}`; setDashboards(prev => [...prev, { id: newId, name: 'New Dashboard', type: 'dashboard', includedWorkspaces: [] }]); setActiveEntityId(newId); };
  
  const findProjectIdByItemId = (itemId) => {
    for (const project of projects) {
      if ((project.tasks || []).some((task) => task.id === itemId)) return project.id;
      for (const task of project.tasks || []) {
        if ((task.subitems || []).some((sub) => sub.id === itemId)) return project.id;
      }
    }
    return null;
  };

  const toggleSelection = (id, projectId) => {
    if (!canEditProject(projectId)) return;
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedItems(newSet);
  };
  const deleteSelected = () => {
    if (selectedItems.size === 0) return;
    const editableIds = new Set(
      [...selectedItems].filter((itemId) => {
        const projectId = findProjectIdByItemId(itemId);
        return projectId && canEditProject(projectId);
      })
    );
    if (editableIds.size === 0) {
      setSelectedItems(new Set());
      return;
    }
    deleteSelection(editableIds);
    setSelectedItems(new Set());
  };
  useEffect(() => {
    if (selectedItems.size === 0) return;
    setSelectedItems((prev) => {
      const next = new Set(
        [...prev].filter((itemId) => {
          const projectId = findProjectIdByItemId(itemId);
          return projectId && canEditProject(projectId);
        })
      );
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [projects, myMembershipByProjectId, memberProjectsById, authUser?.uid]);
  const toggleGroupCollapse = (gid) => setCollapsedGroups(prev => prev.includes(gid) ? prev.filter(id => id !== gid) : [...prev, gid]);
  const toggleItemExpand = (tid) => setExpandedItems(prev => prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid]);
  const openUpdatesPanel = (projectId, taskId, subitemId) => {
    setUpdatesPanelTarget({ projectId, taskId, subitemId: subitemId || null });
  };

  const boardColumnMins = {
    select: 32,
    item: 160,
    person: 72,
    status: 80,
    type: 80,
    date: 100,
  };

  const columnsEqual = (a, b) => {
    const keys = Object.keys(DEFAULT_BOARD_COLUMNS);
    return keys.every((key) => Number(a?.[key]) === Number(b?.[key]));
  };

  const normalizeBoardColumns = (input) => {
    const merged = { ...DEFAULT_BOARD_COLUMNS, ...(input || {}) };
    const normalized = {};
    Object.keys(DEFAULT_BOARD_COLUMNS).forEach((key) => {
      const value = Number(merged[key]);
      const safe = Number.isFinite(value) ? value : DEFAULT_BOARD_COLUMNS[key];
      normalized[key] = Math.max(boardColumnMins[key] || 40, safe);
    });
    return normalized;
  };

  const startBoardResize = (colKey, startX) => {
    boardIsResizingRef.current = true;
    boardResizeRef.current = {
      colKey,
      startX,
      startWidth: boardColumns[colKey] || 0,
    };
    document.body.style.userSelect = "none";
    const handleMove = (e) => {
      if (!boardResizeRef.current) return;
      const delta = e.clientX - boardResizeRef.current.startX;
      const next = Math.max(
        boardColumnMins[colKey] || 80,
        boardResizeRef.current.startWidth + delta
      );
      setBoardColumns((prev) => ({ ...prev, [colKey]: next }));
    };
    const handleUp = () => {
      boardResizeRef.current = null;
      boardIsResizingRef.current = false;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      const current = boardColumnsRef.current;
      setBoardColumnsByEntity((prev) => {
        const existing = prev?.[activeEntityId];
        if (columnsEqual(existing, current)) return prev;
        return { ...prev, [activeEntityId]: current };
      });
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  useEffect(() => {
    boardColumnsRef.current = boardColumns;
  }, [boardColumns]);

  useEffect(() => {
    if (!activeEntityId) return;
    if (boardIsResizingRef.current) return;
    const next = normalizeBoardColumns(boardColumnsByEntity?.[activeEntityId]);
    if (!columnsEqual(boardColumnsRef.current, next)) {
      setBoardColumns(next);
    }
  }, [activeEntityId, boardColumnsByEntity]);

  useEffect(() => {
    if (!activeEntityId) return;
    if (boardIsResizingRef.current) return;
    const existing = boardColumnsByEntity?.[activeEntityId];
    if (!existing) {
      setBoardColumnsByEntity((prev) => ({ ...prev, [activeEntityId]: boardColumns }));
    }
  }, [activeEntityId]);

  const addStatusLabel = (label, color) => {
    const id = `status_${Date.now()}`;
    setStatuses((prev) => [...prev, { id, label, color }]);
  };

  const addTypeLabel = (label, color) => {
    const id = `type_${Date.now()}`;
    setJobTypes((prev) => [...prev, { id, label, color }]);
  };

  const updatesTarget = useMemo(() => {
    if (!updatesPanelTarget) return null;
    const project = projects.find((p) => p.id === updatesPanelTarget.projectId);
    if (!project) return null;
    if (updatesPanelTarget.subitemId) {
      const parent = project.tasks.find((t) => t.id === updatesPanelTarget.taskId);
      const sub = parent?.subitems?.find((s) => s.id === updatesPanelTarget.subitemId);
      if (!sub) return null;
      const fileList = (projectFilesById?.[project.id] || []).filter(
        (file) =>
          file.taskId === parent.id &&
          (file.subitemId || null) === sub.id
      );
      return {
        projectId: project.id,
        taskId: parent.id,
        subitemId: sub.id,
        name: sub.name,
        parentName: parent?.name || "",
        updates: sub.updates || [],
        files: fileList,
        type: "subitem",
      };
    }
    const task = project.tasks.find((t) => t.id === updatesPanelTarget.taskId);
    if (!task) return null;
    const taskFiles = (projectFilesById?.[project.id] || []).filter(
      (file) => file.taskId === task.id && !file.subitemId
    );
    return {
      projectId: project.id,
      taskId: task.id,
      subitemId: null,
      name: task.name,
      updates: task.updates || [],
      files: taskFiles,
      type: "task",
    };
  }, [updatesPanelTarget, projects, projectFilesById]);

  const updatesMember = updatesTarget ? getCurrentMember(updatesTarget.projectId) : null;
  const updatesPermissions = getMemberPermissions(updatesMember);
  const shareBaseUrl = typeof window !== "undefined" ? `${window.location.origin}/share` : "";

  const activeMember = activeProject ? getCurrentMember(activeProject.id) : null;
  const activePermissions = getMemberPermissions(activeMember);
  const activeMembers = activeProject
    ? getProjectMembers(activeProject.id).length > 0
      ? getProjectMembers(activeProject.id)
      : activeMember
      ? [activeMember]
      : []
    : [];
  const membersCanManage = activePermissions?.canManageMembers;
  const canEditActiveProject = activeProject ? canEditProject(activeProject.id) : false;
  const canEditActiveEntityName =
    activeEntity?.type === "workspace"
      ? canRenameWorkspace(activeEntity.id)
      : true;
  const canCreateProjectInActiveWorkspace =
    activeEntity?.type === "workspace"
      ? canCreateProjectInWorkspace(activeEntity.id)
      : false;
  const workspaceAccessRows =
    activeEntity?.type === "workspace"
      ? boardsInActiveWorkspace.map((board) => {
          const membership = myMembershipByProjectId?.[board.id] || memberProjectsById?.[board.id] || null;
          const permissions = getProjectPermissions(board.id);
          return {
            projectId: board.id,
            projectName: board.name || board.id,
            role: membership?.role || permissions.role || "viewer",
            baseRole: membership?.baseRole || null,
            canView: permissions.canView,
          };
        })
      : [];

  const handleUpdateEntityName = (value) => {
    if (!activeEntity) return;
    if (activeEntity.type === "workspace") {
      if (!canRenameWorkspace(activeEntity.id)) return;
      setWorkspaces((prev) =>
        prev.map((workspace) =>
          workspace.id === activeEntity.id ? { ...workspace, name: value } : workspace
        )
      );
      setProjects((prev) =>
        prev.map((project) =>
          project.workspaceId === activeEntity.id
            ? { ...project, workspaceName: value }
            : project
        )
      );
      return;
    }
    if (activeEntity.type === "dashboard") {
      setDashboards((prev) =>
        prev.map((dashboard) =>
          dashboard.id === activeEntity.id ? { ...dashboard, name: value } : dashboard
        )
      );
    }
  };
  const handleCreateProjectInActiveWorkspace = ({ askName = false } = {}) => {
    if (!activeEntity || activeEntity.type !== "workspace") return;
    if (!canCreateProjectInWorkspace(activeEntity.id)) return;
    const nextIndex = projects.filter((project) => project.workspaceId === activeEntity.id).length + 1;
    const defaultBoardName = `Board ${nextIndex}`;
    let nextProjectName = defaultBoardName;
    if (askName && typeof window !== "undefined") {
      const rawName = window.prompt("Name this board", defaultBoardName);
      if (rawName === null) return;
      nextProjectName = rawName.trim() || defaultBoardName;
    }
    const projectId = addProjectToWorkspace(activeEntity.id, activeEntity.name, nextProjectName);
    rememberOwnerMembershipForBoard(projectId, nextProjectName);
    void persistOwnerBoardAccess({
      projectId,
      projectName: nextProjectName,
      workspaceId: activeEntity.id,
      workspaceName: activeEntity.name,
    });
    if (projectId) setActiveBoardId(projectId);
  };

  const guardedUpdateGroupName = (projectId, groupId, value) => {
    if (!canEditProject(projectId)) return;
    updateGroupName(projectId, groupId, value);
  };
  const guardedUpdateTaskName = (projectId, taskId, value) => {
    if (!canEditProject(projectId)) return;
    updateTaskName(projectId, taskId, value);
  };
  const guardedUpdateSubitemName = (projectId, taskId, subitemId, value) => {
    if (!canEditProject(projectId)) return;
    updateSubitemName(projectId, taskId, subitemId, value);
  };
  const guardedAddTaskToGroup = (projectId, groupId, name) => {
    if (!canEditProject(projectId)) return;
    addTaskToGroup(projectId, groupId, name);
  };
  const guardedAddGroup = (projectId) => {
    if (!canEditProject(projectId)) return;
    addGroup(projectId);
  };
  const guardedAddSubitem = (projectId, taskId, name) => {
    if (!canEditProject(projectId)) return;
    addSubitem(projectId, taskId, name);
  };
  const guardedUpdateTaskDate = (projectId, taskId, subitemId, start, duration) => {
    if (!canEditProject(projectId)) return;
    updateTaskDate(projectId, taskId, subitemId, start, duration);
  };
  const guardedChangeStatus = (projectId, taskId, subitemId, statusId) => {
    if (!canEditProject(projectId)) return;
    changeStatus(projectId, taskId, subitemId, statusId);
  };
  const guardedChangeJobType = (projectId, taskId, subitemId, typeId) => {
    if (!canEditProject(projectId)) return;
    changeJobType(projectId, taskId, subitemId, typeId);
  };
  const openStatusEditor = (projectId = activeProject?.id) => {
    if (!projectId || !canEditProject(projectId)) return;
    setStatusEditorOpen(true);
  };
  const openTypeEditor = (projectId = activeProject?.id) => {
    if (!projectId || !canEditProject(projectId)) return;
    setJobTypeEditorOpen(true);
  };
  const guardedAddStatusLabel = (projectId, label, color) => {
    if (!canEditProject(projectId)) return;
    addStatusLabel(label, color);
  };
  const guardedAddTypeLabel = (projectId, label, color) => {
    if (!canEditProject(projectId)) return;
    addTypeLabel(label, color);
  };

  const showDebugBadge =
    (typeof window !== "undefined" && window.localStorage.getItem("pmai_debug_auth") === "1") ||
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV);
  const [debugExpanded, setDebugExpanded] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("pmai_debug_auth_open");
    if (stored === "0") setDebugExpanded(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("pmai_debug_auth_open", debugExpanded ? "1" : "0");
  }, [debugExpanded]);
  const activeInvites = activeProject ? (projectInvitesById?.[activeProject.id] || []) : [];

  const handleAddUpdate = (payload) => {
    if (!updatesTarget) return;
    if (!canEditProject(updatesTarget.projectId)) return;
    const text = payload?.text || "";
    const checklist = payload?.checklist || [];
    const trimmed = text.trim();
    if (!trimmed && checklist.length === 0) return;
    const author = authUser?.email || (authUser?.isAnonymous ? "Guest" : "User");
    const update = {
      id: `u${Date.now()}`,
      text: trimmed,
      checklist: checklist.length > 0 ? checklist : undefined,
      replies: [],
      author,
      createdAt: new Date().toISOString(),
    };
    addUpdate(updatesTarget.projectId, updatesTarget.taskId, updatesTarget.subitemId, update);
  };

  const handleAddReply = (updateId, text) => {
    if (!updatesTarget) return;
    if (!canEditProject(updatesTarget.projectId)) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const author = authUser?.email || (authUser?.isAnonymous ? "Guest" : "User");
    const reply = {
      id: `r${Date.now()}`,
      text: trimmed,
      author,
      createdAt: new Date().toISOString(),
    };
    addReply(updatesTarget.projectId, updatesTarget.taskId, updatesTarget.subitemId, updateId, reply);
  };

  const handleToggleChecklistItem = (updateId, itemId) => {
    if (!updatesTarget) return;
    if (!canEditProject(updatesTarget.projectId)) return;
    toggleChecklistItem(updatesTarget.projectId, updatesTarget.taskId, updatesTarget.subitemId, updateId, itemId);
  };

  const createShareToken = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  };

  const handleUpdateFileAccess = async (fileId, accessPatch) => {
    if (!updatesTarget || !db) return;
    if (!canEditProject(updatesTarget.projectId)) return;
    if (!updatesPermissions?.canManageFileAccess) return;
    try {
      const fileRef = doc(db, "projects", updatesTarget.projectId, "files", fileId);
      const update = {};
      if (accessPatch?.minRole) update["access.minRole"] = accessPatch.minRole;
      await updateDoc(fileRef, update);
    } catch (err) {
      console.warn("Failed to update file access:", err);
    }
  };

  const handleToggleShareLink = async (file) => {
    if (!updatesTarget || !db || !file?.id) return;
    if (!canEditProject(updatesTarget.projectId)) return;
    if (!updatesPermissions?.canManageFileAccess) return;
    try {
      const fileRef = doc(db, "projects", updatesTarget.projectId, "files", file.id);
      const allow = !file.access?.allowShareLink;
      const nextToken = allow ? createShareToken() : null;
      await updateDoc(fileRef, {
        "access.allowShareLink": allow,
        "access.shareToken": nextToken,
        "access.revokedAt": allow ? null : serverTimestamp(),
        "access.sharedAt": allow ? serverTimestamp() : null,
      });
    } catch (err) {
      console.warn("Failed to toggle share link:", err);
    }
  };

  const sendProjectInvite = async ({ projectId, email, role, baseRole, accessUntil }) => {
    if (!db || !authUser || !projectId || !email) return null;
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const inviteRef = doc(collection(db, "projects", projectId, "invites"));
      const token = createShareToken();
      await setDoc(
        inviteRef,
        {
          id: inviteRef.id,
          projectId,
          email: normalizedEmail,
          role,
          baseRole: role === "contractor" ? baseRole || "viewer" : null,
          accessUntil: accessUntil ? Timestamp.fromDate(accessUntil) : null,
          status: "pending",
          token,
          createdAt: serverTimestamp(),
          invitedBy: authUser.uid,
          invitedByEmail: authUser.email || "",
        },
        { merge: true }
      );

      let inviteLink = "";
      let emailQueued = false;
      if (typeof window !== "undefined") {
        const inviteUrl = new URL(window.location.origin + window.location.pathname);
        inviteUrl.searchParams.set("invite", token);
        inviteUrl.searchParams.set("pid", projectId);
        inviteUrl.searchParams.set("iid", inviteRef.id);
        inviteLink = inviteUrl.toString();
        try {
          await addDoc(collection(db, "mail"), {
            to: normalizedEmail,
            message: {
              subject: "You're invited to a board",
              text: `You've been invited to a board. Open this link to accept the invite: ${inviteLink}`,
              html: `<p>You’ve been invited to a board.</p><p><a href="${inviteLink}">Accept invite</a></p>`,
            },
          });
          emailQueued = true;
        } catch (mailErr) {
          warnFirestoreOnce(
            `invite-mail-fallback:${projectId}`,
            "Invite saved, but email delivery was not queued. Share the invite link manually.",
            mailErr
          );
        }
      }
      return { inviteLink, emailQueued };
    } catch (err) {
      console.warn("Failed to send invite:", err);
    }
    return null;
  };

  const updateProjectMember = async (projectId, uid, patch) => {
    if (!db || !projectId || !uid) return;
    try {
      const memberRef = doc(db, "projects", projectId, "members", uid);
      const update = {};
      if (patch.role) update.role = patch.role;
      if (patch.baseRole !== undefined) update.baseRole = patch.baseRole;
      if (patch.accessUntil !== undefined) {
        update.accessUntil = patch.accessUntil ? Timestamp.fromDate(patch.accessUntil) : null;
      }
      await updateDoc(memberRef, update);
    } catch (err) {
      console.warn("Failed to update member:", err);
    }
  };

  const removeProjectMember = async (projectId, uid) => {
    if (!db || !projectId || !uid) return;
    try {
      await deleteDoc(doc(db, "projects", projectId, "members", uid));
    } catch (err) {
      console.warn("Failed to remove member:", err);
    }
  };

  const revokeInvite = async (projectId, inviteId) => {
    if (!db || !projectId || !inviteId) return;
    try {
      await updateDoc(doc(db, "projects", projectId, "invites", inviteId), {
        status: "revoked",
        revokedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("Failed to revoke invite:", err);
    }
  };

  const requestProjectAccess = async (projectId) => {
    if (!db || !authUser || !projectId) return;
    try {
      await setDoc(
        doc(db, "projects", projectId, "accessRequests", authUser.uid),
        {
          uid: authUser.uid,
          email: authUser.email || "",
          requestedAt: serverTimestamp(),
          status: "pending",
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("Failed to request access:", err);
    }
  };

  const handleAddFiles = async (fileList) => {
    if (!updatesTarget) return;
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const member = getCurrentMember(updatesTarget.projectId);
    const permissions = getMemberPermissions(member);
    if (!permissions.canUpload) return;
    const author = authUser?.email || (authUser?.isAnonymous ? "Guest" : "User");
    const userId = authUser?.uid || auth?.currentUser?.uid;
    const canUpload = Boolean(storage && userId);

    if (!canUpload || !db) {
      const readFile = (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
      const entries = await Promise.all(
        files.map(async (file) => ({
          id: `f${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: await readFile(file),
        createdAt: new Date().toISOString(),
        author,
      }))
    );
    entries.forEach((entry) =>
      addFile(updatesTarget.projectId, updatesTarget.taskId, updatesTarget.subitemId, entry)
    );
    return;
  }

    const baseId = Date.now();
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      try {
        const fileId = `f${baseId}_${i}`;
        const storagePath = `projects/${updatesTarget.projectId}/items/${updatesTarget.taskId}/${updatesTarget.subitemId || "task"}/${fileId}`;
        const ref = storageRef(storage, storagePath);
        await uploadBytes(ref, file, { contentType: file.type || "application/octet-stream" });
        const url = await getDownloadURL(ref);
        await setDoc(
          doc(db, "projects", updatesTarget.projectId, "files", fileId),
        {
          id: fileId,
          projectId: updatesTarget.projectId,
          taskId: updatesTarget.taskId,
          subitemId: updatesTarget.subitemId || null,
          name: file.name,
          size: file.size,
          type: file.type,
          url,
          storagePath,
          createdAt: serverTimestamp(),
          createdBy: userId,
          author,
          access: {
            minRole: "viewer",
            allowShareLink: false,
            shareToken: null,
          },
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("File upload failed:", err);
    }
  }
};

  const scrollToToday = (smooth = true) => { 
    if (bodyRef.current && dayToVisualIndex[0] !== undefined) { 
        const container = bodyRef.current;
        const containerWidth = container.clientWidth;
        const sidebarWidth = 320;
        
        let targetVisualIdx = dayToVisualIndex[0];
        const todayDay = rawDays.find(d => d.index === 0);
        if (!showWeekends && todayDay && todayDay.isWeekend) {
             targetVisualIdx = Math.max(0, targetVisualIdx - 1);
        }

        const todayX = targetVisualIdx * zoomLevel;
        const centerOffset = (containerWidth - sidebarWidth) / 2;
        const scrollLeft = todayX - centerOffset + (zoomLevel / 2);
        
        container.scrollTo({ left: Math.max(0, scrollLeft), behavior: smooth ? 'smooth' : 'auto' }); 
    } 
  };

  useLayoutEffect(() => {
    if (activeTab === 'gantt' && prevTabRef.current !== 'gantt') {
      scrollToToday(false);
    }
    prevTabRef.current = activeTab;
  }, [activeTab]); 

  useLayoutEffect(() => {
    if (activeTab !== 'gantt') return;
    const anchorDayIndex = weekendFocusRef.current;
    if (anchorDayIndex === null || anchorDayIndex === undefined) return;
    const container = bodyRef.current;
    if (!container) return;
    const targetVisualIdx = dayToVisualIndex[anchorDayIndex];
    if (targetVisualIdx === undefined || targetVisualIdx === null) {
      weekendFocusRef.current = null;
      return;
    }
    const containerWidth = container.clientWidth;
    const sidebarWidth = 320;
    const centerOffset = (containerWidth - sidebarWidth) / 2;
    const targetX = targetVisualIdx * zoomLevel;
    const scrollLeft = targetX - centerOffset + (zoomLevel / 2);
    container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'auto' });
    weekendFocusRef.current = null;
  }, [showWeekends, zoomLevel, dayToVisualIndex, activeTab]);

  useLayoutEffect(() => {
    if (activeTab !== 'gantt') return;
    const anchorVisual = zoomFocusRef.current;
    if (anchorVisual === null || anchorVisual === undefined) return;
    const container = bodyRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    const sidebarWidth = 320;
    const centerOffset = (containerWidth - sidebarWidth) / 2;
    const targetX = anchorVisual * zoomLevel;
    const scrollLeft = targetX - centerOffset;
    container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'auto' });
    zoomFocusRef.current = null;
  }, [zoomLevel, activeTab]);

  useEffect(() => {
      if (!auth) return;
      const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u));
      return () => unsub();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite");
    if (!inviteToken) return;
    if (!authUser || authUser.isAnonymous || !authUser.email) {
      setAuthModalOpen(true);
    }
  }, [authUser?.uid, authUser?.isAnonymous, authUser?.email]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !authUser || authUser.isAnonymous) return;
    const ensureProjectSetup = async (project) => {
      if (!project || !project.id) return;
      if (ensuredProjectsRef.current.has(project.id)) return;
      const membership = myMembershipByProjectId?.[project.id] || memberProjectsById?.[project.id] || null;
      const permissions = getMemberPermissions(membership);
      // Shared projects can be visible locally, but non-admin members should not try to "ensure" metadata.
      if (membership && !permissions.canManageMembers) return;
      try {
        await setDoc(
          doc(db, "projects", project.id),
          {
            name: project.name,
            workspaceId: project.workspaceId || "",
            workspaceName: project.workspaceName || "",
            createdAt: serverTimestamp(),
            createdBy: authUser.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await setDoc(
          doc(db, "projects", project.id, "members", authUser.uid),
          {
            uid: authUser.uid,
            email: authUser.email ? authUser.email.toLowerCase() : "",
            role: "owner",
            status: "active",
            joinedAt: serverTimestamp(),
          },
          { merge: true }
        );
        ensuredProjectsRef.current.add(project.id);
      } catch (err) {
        if (shouldDisableFirestore(err)) {
          disableFirestore(err, `ensure-project:${project.id}`);
          return;
        }
        console.warn("Failed to ensure project setup:", err);
      }
    };
    visibleProjectsRef.current.forEach((project) => {
      ensureProjectSetup(project);
    });
  }, [authUser?.uid, authUser?.email, authUser?.isAnonymous, visibleProjectSetupKey, myMembershipByProjectId, memberProjectsById]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !authUser || authUser.isAnonymous) {
      setProjectMembersById({});
      return;
    }
    const projectIds = visibleProjectIdsKey ? visibleProjectIdsKey.split("|").filter(Boolean) : [];
    const unsubs = projectIds.map((projectId) => {
      const myMember = myMembershipByProjectId?.[projectId] || null;
      const permissions = getMemberPermissions(myMember);
      if (!permissions.canManageMembers) return () => {};
      let unsub = () => {};
      unsub = onSnapshot(
        collection(db, "projects", projectId, "members"),
        (snap) => {
          const members = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          setProjectMembersById((prev) => ({ ...prev, [projectId]: members }));
        },
        (error) => {
          if (handleFirestoreListenerError(error, `members-list:${projectId}`)) {
            unsub();
          }
        }
      );
      return unsub;
    });
    return () => unsubs.forEach((unsub) => unsub && unsub());
  }, [authUser?.uid, authUser?.isAnonymous, visibleProjectIdsKey, myMembershipByProjectId]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !authUser || authUser.isAnonymous) {
      setMyMembershipByProjectId({});
      return;
    }
    const projectIds = visibleProjectIdsKey ? visibleProjectIdsKey.split("|").filter(Boolean) : [];
    const unsubs = projectIds.map((projectId) => {
      let unsub = () => {};
      unsub = onSnapshot(
        doc(db, "projects", projectId, "members", authUser.uid),
        (snap) => {
          if (snap.exists()) {
            setMyMembershipByProjectId((prev) => ({ ...prev, [projectId]: { id: snap.id, ...snap.data() } }));
          } else {
            setMyMembershipByProjectId((prev) => ({ ...prev, [projectId]: null }));
          }
        },
        (error) => {
          if (handleFirestoreListenerError(error, `members-self:${projectId}`)) {
            unsub();
          }
        }
      );
      return unsub;
    });
    return () => unsubs.forEach((unsub) => unsub && unsub());
  }, [authUser?.uid, authUser?.isAnonymous, visibleProjectIdsKey]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !authUser || authUser.isAnonymous) {
      setProjectFilesById({});
      return;
    }
    const projectIds = visibleProjectIdsKey ? visibleProjectIdsKey.split("|").filter(Boolean) : [];
    const unsubs = projectIds.map((projectId) => {
      const myMember = myMembershipByProjectId?.[projectId] || null;
      const permissions = getMemberPermissions(myMember);
      if (!permissions.canDownload) return () => {};
      let unsub = () => {};
      unsub = onSnapshot(
        collection(db, "projects", projectId, "files"),
        (snap) => {
          const files = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          setProjectFilesById((prev) => ({ ...prev, [projectId]: files }));
        },
        (error) => {
          if (handleFirestoreListenerError(error, `files:${projectId}`)) {
            unsub();
          }
        }
      );
      return unsub;
    });
    return () => unsubs.forEach((unsub) => unsub && unsub());
  }, [authUser?.uid, authUser?.isAnonymous, visibleProjectIdsKey, myMembershipByProjectId]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !authUser || authUser.isAnonymous) {
      setOwnedProjects([]);
      return;
    }
    let unsub = () => {};
    const ownedQuery = query(collection(db, "projects"), where("createdBy", "==", authUser.uid));
    unsub = onSnapshot(
      ownedQuery,
      (snap) => {
        const rows = snap.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            projectId: docSnap.id,
            projectName: data.name || docSnap.id,
            role: "owner",
            status: "active",
          };
        });
        setOwnedProjects(rows);
      },
      (error) => {
        if (handleFirestoreListenerError(error, "owned-projects")) {
          unsub();
        }
      }
    );
    return () => unsub();
  }, [authUser?.uid, authUser?.isAnonymous]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !authUser || !authUser.email || authUser.isAnonymous) {
      setMemberProjects([]);
      return;
    }
    const q = query(collectionGroup(db, "members"), where("uid", "==", authUser.uid));
    let unsub = () => {};
    unsub = onSnapshot(
      q,
      async (snap) => {
        const rows = await Promise.all(
          snap.docs.map(async (docSnap) => {
            const projectId = docSnap.ref.parent.parent?.id;
            const data = docSnap.data();
            let projectName = projectId;
            if (projectId) {
              try {
                const projectSnap = await getDoc(doc(db, "projects", projectId));
                if (projectSnap.exists()) {
                  projectName = projectSnap.data().name || projectId;
                }
              } catch {}
            }
            return { projectId, projectName, ...data };
          })
        );
        setMemberProjects(rows.filter((row) => row.projectId));
      },
      (error) => {
        if (handleFirestoreListenerError(error, "members-collection-group")) {
          unsub();
        }
      }
    );
    return () => unsub();
  }, [authUser?.uid, authUser?.email, authUser?.isAnonymous]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !authUser || !authUser.email) return;
    let cancelled = false;
    const params = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
    const inviteToken = params?.get("invite") || null;
    const inviteProjectId = params?.get("pid") || null;
    const inviteDocId = params?.get("iid") || null;
    if (!inviteToken) return;
    const userEmail = authUser.email.toLowerCase();

    const rememberMembership = async (projectId, membershipData = null) => {
      if (!projectId) return;
      const normalizedMembership = membershipData || {};
      setMyMembershipByProjectId((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev?.[projectId] || {}),
          id: authUser.uid,
          uid: authUser.uid,
          email: authUser.email ? authUser.email.toLowerCase() : "",
          role: normalizedMembership.role || "viewer",
          baseRole: normalizedMembership.baseRole || null,
          accessUntil: normalizedMembership.accessUntil || null,
          status: normalizedMembership.status || "active",
        },
      }));

      let projectName = projectId;
      try {
        const projectSnap = await getDoc(doc(db, "projects", projectId));
        if (projectSnap.exists()) {
          projectName = projectSnap.data().name || projectId;
        }
      } catch {}

      setMemberProjects((prev) => {
        const nextRow = {
          projectId,
          projectName,
          role: normalizedMembership.role || "viewer",
          baseRole: normalizedMembership.baseRole || null,
          status: normalizedMembership.status || "active",
        };
        const index = prev.findIndex((row) => row.projectId === projectId);
        if (index === -1) return [...prev, nextRow];
        const next = [...prev];
        next[index] = { ...next[index], ...nextRow };
        return next;
      });
    };

    const acceptInviteDoc = async (docSnap) => {
      const invite = docSnap.data();
      const projectId = invite.projectId || docSnap.ref.parent.parent?.id;
      if (!projectId) return null;
      try {
        await setDoc(
          doc(db, "projects", projectId, "members", authUser.uid),
          {
            uid: authUser.uid,
            email: authUser.email ? authUser.email.toLowerCase() : "",
            role: invite.role || "viewer",
            baseRole: invite.baseRole || null,
            inviteId: docSnap.id,
            accessUntil: invite.accessUntil || null,
            status: "active",
            joinedAt: serverTimestamp(),
            invitedBy: invite.invitedBy || null,
            invitedAt: invite.createdAt || null,
          },
          { merge: true }
        );
        await updateDoc(docSnap.ref, {
          status: "accepted",
          acceptedAt: serverTimestamp(),
          acceptedBy: authUser.uid,
        });
        await rememberMembership(projectId, {
          role: invite.role || "viewer",
          baseRole: invite.baseRole || null,
          accessUntil: invite.accessUntil || null,
          status: "active",
        });
        return projectId;
      } catch (err) {
        if (shouldDisableFirestore(err)) {
          disableFirestore(err, `accept-invite:${projectId}`);
          return null;
        }
        console.warn("Failed to accept invite:", err);
        return null;
      }
    };

    const syncInvites = async () => {
      try {
        let accepted = false;
        if (inviteProjectId && inviteDocId) {
          const directInviteRef = doc(db, "projects", inviteProjectId, "invites", inviteDocId);
          try {
            const directInviteSnap = await getDoc(directInviteRef);
            if (!cancelled && directInviteSnap.exists()) {
              const directInvite = directInviteSnap.data();
              const directEmail = String(directInvite?.email || "").toLowerCase();
              const directToken = String(directInvite?.token || "");
              const directStatus = String(directInvite?.status || "");
              if (directStatus !== "pending") {
                const memberSnap = await getDoc(doc(db, "projects", inviteProjectId, "members", authUser.uid));
                if (memberSnap.exists()) {
                  accepted = true;
                  await rememberMembership(inviteProjectId, memberSnap.data());
                } else {
                  warnFirestoreOnce(
                    `invite-status:${inviteProjectId}:${inviteDocId}`,
                    "Invite link is no longer pending."
                  );
                }
              } else if (directEmail !== userEmail) {
                warnFirestoreOnce(
                  `invite-email-mismatch:${inviteProjectId}:${inviteDocId}`,
                  "Invite email does not match the signed-in account."
                );
                setAuthModalOpen(true);
              } else if (directToken !== inviteToken) {
                warnFirestoreOnce(
                  `invite-token-mismatch:${inviteProjectId}:${inviteDocId}`,
                  "Invite token mismatch for this invite link."
                );
              } else {
                const projectId = await acceptInviteDoc(directInviteSnap);
                accepted = Boolean(projectId);
              }
            }
          } catch (err) {
            if (isPermissionDeniedError(err)) {
              // If invite doc is no longer readable (for example already accepted), check membership directly.
              const memberSnap = await getDoc(doc(db, "projects", inviteProjectId, "members", authUser.uid));
              if (memberSnap.exists()) {
                accepted = true;
                await rememberMembership(inviteProjectId, memberSnap.data());
              }
            } else {
              throw err;
            }
          }
        }

        if (!cancelled && !accepted) {
          const constraints = [
            where("token", "==", inviteToken),
            where("email", "==", userEmail),
            where("status", "==", "pending"),
          ];
          const invitesQuery = query(collectionGroup(db, "invites"), ...constraints);
          const snap = await getDocs(invitesQuery);
          if (!cancelled && !snap.empty) {
            for (const docSnap of snap.docs) {
              if (cancelled) return;
              const projectId = await acceptInviteDoc(docSnap);
              if (projectId) accepted = true;
            }
          }
        }

        if (accepted && typeof window !== "undefined") {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete("invite");
          nextUrl.searchParams.delete("pid");
          nextUrl.searchParams.delete("iid");
          const nextSearch = nextUrl.searchParams.toString();
          const nextPath = `${nextUrl.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextUrl.hash || ""}`;
          window.history.replaceState({}, "", nextPath);
        }
      } catch (err) {
        if (isPermissionDeniedError(err)) {
          warnFirestoreOnce(
            "pending-invites-permission-denied",
            "Skipping invite auto-accept check (permission denied)."
          );
          return;
        }
        if (shouldDisableFirestore(err)) {
          disableFirestore(err, "pending-invites-sync");
          return;
        }
        console.warn("Invite sync failed:", err);
      }
    };

    void syncInvites();
    return () => {
      cancelled = true;
    };
  }, [authUser?.uid, authUser?.email]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !membersModalOpen || !activeProject) {
      return;
    }
    const member = myMembershipByProjectId?.[activeProject.id] || null;
    const permissions = getMemberPermissions(member);
    if (!permissions.canManageMembers) {
      return;
    }
    let unsub = () => {};
    unsub = onSnapshot(
      collection(db, "projects", activeProject.id, "invites"),
      (snap) => {
        const invites = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setProjectInvitesById((prev) => ({ ...prev, [activeProject.id]: invites }));
      },
      (error) => {
        if (handleFirestoreListenerError(error, `invites:${activeProject.id}`)) {
          unsub();
        }
      }
    );
    return () => unsub();
  }, [membersModalOpen, activeProject?.id, myMembershipByProjectId]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !authUser || authUser.isAnonymous) return;
    const visibleProjectIds = visibleProjectIdsKey ? visibleProjectIdsKey.split("|").filter(Boolean) : [];
    const membershipProjectIds = memberProjectIdsKey ? memberProjectIdsKey.split("|").filter(Boolean) : [];
    const candidateProjectIds = Array.from(new Set([...visibleProjectIds, ...membershipProjectIds]));
    const readableProjectIds = candidateProjectIds.filter((projectId) => {
      const member = myMembershipByProjectId?.[projectId] || memberProjectsById?.[projectId] || null;
      const permissions = getMemberPermissions(member);
      return permissions.canView;
    });

    const unsubs = readableProjectIds.map((projectId) => {
      let unsub = () => {};
      unsub = onSnapshot(
        doc(db, "projects", projectId, "state", PROJECT_STATE_DOC_ID),
        (snapshot) => {
          if (!snapshot.exists()) return;
          const payload = snapshot.data()?.value;
          if (typeof payload !== "string") return;
          if (payload === projectStatePayloadRef.current.get(projectId)) return;

          let incomingProject = null;
          try {
            incomingProject = JSON.parse(payload);
          } catch (err) {
            console.warn("Invalid shared project payload:", err);
            return;
          }
          if (!incomingProject || typeof incomingProject !== "object") return;

          const normalizedProject = incomingProject.id
            ? incomingProject
            : { ...incomingProject, id: projectId };
          projectStatePayloadRef.current.set(projectId, payload);
          setProjects((prev) => {
            const index = prev.findIndex((project) => project.id === projectId);
            if (index === -1) {
              return [...prev, normalizedProject];
            }
            try {
              const currentPayload = JSON.stringify(prev[index]);
              if (currentPayload === payload) return prev;
            } catch {}
            const next = [...prev];
            next[index] = normalizedProject;
            return next;
          });
        },
        (error) => {
          if (handleFirestoreListenerError(error, `project-state-read:${projectId}`)) {
            unsub();
          }
        }
      );
      return unsub;
    });

    return () => unsubs.forEach((unsub) => unsub && unsub());
  }, [authUser?.uid, authUser?.isAnonymous, visibleProjectIdsKey, memberProjectIdsKey, myMembershipByProjectId, memberProjectsById, ownedProjects, setProjects]);

  useEffect(() => {
    if (!canUseFirestore() || !db || !authUser || authUser.isAnonymous) return;
    const projectIds = visibleProjectIdsKey ? visibleProjectIdsKey.split("|").filter(Boolean) : [];
    const visibleProjectIdSet = new Set(projectIds);

    projectStateWriteTimersRef.current.forEach((timerId, projectId) => {
      if (!visibleProjectIdSet.has(projectId)) {
        clearTimeout(timerId);
        projectStateWriteTimersRef.current.delete(projectId);
      }
    });

    projectIds.forEach((projectId) => {
      if (!canWriteProjectState(projectId)) return;
      const project = projects.find((item) => item.id === projectId);
      if (!project) return;

      let payload = null;
      try {
        payload = JSON.stringify(project);
      } catch (err) {
        console.warn("Failed to serialize project state:", err);
        return;
      }
      if (!payload) return;
      if (payload === projectStatePayloadRef.current.get(projectId)) return;

      const existingTimer = projectStateWriteTimersRef.current.get(projectId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timerId = setTimeout(async () => {
        projectStateWriteTimersRef.current.delete(projectId);
        if (!canUseFirestore() || !db || !authUser || authUser.isAnonymous) return;
        try {
          await setDoc(
            doc(db, "projects", projectId, "state", PROJECT_STATE_DOC_ID),
            {
              value: payload,
              updatedAt: serverTimestamp(),
              updatedBy: authUser.uid,
            },
            { merge: true }
          );
          projectStatePayloadRef.current.set(projectId, payload);
        } catch (err) {
          if (shouldDisableFirestore(err)) {
            disableFirestore(err, `project-state-write:${projectId}`);
            return;
          }
          console.warn("Failed to sync shared project state:", err);
        }
      }, PROJECT_SYNC_DEBOUNCE_MS);

      projectStateWriteTimersRef.current.set(projectId, timerId);
    });
  }, [projects, authUser?.uid, authUser?.isAnonymous, visibleProjectIdsKey, myMembershipByProjectId]);

  // --- DRAG HANDLERS (ROWS) ---
  const handleRowDragStart = (e, type, id, projectId) => { 
    if (!canEditProject(projectId)) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    const wasExpanded = expandedItems.includes(id);
    if (type === 'task' && wasExpanded) setExpandedItems(prev => prev.filter(tid => tid !== id));
    const next = {
      active: true,
      type,
      dragId: id,
      parentId: null,
      dropTargetId: null,
      dropTargetType: null,
      dropTargetProjectId: null,
      sourceProjectId: projectId || null,
      dropPosition: 'before',
      originalExpanded: wasExpanded
    };
    reorderDragRef.current = next;
    setReorderDrag(next);
  };
  const handleRowDragOver = (e, type, id) => { 
    e.preventDefault();
    e.stopPropagation(); 
    if (!reorderDragRef.current.active || reorderDragRef.current.type !== type) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY >= midY ? 'after' : 'before';
    if (reorderDragRef.current.dropTargetId !== id || reorderDragRef.current.dropPosition !== position || reorderDragRef.current.dropTargetType !== 'row') {
      const next = { ...reorderDragRef.current, dropTargetId: id, dropTargetType: 'row', dropTargetProjectId: null, dropPosition: position };
      reorderDragRef.current = next;
      setReorderDrag(next);
    }
  };
  const handleGroupDragOver = (e, projectId, groupId) => {
    if (!canEditProject(projectId)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!reorderDragRef.current.active || reorderDragRef.current.type !== 'task') return;
    if (
      reorderDragRef.current.dropTargetId !== groupId ||
      reorderDragRef.current.dropTargetType !== 'group' ||
      reorderDragRef.current.dropTargetProjectId !== projectId
    ) {
      const next = {
        ...reorderDragRef.current,
        dropTargetId: groupId,
        dropTargetType: 'group',
        dropTargetProjectId: projectId,
        dropPosition: 'after'
      };
      reorderDragRef.current = next;
      setReorderDrag(next);
    }
  };
  const handleRowDrop = (e, targetType, targetId, targetProjectId = null) => {
    e.preventDefault();
    const currentDrag = reorderDragRef.current;
    if (!canEditProject(currentDrag.sourceProjectId)) {
      handleRowDragEnd();
      return;
    }
    if (targetProjectId && !canEditProject(targetProjectId)) {
      handleRowDragEnd();
      return;
    }
    const resolvedTargetId = targetId || currentDrag.dropTargetId;
    const resolvedTargetType = targetType || currentDrag.type;
    if (!currentDrag.active || !resolvedTargetId || currentDrag.dragId === resolvedTargetId) {
      handleRowDragEnd();
      return;
    }
    if (resolvedTargetType !== currentDrag.type) {
      handleRowDragEnd();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const dropPosition = e.clientY >= midY ? 'after' : 'before';
    setProjects(prev => {
      const newProjects = JSON.parse(JSON.stringify(prev));
      const findLocation = (itemId, itemType) => {
        for (let pIdx = 0; pIdx < newProjects.length; pIdx++) {
          for (let tIdx = 0; tIdx < newProjects[pIdx].tasks.length; tIdx++) {
            const task = newProjects[pIdx].tasks[tIdx];
            if (itemType === 'task' && task.id === itemId) return { pIdx, tIdx };
            if (itemType === 'subitem') {
              const sIdx = task.subitems.findIndex(s => s.id === itemId);
              if (sIdx !== -1) return { pIdx, tIdx, sIdx };
            }
          }
        }
        return null;
      };
      const source = findLocation(currentDrag.dragId, currentDrag.type);
      const target = findLocation(resolvedTargetId, resolvedTargetType);
      if (source && target) {
        if (currentDrag.type === 'task') {
          const targetGroupId = newProjects[target.pIdx].tasks[target.tIdx]?.groupId || null;
          const [moved] = newProjects[source.pIdx].tasks.splice(source.tIdx, 1);
          let idx = target.tIdx;
          if (dropPosition === 'after') idx++;
          if (source.pIdx === target.pIdx && source.tIdx < target.tIdx) idx--;
          newProjects[target.pIdx].tasks.splice(idx, 0, moved);
          if (targetGroupId !== null && targetGroupId !== undefined) moved.groupId = targetGroupId;
        } else if (currentDrag.type === 'subitem') {
          const [moved] = newProjects[source.pIdx].tasks[source.tIdx].subitems.splice(source.sIdx, 1);
          let idx = target.sIdx;
          if (dropPosition === 'after') idx++;
          if (source.pIdx === target.pIdx && source.tIdx === target.tIdx && source.sIdx < target.sIdx) idx--;
          newProjects[target.pIdx].tasks[target.tIdx].subitems.splice(idx, 0, moved);
        }
      }
      return newProjects;
    });
    handleRowDragEnd();
  };
  const handleGroupDrop = (e, projectId, groupId) => {
    if (!canEditProject(projectId)) {
      handleRowDragEnd();
      return;
    }
    e.preventDefault();
    const currentDrag = reorderDragRef.current;
    if (!canEditProject(currentDrag.sourceProjectId)) {
      handleRowDragEnd();
      return;
    }
    if (!currentDrag.active || currentDrag.type !== 'task' || !currentDrag.dragId) {
      handleRowDragEnd();
      return;
    }
    setProjects(prev => {
      const newProjects = JSON.parse(JSON.stringify(prev));
      let moved = null;
      let sourceProjectIdx = -1;
      let sourceTaskIdx = -1;
      for (let pIdx = 0; pIdx < newProjects.length; pIdx++) {
        const tIdx = newProjects[pIdx].tasks.findIndex(t => t.id === currentDrag.dragId);
        if (tIdx !== -1) {
          sourceProjectIdx = pIdx;
          sourceTaskIdx = tIdx;
          [moved] = newProjects[pIdx].tasks.splice(tIdx, 1);
          break;
        }
      }
      if (!moved) return newProjects;
      const targetProjectIdx = newProjects.findIndex(p => p.id === projectId);
      if (targetProjectIdx === -1) return newProjects;
      moved.groupId = groupId;
      let insertIdx = newProjects[targetProjectIdx].tasks.length;
      for (let i = newProjects[targetProjectIdx].tasks.length - 1; i >= 0; i--) {
        if (newProjects[targetProjectIdx].tasks[i].groupId === groupId) {
          insertIdx = i + 1;
          break;
        }
      }
      if (sourceProjectIdx === targetProjectIdx && sourceTaskIdx !== -1 && sourceTaskIdx < insertIdx) {
        insertIdx -= 1;
      }
      newProjects[targetProjectIdx].tasks.splice(insertIdx, 0, moved);
      return newProjects;
    });
    handleRowDragEnd();
  };
  const handleRowDragEnd = () => {
    if (reorderDragRef.current.active && reorderDragRef.current.originalExpanded && reorderDragRef.current.dragId) {
      setExpandedItems(prev => (prev.includes(reorderDragRef.current.dragId) ? prev : [...prev, reorderDragRef.current.dragId]));
    }
    const next = {
      active: false,
      type: null,
      dragId: null,
      parentId: null,
      dropTargetId: null,
      dropTargetType: null,
      dropTargetProjectId: null,
      sourceProjectId: null,
      dropPosition: 'before',
      originalExpanded: false
    };
    reorderDragRef.current = next;
    setReorderDrag(next);
  };

  // --- DRAG HANDLERS (GANTT BARS) ---
  const handleMouseDown = (e, task, projectId, type, subitemId = null, origin = 'parent') => {
    if (!canEditProject(projectId)) return;
    e.stopPropagation(); if (e.target.tagName === 'INPUT') return; 
    let startDayIndex = 0;
    if (type === 'create') {
        if (subitemId ? task.subitems?.find(s => s.id === subitemId)?.start : task.start) return; 
        const clickX = e.nativeEvent.offsetX; const visualIndex = Math.floor(clickX / zoomLevel); startDayIndex = visualIndexToDayIndex[visualIndex] || 0;
    }
    const startKey = type === 'create'
      ? null
      : (subitemId ? task.subitems.find(s => s.id === subitemId).start : task.start);
    const originalStart = type === 'create' ? startDayIndex : relativeIndexFromDateKey(startKey);
    setDragState({ isDragging: true, type, taskId: task.id, subitemId, projectId, startX: e.clientX, originalStart, originalDuration: type === 'create' ? 1 : (subitemId ? task.subitems.find(s=>s.id===subitemId).duration : task.duration), currentSpan: 1, hasMoved: false, isDeleteMode: false, origin, currentVisualSlot: 0 });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragState.isDragging) return;
      if (!canEditProject(dragState.projectId)) return;
      const deltaX = e.clientX - dragState.startX;
      if (Math.abs(deltaX) > 5) setDragState(prev => ({ ...prev, hasMoved: true }));
      const deltaVisualSlots = Math.round(deltaX / zoomLevel);

      if (dragState.type === 'create') { setDragState(prev => ({ ...prev, currentSpan: Math.max(1, 1 + deltaVisualSlots) })); return; }

      const origVisStart = dayToVisualIndex[dragState.originalStart];
      const origVisEnd = dayToVisualIndex[dragState.originalStart + dragState.originalDuration];
      let deleteMode = false; let fixedBin = 0;

      if (dragState.type === 'resize-right') { if (origVisEnd + deltaVisualSlots <= origVisStart) { deleteMode = true; fixedBin = origVisStart - 1; } } 
      else if (dragState.type === 'resize-left') { if (origVisStart + deltaVisualSlots >= origVisEnd) { deleteMode = true; fixedBin = origVisEnd; } }

      if (deleteMode) { setDragState(prev => ({ ...prev, isDeleteMode: true, currentVisualSlot: fixedBin })); return; }
      else if (dragState.isDeleteMode) setDragState(prev => ({ ...prev, isDeleteMode: false }));

      setProjects(prev => prev.map(proj => {
        if (proj.id !== dragState.projectId) return proj;
        return { ...proj, tasks: proj.tasks.map(task => {
             if (dragState.subitemId) {
                 if (task.id === dragState.taskId) { 
                     return { ...task, subitems: task.subitems.map(sub => {
                         if (sub.id !== dragState.subitemId) return sub;
                        if (dragState.type === 'move') {
                             const newStart = visualIndexToDayIndex[Math.max(0, origVisStart + deltaVisualSlots)];
                             if (newStart !== undefined) return { ...sub, start: dateKeyFromRelativeIndex(newStart), duration: calculateCalendarDuration(newStart, origVisEnd - origVisStart, rawDays, showWeekends) };
                         } else if (dragState.type === 'resize-right') {
                             const newVisEnd = Math.max(origVisStart + 1, origVisEnd + deltaVisualSlots);
                             return { ...sub, duration: calculateCalendarDuration(dragState.originalStart, newVisEnd - origVisStart, rawDays, showWeekends) };
                         } else if (dragState.type === 'resize-left') {
                             const newVisStart = Math.min(Math.max(0, origVisStart + deltaVisualSlots), origVisEnd - 1);
                             const newStart = visualIndexToDayIndex[newVisStart];
                             const endDay = dragState.originalStart + dragState.originalDuration;
                             return { ...sub, start: dateKeyFromRelativeIndex(newStart), duration: Math.max(1, endDay - newStart) };
                         }
                         return sub;
                     })};
                 }
                 return task;
             }
             if (task.id !== dragState.taskId) return task;
             if (dragState.type === 'move') {
                 const newStart = visualIndexToDayIndex[Math.max(0, origVisStart + deltaVisualSlots)];
                 if (newStart !== undefined) return { ...task, start: dateKeyFromRelativeIndex(newStart), duration: calculateCalendarDuration(newStart, origVisEnd - origVisStart, rawDays, showWeekends) };
             } else if (dragState.type === 'resize-right') {
                 const newVisEnd = Math.max(origVisStart + 1, origVisEnd + deltaVisualSlots);
                 return { ...task, duration: calculateCalendarDuration(dragState.originalStart, newVisEnd - origVisStart, rawDays, showWeekends) };
             } else if (dragState.type === 'resize-left') {
                 const newVisStart = Math.min(Math.max(0, origVisStart + deltaVisualSlots), origVisEnd - 1);
                 const newStart = visualIndexToDayIndex[newVisStart];
                 const endDay = dragState.originalStart + dragState.originalDuration;
                 return { ...task, start: dateKeyFromRelativeIndex(newStart), duration: Math.max(1, endDay - newStart) };
             }
             return task;
          })
        };
      }));
    };
    const handleMouseUp = () => {
      if (dragState.isDragging) {
        if (!canEditProject(dragState.projectId)) {
          setDragState(prev => ({ ...prev, isDragging: false, type: null, isDeleteMode: false }));
          return;
        }
        if (dragState.isDeleteMode) { guardedUpdateTaskDate(dragState.projectId, dragState.taskId, dragState.subitemId, null, null); }
        else if (dragState.type === 'create') { guardedUpdateTaskDate(dragState.projectId, dragState.taskId, dragState.subitemId, dateKeyFromRelativeIndex(dragState.originalStart), calculateCalendarDuration(dragState.originalStart, dragState.currentSpan, rawDays, showWeekends)); }
        setDragState(prev => ({ ...prev, isDragging: false, type: null, isDeleteMode: false }));
      }
    };
    if (dragState.isDragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [dragState, zoomLevel, dayToVisualIndex, visualIndexToDayIndex, showWeekends, rawDays]);

  // --- EXPORT/IMPORT HANDLERS ---
  const exportData = () => {
    const headers = ["Board", "Group", "Task Name", "Type", "Status", "Job Type", "Assignee", "Start Date", "Duration (Days)"];
    const csvRows = [headers.join(",")];
    projects.forEach(project => {
      const groups = project.groups || [];
      groups.forEach(group => {
        const tasks = project.tasks.filter(t => t.groupId === group.id || (!t.groupId && group.id === 'default'));
        tasks.forEach(task => {
          const statusLabel = statuses.find(s => s.id === task.status)?.label || task.status;
          const jobTypeLabel = jobTypes.find(j => j.id === task.jobTypeId)?.label || task.jobTypeId;
          const startDate = task.start !== null ? formatDateKey(task.start) : "TBD";
          const clean = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
          csvRows.push([clean(project.name), clean(group.name), clean(task.name), "Task", clean(statusLabel), clean(jobTypeLabel), clean(task.assignee), clean(startDate), task.duration || 0].join(","));
          if (task.subitems && task.subitems.length > 0) {
            task.subitems.forEach(sub => {
               const subStatus = statuses.find(s => s.id === sub.status)?.label || sub.status;
               const subJob = jobTypes.find(j => j.id === sub.jobTypeId)?.label || sub.jobTypeId;
               const subStart = sub.start !== null ? formatDateKey(sub.start) : "TBD";
               csvRows.push([clean(project.name), clean(group.name), clean(`  ↳ ${sub.name}`), "Subitem", clean(subStatus), clean(subJob), clean(sub.assignee), clean(subStart), sub.duration || 0].join(","));
            });
          }
        });
      });
    });
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `project_export_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ projects, workspaces, dashboards, statuses, jobTypes }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `project_manager_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
  };

  const importJson = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.projects) setProjects(data.projects);
        if (data.workspaces) setWorkspaces(data.workspaces);
        if (data.dashboards) setDashboards(data.dashboards);
        if (data.statuses) setStatuses(data.statuses);
        if (data.jobTypes) setJobTypes(data.jobTypes);
        alert('Data loaded successfully!');
      } catch (err) { alert('Invalid JSON file'); }
    };
    reader.readAsText(file);
  };

  const resetBoardsAndWorkspaces = async () => {
    const ack = typeof window !== "undefined"
      ? window.prompt("Type RESET to permanently remove all current boards and workspaces")
      : null;
    if (ack !== "RESET") return;

    const projectIds = Array.from(
      new Set([
        ...(projects || []).map((project) => project?.id),
        ...(ownedProjects || []).map((row) => row?.projectId),
        ...(memberProjects || []).map((row) => row?.projectId),
      ].filter(Boolean))
    );

    let skippedCount = 0;

    if (canUseFirestore() && db && authUser && !authUser.isAnonymous) {
      for (const projectId of projectIds) {
        try {
          const subcollections = ["state", "members", "files", "invites", "accessRequests"];
          for (const subcollectionName of subcollections) {
            try {
              const subSnap = await getDocs(collection(db, "projects", projectId, subcollectionName));
              await Promise.all(subSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)));
            } catch (subErr) {
              if (!isPermissionDeniedError(subErr)) throw subErr;
            }
          }
          await deleteDoc(doc(db, "projects", projectId));
        } catch (err) {
          if (shouldDisableFirestore(err)) {
            disableFirestore(err, `reset:${projectId}`);
            break;
          }
          skippedCount += 1;
          console.warn("Skipping board reset for project:", projectId, err);
        }
      }

      const appId = "my-manager-app";
      const userId = authUser.uid;
      const hybridDocs = [
        ["projects", "pmai_projects"],
        ["workspaces", "pmai_workspaces"],
        ["dashboards", "pmai_dashboards"],
      ];
      for (const [collectionName, key] of hybridDocs) {
        try {
          await deleteDoc(doc(db, "artifacts", appId, "users", userId, collectionName, key));
        } catch {}
      }
    }

    setProjects([]);
    setWorkspaces([]);
    setDashboards([]);
    setProjectMembersById({});
    setMyMembershipByProjectId({});
    setProjectInvitesById({});
    setProjectFilesById({});
    setMemberProjects([]);
    setOwnedProjects([]);
    setSelectedItems(new Set());
    setCollapsedGroups([]);
    setExpandedItems([]);
    setUpdatesPanelTarget(null);
    setStatusMenuOpen(null);
    setDatePickerOpen(null);
    setActiveEntityId("");
    setActiveBoardId(null);
    setMembersModalOpen(false);

    const localKeys = [
      "pmai_projects",
      "pmai_workspaces",
      "pmai_dashboards",
      "pmai_active_workspace_id",
      "pmai_active_board_id",
      "pmai_board_columns",
    ];
    localKeys.forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    });

    if (typeof window !== "undefined") {
      if (skippedCount > 0) {
        window.alert(`Reset completed with ${skippedCount} board(s) skipped due to permissions.`);
      } else {
        window.alert("Reset complete. You can now create a fresh workspace and board.");
      }
    }
  };


  return (
    <div className={`flex h-screen font-sans overflow-hidden select-none transition-colors duration-300 ${darkMode ? 'bg-[#181b34] text-gray-100' : 'bg-[#eceff8] text-[#323338]'}`} onClick={() => { setStatusMenuOpen(null); setSettingsMenuOpen(false); setDatePickerOpen(null); }}>
        <Sidebar
          darkMode={darkMode}
          workspaces={workspaces}
          selectedWorkspaceId={activeEntityId}
          setSelectedWorkspaceId={setActiveEntityId}
          boards={boardsInActiveWorkspace}
          activeBoardId={activeBoardId}
          setActiveBoardId={setActiveBoardId}
          createWorkspace={createWorkspace}
          createBoard={() => handleCreateProjectInActiveWorkspace({ askName: true })}
          canCreateBoard={canCreateProjectInActiveWorkspace}
          setDarkMode={setDarkMode}
        />
        
        <div className={`flex-1 flex flex-col min-w-0 relative ${darkMode ? 'bg-[#181b34]' : 'bg-white'}`}>
            <AppHeader 
                activeEntity={activeEntity} activeTab={activeTab} setActiveTab={setActiveTab} darkMode={darkMode}
                setSettingsMenuOpen={setSettingsMenuOpen} settingsMenuOpen={settingsMenuOpen}
                showWeekends={showWeekends} onToggleWeekends={handleToggleWeekends} showLabels={showLabels} setShowLabels={setShowLabels}
                colorBy={colorBy} setColorBy={setColorBy} zoomLevel={zoomLevel} handleZoomChange={handleZoomChange}
                rowHeight={rowHeight} setRowHeight={setRowHeight} isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen}
                scrollToToday={scrollToToday} updateEntityName={handleUpdateEntityName} canEditEntityName={canEditActiveEntityName}
                onExport={exportData} onExportJson={exportJson} onImportJson={importJson} onResetData={resetBoardsAndWorkspaces}
                authUser={authUser} onOpenAuth={() => setAuthModalOpen(true)} onOpenMembers={() => setMembersModalOpen(true)}
            />

            <div className={`flex-1 overflow-hidden flex flex-col relative ${darkMode ? 'bg-[#181b34]' : 'bg-white'}`}>
                {activeEntity?.type === 'workspace' && visibleProjects.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center px-6">
                        <div className={`w-[620px] max-w-full rounded-2xl border p-8 text-center ${
                            darkMode ? 'bg-[#151726] border-[#2b2c32]' : 'bg-white border-gray-200'
                        }`}>
                            <div className={`text-xl font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                                This workspace has no boards yet
                            </div>
                            <div className={`mt-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                Start by creating your first board. You can then add groups and items inside it.
                            </div>
                            <button
                                onClick={() => handleCreateProjectInActiveWorkspace()}
                                disabled={!canCreateProjectInActiveWorkspace}
                                className={`mt-6 px-4 py-2 rounded-md text-sm font-semibold ${
                                    canCreateProjectInActiveWorkspace
                                        ? darkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : darkMode ? 'bg-white/10 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                Create First Board
                            </button>
                            {!canCreateProjectInActiveWorkspace && (
                                <div className={`mt-3 text-xs ${darkMode ? 'text-amber-300/80' : 'text-amber-700'}`}>
                                    You need an editor-level role or higher to create boards.
                                </div>
                            )}
                        </div>
                    </div>
                ) : activeTab === 'board' ? (
                    <BoardView 
                        activeTab={activeTab} 
                        visibleProjects={visibleProjects} collapsedGroups={collapsedGroups} toggleGroupCollapse={toggleGroupCollapse}
                        updateGroupName={guardedUpdateGroupName} statuses={statuses} jobTypes={jobTypes} darkMode={darkMode}
                        addTaskToGroup={guardedAddTaskToGroup} addGroup={guardedAddGroup} expandedItems={expandedItems} toggleItemExpand={toggleItemExpand}
                        updateTaskName={guardedUpdateTaskName} updateSubitemName={guardedUpdateSubitemName} handleAddSubitem={guardedAddSubitem}
                        handleRowDragStart={handleRowDragStart} handleRowDragOver={handleRowDragOver} handleRowDrop={handleRowDrop} handleRowDragEnd={handleRowDragEnd}
                        handleGroupDragOver={handleGroupDragOver} handleGroupDrop={handleGroupDrop}
                        reorderDrag={reorderDrag} selectedItems={selectedItems} toggleSelection={toggleSelection}
                        setStatusMenuOpen={setStatusMenuOpen} setStatusMenuType={setStatusMenuType} setDatePickerOpen={setDatePickerOpen}
                        statusMenuOpen={statusMenuOpen} statusMenuType={statusMenuType} 
                        onStatusSelect={guardedChangeStatus} onTypeSelect={guardedChangeJobType}
                        onEditStatusLabels={openStatusEditor}
                        onEditTypeLabels={openTypeEditor}
                        onAddStatusLabel={guardedAddStatusLabel}
                        onAddTypeLabel={guardedAddTypeLabel}
                        boardColumns={boardColumns}
                        onStartResize={startBoardResize}
                        onOpenUpdates={openUpdatesPanel}
                        canEditProject={canEditProject}
                    />
                ) : (
                    <GanttView 
                        visibleProjects={visibleProjects} collapsedGroups={collapsedGroups} toggleGroupCollapse={toggleGroupCollapse}
                        darkMode={darkMode} rowHeight={rowHeight} visibleDays={visibleDays} visibleMonths={visibleMonths}
                        zoomLevel={zoomLevel} dayToVisualIndex={dayToVisualIndex} visualIndexToDayIndex={visualIndexToDayIndex}
                        showWeekends={showWeekends} showLabels={showLabels} statuses={statuses} jobTypes={jobTypes} colorBy={colorBy}
                        dragState={dragState} handleMouseDown={handleMouseDown}
                        handleRowDragStart={handleRowDragStart} handleRowDragOver={handleRowDragOver} handleRowDrop={handleRowDrop} handleRowDragEnd={handleRowDragEnd}
                        handleGroupDragOver={handleGroupDragOver} handleGroupDrop={handleGroupDrop}
                        reorderDrag={reorderDrag} selectedItems={selectedItems} toggleSelection={toggleSelection}
                        handleAddSubitem={guardedAddSubitem} updateTaskName={guardedUpdateTaskName} addTaskToGroup={guardedAddTaskToGroup}
                        expandedItems={expandedItems} toggleItemExpand={toggleItemExpand} updateSubitemName={guardedUpdateSubitemName}
                        setStatusMenuOpen={setStatusMenuOpen} setStatusMenuType={setStatusMenuType} setDatePickerOpen={setDatePickerOpen}
                        onStatusSelect={guardedChangeStatus} onTypeSelect={guardedChangeJobType}
                        onEditStatusLabels={openStatusEditor}
                        onEditTypeLabels={openTypeEditor}
                        onAddStatusLabel={guardedAddStatusLabel}
                        onAddTypeLabel={guardedAddTypeLabel}
                        onOpenUpdates={openUpdatesPanel}
                        getRelativeIndex={relativeIndexFromDateKey}
                        bodyRef={bodyRef}
                        hiddenWeekendHeaderMarkers={hiddenWeekendHeaderMarkers}
                        hiddenWeekendItemMarkers={hiddenWeekendItemMarkers}
                        canEditProject={canEditProject}
                    />
                )}
                {authUser && !authUser.isAnonymous && activeProject && !activePermissions.canView && (
                    <div className="absolute inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className={`w-[520px] max-w-[90vw] rounded-xl p-6 shadow-2xl ${darkMode ? 'bg-[#151726] border border-[#2b2c32]' : 'bg-white border border-gray-200'}`}>
                            <div className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Access required</div>
                            <div className={`text-sm mt-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                {activeMember
                                    ? 'Your contractor access has expired for this board. You can request access below.'
                                    : 'You are not a member of this board. You can request access below.'}
                            </div>
                            <div className="mt-4 space-y-2 max-h-[220px] overflow-y-auto">
                                {workspaceAccessRows.length === 0 && (
                                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No boards found in this workspace.</div>
                                )}
                                {workspaceAccessRows.map((proj) => (
                                    <div key={proj.projectId} className={`flex items-center justify-between p-2 rounded-lg ${darkMode ? 'bg-[#0f1224]' : 'bg-gray-50'}`}>
                                        <div>
                                            <div className={`text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{proj.projectName || proj.projectId}</div>
                                            <div className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                                {proj.role === 'contractor' ? `Contractor (${proj.baseRole || 'viewer'})` : proj.role}
                                            </div>
                                        </div>
                                        {proj.canView ? (
                                            <button
                                                onClick={() => setActiveBoardId(proj.projectId)}
                                                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                                                    darkMode ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                }`}
                                            >
                                                Open board
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => requestProjectAccess(proj.projectId)}
                                                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                                                    darkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                                                }`}
                                            >
                                                Request access
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {authUser && !authUser.isAnonymous && activeProject && activePermissions.canView && !canEditActiveProject && (
                    <div className="absolute top-4 right-4 z-[135]">
                        <div className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                            darkMode ? 'bg-[#0f1224] border-[#2b2c32] text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>
                            Read-only role: Viewer
                        </div>
                    </div>
                )}
            </div>

            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] shadow-2xl border rounded-xl px-4 py-2 flex items-center gap-3 transition-all duration-300 ease-in-out ${selectedItems.size > 0 ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'} ${darkMode ? 'bg-[#111322] border-[#2b2c32]' : 'bg-white border-gray-200'}`}>
                <span className={`text-xs font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{selectedItems.size} selected</span>
                <button onClick={deleteSelected} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"><Trash2 size={14} /> Delete</button>
            </div>
            
            <UpdatesPanel
                darkMode={darkMode}
                target={updatesTarget}
                onClose={() => setUpdatesPanelTarget(null)}
                onAddUpdate={handleAddUpdate}
                onAddReply={handleAddReply}
                onToggleChecklistItem={handleToggleChecklistItem}
                onAddFiles={handleAddFiles}
                permissions={updatesPermissions}
                onUpdateFileAccess={handleUpdateFileAccess}
                onToggleShareLink={handleToggleShareLink}
                shareBaseUrl={shareBaseUrl}
            />
            <MembersModal
                open={membersModalOpen}
                onClose={() => setMembersModalOpen(false)}
                darkMode={darkMode}
                project={activeProject}
                members={activeMembers}
                invites={activeInvites}
                currentMember={activeMember}
                canManageMembers={membersCanManage}
                onInvite={sendProjectInvite}
                onUpdateMember={updateProjectMember}
                onRemoveMember={removeProjectMember}
                onRevokeInvite={revokeInvite}
            />
            {showDebugBadge && (
                <div className={`fixed bottom-4 right-4 z-[260] rounded-lg text-[10px] font-mono shadow-lg ${
                    darkMode ? "bg-[#0f1224] border border-[#2b2c32] text-gray-200" : "bg-white border border-gray-200 text-gray-700"
                }`}>
                    <button
                        onClick={() => setDebugExpanded((prev) => !prev)}
                        className={`w-full px-3 py-2 text-left font-semibold flex items-center justify-between ${
                            darkMode ? "hover:bg-white/5" : "hover:bg-gray-50"
                        }`}
                    >
                        <span>Auth Debug</span>
                        <span className="text-[11px]">{debugExpanded ? "–" : "+"}</span>
                    </button>
                    {debugExpanded && (
                        <div className="px-3 pb-3">
                            <div>uid: {authUser?.uid || "none"}</div>
                            <div>email: {authUser?.email || "anonymous"}</div>
                            <div>anon: {authUser?.isAnonymous ? "yes" : "no"}</div>
                            <div>board: {activeProject?.id || "none"}</div>
                            <div>member: {activeMember ? "found" : "missing"}</div>
                            <div>role: {getMemberEffectiveRole(activeMember) || "n/a"}</div>
                            <div>active: {activeMember ? (isMemberActive(activeMember) ? "yes" : "no") : "n/a"}</div>
                            <div>perm: {activePermissions?.rank || 0}</div>
                            <div className="mt-1 opacity-70">toggle: localStorage pmai_debug_auth=1</div>
                        </div>
                    )}
                </div>
            )}
            <DatePicker datePickerOpen={datePickerOpen} setDatePickerOpen={setDatePickerOpen} darkMode={darkMode} updateTaskDate={guardedUpdateTaskDate} />
            <LabelEditorModal isOpen={statusEditorOpen} onClose={() => setStatusEditorOpen(false)} items={statuses} onSave={setStatuses} title="Edit Status Labels" darkMode={darkMode} />
            <LabelEditorModal isOpen={jobTypeEditorOpen} onClose={() => setJobTypeEditorOpen(false)} items={jobTypes} onSave={setJobTypes} title="Edit Type Labels" darkMode={darkMode} />
            <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} auth={auth} user={authUser} darkMode={darkMode} />
        </div>
    </div>
  );
}
 
