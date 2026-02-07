import TaskRow from "./components/TaskRow";
import GanttView from "./components/GanttView";
import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { 
  Mic, Send, BarChart2, FileText, Plus, ChevronRight, ChevronDown, ChevronLeft, Zap, Layout,
  MessageSquare, ZoomIn, ZoomOut, ArrowUpDown, ChevronsDown, ChevronsUp,
  MoreHorizontal, X, Edit2, Check, Briefcase, LayoutDashboard, Settings, Square, CheckSquare,
  Moon, Sun, CornerDownRight, Trash2, Palette, GripHorizontal, Pipette, CheckCircle2,
  Calendar as CalendarIcon, CalendarOff, Layers, Tag, Eye, Target, Download, Upload
} from 'lucide-react';

// ==================================================================================
// 1. FIREBASE SETUP (Vite + Firestore + Anonymous Auth)
// ==================================================================================
// ✅ Run: npm install firebase

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from "firebase/firestore";
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

try {
  if (firebaseEnabled) {
    app = initializeApp(YOUR_FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase initialized");
  } else {
    console.warn("Firebase disabled (missing config). Running in localStorage-only mode.");
  }
} catch (e) {
  console.warn("Firebase init failed. Running in localStorage-only mode:", e);
}

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

const MONDAY_PALETTE = [
  "#00c875", "#9cd326", "#cab641", "#ffcb00", "#fdab3d", "#ff642e", "#e2445c", "#ff007f",
  "#ff5ac4", "#ffcead", "#a25ddc", "#784bd1", "#579bfc", "#0086c0", "#595ad4", "#037f4c",
  "#00ca72", "#3b85f6", "#175a63", "#333333", "#7f5f3f", "#dff0ff", "#304575", "#7f8c8d",
  "#c4c4c4", "#808080", "#111111", "#b5c0d0"
];

const PAST_DAYS = 60;
const FUTURE_DAYS = 365;
const TIMELINE_TOTAL_DAYS = PAST_DAYS + FUTURE_DAYS;

// --- TIMELINE BASE DATE (local calendar anchor, with migration) ---

const BASE_DATE_KEY = "pmai_baseDate";

// Format Date -> YYYY-MM-DD (local)
const toLocalDateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Parse YYYY-MM-DD -> local midnight Date
const fromLocalDateKey = (key) => {
  const [y, m, d] = String(key).split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const getBaseDate = () => {
  try {
    const saved = window.localStorage.getItem(BASE_DATE_KEY);

    // ✅ New format: YYYY-MM-DD
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
      const dt = fromLocalDateKey(saved);
      if (dt) return dt;
    }

    // ✅ Old format: ISO string (migration)
    if (saved) {
      const parsed = new Date(saved);
      if (!Number.isNaN(parsed.getTime())) {
        const migratedKey = toLocalDateKey(parsed);
        window.localStorage.setItem(BASE_DATE_KEY, migratedKey);
        const dt = fromLocalDateKey(migratedKey);
        if (dt) return dt;
      }
    }

    // Fresh
    const todayKey = toLocalDateKey(new Date());
    window.localStorage.setItem(BASE_DATE_KEY, todayKey);
    return fromLocalDateKey(todayKey) || new Date();
  } catch {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
};

// IMPORTANT: use TODAY everywhere instead of new Date()
const TODAY = getBaseDate();



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
        id: 't1', groupId: 'g1', name: 'Discovery Phase', start: 0, duration: 15, progress: 100, status: 'done', assignee: 'Sarah', priority: 'High', jobTypeId: 'research',
        subitems: [
           { id: 's1', name: 'Stakeholder Interviews', status: 'done', assignee: 'Sarah', start: 0, duration: 5, jobTypeId: 'research' },
           { id: 's2', name: 'Requirement Gathering', status: 'working', assignee: 'Mike', start: 5, duration: 10, jobTypeId: 'planning' }
        ]
      },
      { id: 't2', groupId: 'g1', name: 'Wireframing', start: 16, duration: 20, progress: 60, status: 'working', assignee: 'Mike', priority: 'Medium', jobTypeId: 'design', subitems: [] },
      { id: 't3', groupId: 'g2', name: 'UI Design', start: 30, duration: 30, progress: 0, status: 'pending', assignee: 'Jessica', priority: 'High', jobTypeId: 'design', subitems: [] },
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
  const d = getLocalMidnight(date);
  const diffTime = d - TODAY;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};


const getFutureDate = (daysToAdd) => {
  if (daysToAdd === null || daysToAdd === undefined) return null;
  const date = new Date(TODAY);
  date.setDate(TODAY.getDate() + daysToAdd);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    if (!user || !db) return;

    const appId = "my-manager-app";
    const docRef = doc(db, "artifacts", appId, "users", user.uid, collectionName, key);
    const legacyRef = doc(db, "artifacts", appId, collectionName, key);

    // One-time legacy -> user-scoped migration
    (async () => {
      try {
        const [newSnap, oldSnap] = await Promise.all([getDoc(docRef), getDoc(legacyRef)]);
        if (!newSnap.exists() && oldSnap.exists()) {
          await setDoc(docRef, oldSnap.data(), { merge: true });
        }
      } catch (e) {
        console.warn("Firestore migration check failed:", e);
      }
    })();

    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (!snapshot.exists()) return;
      try {
        const next = JSON.parse(snapshot.data().value);
        setData(next);
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch (e) {
        console.warn("Failed to parse Firestore payload:", e);
      }
    });

    return () => unsubscribe();
  }, [user, key, collectionName]);

  // 3) Save (local + optional Firestore)
  const saveData = async (newValueOrFn) => {
    const newValue = typeof newValueOrFn === "function" ? newValueOrFn(data) : newValueOrFn;

    setData(newValue);
    try { window.localStorage.setItem(key, JSON.stringify(newValue)); } catch {}

    if (user && db) {
      const appId = "my-manager-app";
      const docRef = doc(db, "artifacts", appId, "users", user.uid, collectionName, key);
      try {
        await setDoc(docRef, { value: JSON.stringify(newValue) }, { merge: true });
      } catch (err) {
        console.warn("Failed to save to Firestore:", err);
      }
    }
  };

  return [data, saveData];
}

// --- DATA LOGIC BRAIN ---
function useProjectData() {
  // ✅ switched to hybrid (localStorage + Firestore)
  const [projects, setProjects] = useHybridState('pmai_projects', INITIAL_PROJECTS, 'projects');

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
    deleteSelection: (ids) => { setProjects(prev => prev.map(p => ({ ...p, tasks: p.tasks.filter(t => !ids.has(t.id)).map(t => ({ ...t, subitems: t.subitems.filter(s => !ids.has(s.id)) })) }))); }
  };

  return { projects, setProjects, ...actions };
}

// ==========================================
// 3. UI COMPONENTS
// ==========================================

const EditableText = ({ value, onChange, className, style, placeholder, autoFocus, onBlur }) => {
  const spanRef = useRef(null);
  const [width, setWidth] = useState('auto');
  useLayoutEffect(() => { if (spanRef.current) setWidth(`${Math.max(20, spanRef.current.offsetWidth + 12)}px`); }, [value, placeholder]);
  return (
    <div className="relative max-w-full flex items-center no-drag">
        <span ref={spanRef} className={`absolute opacity-0 pointer-events-none whitespace-pre px-1 ${className}`} style={style} aria-hidden="true">{value || placeholder || ''}</span>
        <input value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} onBlur={onBlur} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} draggable={false} className={`bg-transparent border border-transparent hover:border-gray-400/50 rounded px-1 -ml-1 transition-all outline-none cursor-text truncate ${className}`} style={{ ...style, width }} />
    </div>
  );
};

const Sidebar = ({ darkMode, workspaces, dashboards, activeEntityId, setActiveEntityId, createWorkspace, createDashboard, setDarkMode }) => (
    <div className={`w-64 border-r flex flex-col hidden md:flex ${darkMode ? 'bg-[#111322] border-[#2b2c32]' : 'bg-white border-[#d0d4e4]'}`}>
        <div className={`p-4 border-b ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'} `}><h2 className="font-bold text-lg">Workspace</h2></div>
        <div className="flex-1 overflow-y-auto p-3 space-y-6">
           <div>
             <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2"><span>Boards</span><Plus size={14} className="cursor-pointer hover:text-blue-500" onClick={createWorkspace} /></div>
             <div className="space-y-1">{workspaces.map(w => (<div key={w.id} onClick={() => setActiveEntityId(w.id)} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${activeEntityId === w.id ? (darkMode ? 'bg-[#1c213e] text-blue-400' : 'bg-blue-50 text-blue-600') : (darkMode ? 'hover:bg-[#1c213e] text-gray-400' : 'hover:bg-gray-100 text-gray-700')}`}><Briefcase size={16} /><span className="truncate font-medium">{w.name}</span></div>))}</div>
           </div>
           <div>
             <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2"><span>Dashboards</span><Plus size={14} className="cursor-pointer hover:text-blue-500" onClick={createDashboard} /></div>
             <div className="space-y-1">{dashboards.map(d => (<div key={d.id} onClick={() => setActiveEntityId(d.id)} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${activeEntityId === d.id ? (darkMode ? 'bg-[#1c213e] text-purple-400' : 'bg-purple-50 text-purple-600') : (darkMode ? 'hover:bg-[#1c213e] text-gray-400' : 'hover:bg-gray-100 text-gray-700')}`}><LayoutDashboard size={16} /><span className="truncate font-medium">{d.name}</span></div>))}</div>
           </div>
        </div>
        <div className={`p-4 border-t ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'} flex items-center justify-between`}>
             <span className="text-xs text-gray-500">Theme</span>
             <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full ${darkMode ? 'bg-[#2b2c32] text-yellow-400' : 'bg-gray-100 text-gray-600'}`}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
    </div>
);

const AppHeader = ({ activeEntity, activeTab, setActiveTab, darkMode, setSettingsMenuOpen, settingsMenuOpen, showWeekends, setShowWeekends, showLabels, setShowLabels, colorBy, setColorBy, zoomLevel, handleZoomChange, rowHeight, setRowHeight, isChatOpen, setIsChatOpen, scrollToToday, updateEntityName, onExport, onExportJson, onImportJson, authUser, onOpenAuth }) => (
    <>
        <div className={`h-16 border-b px-8 flex items-center justify-between shrink-0 ${darkMode ? 'border-[#2b2c32] bg-[#181b34]' : 'border-[#d0d4e4] bg-white'}`}>
          <div>
            <div className="flex items-center gap-3 text-2xl font-bold">
              {activeEntity.type === 'workspace' ? <Briefcase className="text-gray-400" /> : <LayoutDashboard className="text-purple-500" />}
              <EditableText value={activeEntity.name} onChange={(e) => updateEntityName(e.target.value)} className={`hover:bg-opacity-10 px-2 -ml-2 rounded ${darkMode ? 'text-white hover:bg-white' : 'hover:bg-gray-800'}`} />
            </div>
          </div>
          <button onClick={onOpenAuth} className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${darkMode ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200 hover:bg-[#202336]' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            {authUser ? (authUser.isAnonymous ? 'Guest' : (authUser.email || 'Account')) : 'Account'}
          </button>
        </div>
        <div className={`px-8 border-b flex items-center justify-between shrink-0 sticky top-0 z-30 ${darkMode ? 'border-[#2b2c32] bg-[#181b34]' : 'border-[#d0d4e4] bg-white'}`}>
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
                         <div className={`absolute top-full right-0 mt-2 w-56 rounded-lg shadow-xl border z-[100] p-2 animate-in fade-in zoom-in-95 duration-100 ${darkMode ? 'bg-[#2b2c32] border-[#3e3f4b]' : 'bg-white border-gray-200'}`} onClick={e => e.stopPropagation()}>
                             <div className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide px-2">View Options</div>
                             <div className={`flex items-center justify-between p-2 rounded cursor-pointer ${darkMode ? 'hover:bg-[#1c213e]' : 'hover:bg-gray-50'}`} onClick={() => setShowWeekends(!showWeekends)}>
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

const GroupHeaderRow = ({ darkMode }) => (
    <div className={`flex border-b text-xs font-bold text-gray-500 uppercase tracking-wide ${darkMode ? 'bg-[#181b34] border-[#2b2c32]' : 'bg-white border-[#d0d4e4]'}`}>
        <div className={`w-10 border-r flex items-center justify-center py-2 ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}><Square size={14} className="opacity-50" /></div>
        <div className={`w-[450px] border-r px-4 py-2 flex items-center ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}>Item</div>
        <div className={`w-28 border-r px-4 py-2 flex items-center justify-center ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}>Person</div>
        <div className={`w-36 border-r px-4 py-2 flex items-center justify-center ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}>Status</div>
        <div className={`w-36 border-r px-4 py-2 flex items-center justify-center ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}>Type</div>
        <div className="w-48 px-4 py-2 flex items-center justify-center">Date</div>
    </div>
);

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

const StatusDropdown = ({ statuses, currentStatusId, onSelect, darkMode, onEdit }) => (
    <div className={`rounded-md shadow-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${darkMode ? 'bg-[#2b2c32] border-[#3e3f4b]' : 'bg-white border-gray-200'}`}>
        {statuses.map(s => (
            <div key={s.id} onClick={(e) => { e.stopPropagation(); onSelect(s.id); }} className={`px-3 py-2 text-xs font-medium cursor-pointer flex items-center gap-2 transition-colors ${darkMode ? 'hover:bg-[#1c213e] text-white' : 'hover:bg-gray-50 text-gray-800'}`}>
                <div className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: s.color }}></div>
                <span className="flex-1">{s.label}</span>
                {s.id === currentStatusId && <Check size={12} className="opacity-50" />}
            </div>
        ))}
        <div onClick={(e) => { e.stopPropagation(); onEdit(); }} className={`px-3 py-2 text-xs border-t cursor-pointer flex items-center gap-2 transition-colors ${darkMode ? 'border-[#3e3f4b] hover:bg-[#1c213e] text-blue-400' : 'border-gray-100 hover:bg-gray-50 text-blue-600'}`}><Edit2 size={12} /> Edit Labels</div>
    </div>
);

const TypeDropdown = ({ jobTypes, currentTypeId, onSelect, darkMode, onEdit }) => (
    <div className={`rounded-md shadow-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${darkMode ? 'bg-[#2b2c32] border-[#3e3f4b]' : 'bg-white border-gray-200'}`}>
        {jobTypes.map(t => (
            <div key={t.id} onClick={(e) => { e.stopPropagation(); onSelect(t.id); }} className={`px-3 py-2 text-xs font-medium cursor-pointer flex items-center gap-2 transition-colors ${darkMode ? 'hover:bg-[#1c213e] text-white' : 'hover:bg-gray-50 text-gray-800'}`}>
                <div className="w-4 h-4 rounded shrink-0" style={{ backgroundColor: t.color }}></div>
                <span className="flex-1">{t.label}</span>
                {t.id === currentTypeId && <Check size={12} className="opacity-50" />}
            </div>
        ))}
        <div onClick={(e) => { e.stopPropagation(); onEdit(); }} className={`px-3 py-2 text-xs border-t cursor-pointer flex items-center gap-2 transition-colors ${darkMode ? 'border-[#3e3f4b] hover:bg-[#1c213e] text-blue-400' : 'border-gray-100 hover:bg-gray-50 text-blue-600'}`}><Edit2 size={12} /> Edit Labels</div>
    </div>
);

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
        const nextStart = datePickerOpen.start ?? null;
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
        updateTaskDate(projectId, taskId, subitemId, nextStart, nextDuration);
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
        const d = new Date(TODAY);
        d.setDate(TODAY.getDate() + dayIndex);
        return toLocalDateKey(d);
    };

    const handleStartInputChange = (value) => {
        if (!value) return handleClear();
        const dt = fromLocalDateKey(value);
        if (!dt) return;
        const relIdx = getRelativeFromDate(dt);
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
        const dt = fromLocalDateKey(value);
        if (!dt) return;
        const relIdx = getRelativeFromDate(dt);
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
            ? getFutureDate(displayStart)
            : `${getFutureDate(displayStart)} – ${getFutureDate(displayEnd)}`;

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
    const { visibleProjects, collapsedGroups, toggleGroupCollapse, updateGroupName, statuses, darkMode, addTaskToGroup, addGroup, reorderDrag } = props;
    return (
        <div className={`flex-1 overflow-auto pb-40 ${darkMode ? 'bg-[#181b34]' : 'bg-[#f5f6f8]'}`}>
            {visibleProjects.map(proj => {
                const defaultGroups = proj.groups || [{ id: 'default', name: 'Main Group', color: '#579bfc' }];
                return (
                    <div key={proj.id} className="mb-10 px-8 mt-8">
                         {defaultGroups.map(group => {
                             const groupTasks = proj.tasks.filter(t => t.groupId === group.id || (!t.groupId && group.id === 'default'));
                             const isGroupCollapsed = collapsedGroups.includes(group.id);
                             return (
                                 <div key={group.id} className="mb-8">
                                     <div
                                         className={`flex items-center gap-2 mb-2 group rounded-md px-1 ${reorderDrag.active && reorderDrag.dropTargetType === 'group' && reorderDrag.dropTargetId === group.id && reorderDrag.dropTargetProjectId === proj.id ? (darkMode ? 'bg-blue-500/10' : 'bg-blue-50') : ''}`}
                                         onDragOver={(e) => props.handleGroupDragOver(e, proj.id, group.id)}
                                         onDrop={(e) => props.handleGroupDrop(e, proj.id, group.id)}
                                     >
                                         <div onClick={() => toggleGroupCollapse(group.id)} className={`p-1 rounded cursor-pointer transition ${isGroupCollapsed ? '-rotate-90' : 'rotate-0'} ${darkMode ? 'hover:bg-[#2b2c32]' : 'hover:bg-gray-100'}`}><ChevronDown size={18} style={{ color: group.color }} /></div>
                                         <EditableText value={group.name} onChange={(e) => updateGroupName(proj.id, group.id, e.target.value)} className="text-lg font-medium" style={{ color: group.color }} />
                                         <span className="text-xs text-gray-500 font-normal ml-2">{groupTasks.length} Items</span>
                                     </div>
                                     {!isGroupCollapsed ? (
                                         <div className={`shadow-sm border-l-4 rounded-tl-md rounded-bl-md overflow-visible ${darkMode ? 'border-[#2b2c32]' : 'border-gray-200'}`} style={{ borderLeftColor: group.color }}>
                                             <GroupHeaderRow darkMode={darkMode} />
                                             {groupTasks.map((task) => {
                                                 const isExpanded = props.expandedItems.includes(task.id);
                                                 return (
                                                     <React.Fragment key={task.id}>
                                                         <TaskRow task={task} projectId={proj.id} isSubitem={false} isDragging={props.reorderDrag.active && props.reorderDrag.dragId === task.id} onDragStart={props.handleRowDragStart} onDragOver={(e) => props.handleRowDragOver(e, 'task', task.id)} onDrop={props.handleRowDrop} onDragEnd={props.handleRowDragEnd} isSelected={props.selectedItems.has(task.id)} onToggle={props.toggleSelection} onAddSubitem={props.handleAddSubitem} {...props} />
                                                         {isExpanded && task.subitems.map((sub) => (
                                                             <TaskRow key={sub.id} task={sub} projectId={proj.id} parentId={task.id} isSubitem={true} isDragging={props.reorderDrag.active && props.reorderDrag.dragId === sub.id} onDragStart={props.handleRowDragStart} onDragOver={(e) => props.handleRowDragOver(e, 'subitem', sub.id)} onDrop={props.handleRowDrop} onDragEnd={props.handleRowDragEnd} isSelected={props.selectedItems.has(sub.id)} onToggle={props.toggleSelection} {...props} />
                                                         ))}
                                                     </React.Fragment>
                                                 );
                                             })}
                                             <div className={`flex h-10 items-center border-b ${darkMode ? 'border-[#2b2c32] hover:bg-[#202336] bg-[#181b34]' : 'border-[#eceff8] hover:bg-[#f5f6f8] bg-white'}`}>
                                                 <div className={`w-10 border-r h-full ${darkMode ? 'border-[#2b2c32]' : 'border-[#eceff8]'}`}></div>
                                                 <div className="w-[450px] px-4 flex items-center"><input type="text" placeholder="+ Add Item" className={`w-full bg-transparent outline-none text-sm ${darkMode ? 'text-gray-400 placeholder-gray-600' : 'text-gray-500 placeholder-gray-400'}`} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addTaskToGroup(proj.id, group.id, e.target.value); e.target.value = ''; }}} /></div>
                                             </div>
                                         </div>
                                      ) : (
                                          <div className="h-10 flex items-center rounded-md overflow-hidden relative pl-4" style={{ backgroundColor: darkMode ? '#2b2c32' : '#f0f0f0' }}><div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: group.color }}></div><div className="flex-1 flex h-full">{statuses.map(s => { const count = groupTasks.filter(t => t.status === s.id).length; if (count === 0) return null; const pct = (count / groupTasks.length) * 100; return <div key={s.id} style={{ width: `${pct}%`, backgroundColor: s.color }} title={`${s.label}: ${count}`} className="h-full first:rounded-l-none" />; })}</div><div className={`w-32 flex items-center justify-center text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{groupTasks.length} Items</div></div>
                                       )}
                                  </div>
                             );
                         })}
                         <button onClick={() => addGroup(proj.id)} className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded border transition-colors ${darkMode ? 'border-[#2b2c32] hover:bg-[#2b2c32] text-gray-300' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}><Plus size={16} /> Add New Group</button>
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

  const [activeEntityId, setActiveEntityId] = useState(INITIAL_WORKSPACES[0].id); 
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatHistory, setChatHistory] = useState([{ role: 'ai', text: "Workspace ready." }]);
  const [inputText, setInputText] = useState('');
  const [zoomLevel, setZoomLevel] = useState(30); 
  const [rowHeight, setRowHeight] = useState(40); 
  const [statusMenuOpen, setStatusMenuOpen] = useState(null); 
  const [statusMenuType, setStatusMenuType] = useState('status'); 
  const [statusEditorOpen, setStatusEditorOpen] = useState(false); 
  const [jobTypeEditorOpen, setJobTypeEditorOpen] = useState(false); 
  const [datePickerOpen, setDatePickerOpen] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState([]);
  const [expandedItems, setExpandedItems] = useState(['t1']); 
  const [reorderDrag, setReorderDrag] = useState({ active: false, type: null, dragId: null, parentId: null, dropTargetId: null, dropTargetType: null, dropTargetProjectId: null, dropPosition: 'before', originalExpanded: false });
  const reorderDragRef = useRef(reorderDrag);
  const [dragState, setDragState] = useState({ isDragging: false, type: null, taskId: null, subitemId: null, projectId: null, startX: 0, originalStart: 0, originalDuration: 0, currentSpan: 0, currentVisualSlot: 0, hasMoved: false, isDeleteMode: false, origin: null });
  const bodyRef = useRef(null);

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
    addGroup, updateProjectName, updateGroupName, updateTaskName, updateSubitemName, 
    addTaskToGroup, addSubitem, updateTaskDate, changeStatus, changeJobType, deleteSelection
  } = useProjectData();

  const activeEntity = useMemo(() => {
      const allEntities = [...workspaces, ...dashboards];
      const found = allEntities.find(e => e.id === activeEntityId);
      return found || workspaces[0] || { id: 'fallback', name: 'Fallback Workspace', type: 'workspace' };
  }, [workspaces, dashboards, activeEntityId]);

  const visibleProjects = useMemo(() => {
    if (!activeEntity) return [];
    if (activeEntity.type === 'workspace') return projects.filter(p => p.workspaceId === activeEntity.id);
    return projects.filter(p => activeEntity.includedWorkspaces && activeEntity.includedWorkspaces.includes(p.workspaceId));
  }, [projects, activeEntity]);

  // --- LOCAL ACTIONS ---
  const createWorkspace = () => { const newId = `w${Date.now()}`; setWorkspaces(prev => [...prev, { id: newId, name: 'New Workspace', type: 'workspace' }]); setActiveEntityId(newId); };
  const createDashboard = () => { const newId = `d${Date.now()}`; setDashboards(prev => [...prev, { id: newId, name: 'New Dashboard', type: 'dashboard', includedWorkspaces: [] }]); setActiveEntityId(newId); };
  
  const toggleSelection = (id) => { const newSet = new Set(selectedItems); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); setSelectedItems(newSet); };
  const deleteSelected = () => { deleteSelection(selectedItems); setSelectedItems(new Set()); };
  const toggleGroupCollapse = (gid) => setCollapsedGroups(prev => prev.includes(gid) ? prev.filter(id => id !== gid) : [...prev, gid]);
  const toggleItemExpand = (tid) => setExpandedItems(prev => prev.includes(tid) ? prev.filter(id => id !== tid) : [...prev, tid]);

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
      if (activeTab === 'gantt') {
          scrollToToday(false);
      }
  }, [activeTab, zoomLevel]); 

  useEffect(() => {
      if (!auth) return;
      const unsub = onAuthStateChanged(auth, (u) => setAuthUser(u));
      return () => unsub();
  }, []);

  // --- DRAG HANDLERS (ROWS) ---
  const handleRowDragStart = (e, type, id) => { 
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
  const handleRowDrop = (e, targetType, targetId) => {
    e.preventDefault();
    const currentDrag = reorderDragRef.current;
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
    e.preventDefault();
    const currentDrag = reorderDragRef.current;
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
      dropPosition: 'before',
      originalExpanded: false
    };
    reorderDragRef.current = next;
    setReorderDrag(next);
  };

  // --- DRAG HANDLERS (GANTT BARS) ---
  const handleMouseDown = (e, task, projectId, type, subitemId = null, origin = 'parent') => {
    e.stopPropagation(); if (e.target.tagName === 'INPUT') return; 
    let startDayIndex = 0;
    if (type === 'create') {
        if (subitemId ? task.subitems?.find(s => s.id === subitemId)?.start : task.start) return; 
        const clickX = e.nativeEvent.offsetX; const visualIndex = Math.floor(clickX / zoomLevel); startDayIndex = visualIndexToDayIndex[visualIndex] || 0;
    }
    setDragState({ isDragging: true, type, taskId: task.id, subitemId, projectId, startX: e.clientX, originalStart: type === 'create' ? startDayIndex : (subitemId ? task.subitems.find(s=>s.id===subitemId).start : task.start), originalDuration: type === 'create' ? 1 : (subitemId ? task.subitems.find(s=>s.id===subitemId).duration : task.duration), currentSpan: 1, hasMoved: false, isDeleteMode: false, origin, currentVisualSlot: 0 });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragState.isDragging) return;
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
                             if (newStart !== undefined) return { ...sub, start: newStart, duration: calculateCalendarDuration(newStart, origVisEnd - origVisStart, rawDays, showWeekends) };
                         } else if (dragState.type === 'resize-right') {
                             const newVisEnd = Math.max(origVisStart + 1, origVisEnd + deltaVisualSlots);
                             return { ...sub, duration: calculateCalendarDuration(dragState.originalStart, newVisEnd - origVisStart, rawDays, showWeekends) };
                         } else if (dragState.type === 'resize-left') {
                             const newVisStart = Math.min(Math.max(0, origVisStart + deltaVisualSlots), origVisEnd - 1);
                             const newStart = visualIndexToDayIndex[newVisStart];
                             const endDay = dragState.originalStart + dragState.originalDuration;
                             return { ...sub, start: newStart, duration: Math.max(1, endDay - newStart) };
                         }
                         return sub;
                     })};
                 }
                 return task;
             }
             if (task.id !== dragState.taskId) return task;
             if (dragState.type === 'move') {
                 const newStart = visualIndexToDayIndex[Math.max(0, origVisStart + deltaVisualSlots)];
                 if (newStart !== undefined) return { ...task, start: newStart, duration: calculateCalendarDuration(newStart, origVisEnd - origVisStart, rawDays, showWeekends) };
             } else if (dragState.type === 'resize-right') {
                 const newVisEnd = Math.max(origVisStart + 1, origVisEnd + deltaVisualSlots);
                 return { ...task, duration: calculateCalendarDuration(dragState.originalStart, newVisEnd - origVisStart, rawDays, showWeekends) };
             } else if (dragState.type === 'resize-left') {
                 const newVisStart = Math.min(Math.max(0, origVisStart + deltaVisualSlots), origVisEnd - 1);
                 const newStart = visualIndexToDayIndex[newVisStart];
                 const endDay = dragState.originalStart + dragState.originalDuration;
                 return { ...task, start: newStart, duration: Math.max(1, endDay - newStart) };
             }
             return task;
          })
        };
      }));
    };
    const handleMouseUp = () => {
      if (dragState.isDragging) {
        if (dragState.isDeleteMode) { updateTaskDate(dragState.projectId, dragState.taskId, dragState.subitemId, null, null); }
        else if (dragState.type === 'create') { updateTaskDate(dragState.projectId, dragState.taskId, dragState.subitemId, dragState.originalStart, calculateCalendarDuration(dragState.originalStart, dragState.currentSpan, rawDays, showWeekends)); }
        setDragState(prev => ({ ...prev, isDragging: false, type: null, isDeleteMode: false }));
      }
    };
    if (dragState.isDragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [dragState, zoomLevel, dayToVisualIndex, visualIndexToDayIndex, showWeekends, rawDays]);

  // --- EXPORT/IMPORT HANDLERS ---
  const exportData = () => {
    const headers = ["Project", "Group", "Task Name", "Type", "Status", "Job Type", "Assignee", "Start Date", "Duration (Days)"];
    const csvRows = [headers.join(",")];
    projects.forEach(project => {
      const groups = project.groups || [];
      groups.forEach(group => {
        const tasks = project.tasks.filter(t => t.groupId === group.id || (!t.groupId && group.id === 'default'));
        tasks.forEach(task => {
          const statusLabel = statuses.find(s => s.id === task.status)?.label || task.status;
          const jobTypeLabel = jobTypes.find(j => j.id === task.jobTypeId)?.label || task.jobTypeId;
          const startDate = task.start !== null ? getFutureDate(task.start) : "TBD";
          const clean = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
          csvRows.push([clean(project.name), clean(group.name), clean(task.name), "Task", clean(statusLabel), clean(jobTypeLabel), clean(task.assignee), clean(startDate), task.duration || 0].join(","));
          if (task.subitems && task.subitems.length > 0) {
            task.subitems.forEach(sub => {
               const subStatus = statuses.find(s => s.id === sub.status)?.label || sub.status;
               const subJob = jobTypes.find(j => j.id === sub.jobTypeId)?.label || sub.jobTypeId;
               const subStart = sub.start !== null ? getFutureDate(sub.start) : "TBD";
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


  return (
    <div className={`flex h-screen font-sans overflow-hidden select-none transition-colors duration-300 ${darkMode ? 'bg-[#181b34] text-gray-100' : 'bg-[#eceff8] text-[#323338]'}`} onClick={() => { setStatusMenuOpen(null); setSettingsMenuOpen(false); setDatePickerOpen(null); }}>
        <Sidebar darkMode={darkMode} workspaces={workspaces} dashboards={dashboards} activeEntityId={activeEntityId} setActiveEntityId={setActiveEntityId} createWorkspace={createWorkspace} createDashboard={createDashboard} setDarkMode={setDarkMode} />
        
        <div className={`flex-1 flex flex-col min-w-0 relative ${darkMode ? 'bg-[#181b34]' : 'bg-white'}`}>
            <AppHeader 
                activeEntity={activeEntity} activeTab={activeTab} setActiveTab={setActiveTab} darkMode={darkMode}
                setSettingsMenuOpen={setSettingsMenuOpen} settingsMenuOpen={settingsMenuOpen}
                showWeekends={showWeekends} setShowWeekends={setShowWeekends} showLabels={showLabels} setShowLabels={setShowLabels}
                colorBy={colorBy} setColorBy={setColorBy} zoomLevel={zoomLevel} handleZoomChange={(e) => setZoomLevel(Number(e.target.value))}
                rowHeight={rowHeight} setRowHeight={setRowHeight} isChatOpen={isChatOpen} setIsChatOpen={setIsChatOpen}
                scrollToToday={scrollToToday} updateEntityName={(v) => { if(activeEntity.type==='workspace') setWorkspaces(p=>p.map(w=>w.id===activeEntity.id?{...w,name:v}:w)); else setDashboards(p=>p.map(d=>d.id===activeEntity.id?{...d,name:v}:d)); }}
                onExport={exportData} onExportJson={exportJson} onImportJson={importJson}
                authUser={authUser} onOpenAuth={() => setAuthModalOpen(true)}
            />

            <div className={`flex-1 overflow-hidden flex flex-col relative ${darkMode ? 'bg-[#181b34]' : 'bg-white'}`}>
                {activeTab === 'board' ? (
                    <BoardView 
                        activeTab={activeTab} 
                        visibleProjects={visibleProjects} collapsedGroups={collapsedGroups} toggleGroupCollapse={toggleGroupCollapse}
                        updateGroupName={updateGroupName} statuses={statuses} jobTypes={jobTypes} darkMode={darkMode}
                        addTaskToGroup={addTaskToGroup} addGroup={addGroup} expandedItems={expandedItems} toggleItemExpand={toggleItemExpand}
                        updateTaskName={updateTaskName} updateSubitemName={updateSubitemName} handleAddSubitem={addSubitem}
                        handleRowDragStart={handleRowDragStart} handleRowDragOver={handleRowDragOver} handleRowDrop={handleRowDrop} handleRowDragEnd={handleRowDragEnd}
                        handleGroupDragOver={handleGroupDragOver} handleGroupDrop={handleGroupDrop}
                        reorderDrag={reorderDrag} selectedItems={selectedItems} toggleSelection={toggleSelection}
                        setStatusMenuOpen={setStatusMenuOpen} setStatusMenuType={setStatusMenuType} setDatePickerOpen={setDatePickerOpen}
                        statusMenuOpen={statusMenuOpen} statusMenuType={statusMenuType} 
                        onStatusSelect={changeStatus} onTypeSelect={changeJobType} onEditLabels={() => setStatusEditorOpen(true)}
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
                        handleAddSubitem={addSubitem} updateTaskName={updateTaskName} addTaskToGroup={addTaskToGroup}
                        expandedItems={expandedItems} toggleItemExpand={toggleItemExpand} updateSubitemName={updateSubitemName}
                        setStatusMenuOpen={setStatusMenuOpen} setStatusMenuType={setStatusMenuType} setDatePickerOpen={setDatePickerOpen}
                        onStatusSelect={changeStatus} onTypeSelect={changeJobType} onEditLabels={() => setStatusEditorOpen(true)}
                        bodyRef={bodyRef}
                    />
                )}
            </div>

            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] shadow-2xl border rounded-xl px-4 py-2 flex items-center gap-3 transition-all duration-300 ease-in-out ${selectedItems.size > 0 ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'} ${darkMode ? 'bg-[#111322] border-[#2b2c32]' : 'bg-white border-gray-200'}`}>
                <span className={`text-xs font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{selectedItems.size} selected</span>
                <button onClick={deleteSelected} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"><Trash2 size={14} /> Delete</button>
            </div>
            
            <DatePicker datePickerOpen={datePickerOpen} setDatePickerOpen={setDatePickerOpen} darkMode={darkMode} updateTaskDate={updateTaskDate} />
            <LabelEditorModal isOpen={statusEditorOpen} onClose={() => setStatusEditorOpen(false)} items={statuses} onSave={setStatuses} title="Edit Status Labels" darkMode={darkMode} />
            <LabelEditorModal isOpen={jobTypeEditorOpen} onClose={() => setJobTypeEditorOpen(false)} items={jobTypes} onSave={setJobTypes} title="Edit Type Labels" darkMode={darkMode} />
            <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} auth={auth} user={authUser} darkMode={darkMode} />
        </div>
    </div>
  );
}
 
