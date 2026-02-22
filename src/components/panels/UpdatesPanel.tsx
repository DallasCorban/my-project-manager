// UpdatesPanel — professional slide-over panel for task updates and files.
// Rich-text composer (contenteditable) with formatting toolbar, inspired by Monday.com.

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  MessageSquare,
  FileText,
  Paperclip,
  Plus,
  Check,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link2,
  List,
  CheckSquare,
  Palette,
  Type,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Download,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { Update, Reply, ChecklistItem } from '../../types/item';
import type { ProjectFile } from '../../types/file';
import type { MemberPermissions } from '../../types/member';

// ── Types ─────────────────────────────────────────────────────────────

interface UpdatesPanelProps {
  taskName: string;
  parentName?: string;
  isSubitem?: boolean;
  updates: Update[];
  files: ProjectFile[];
  permissions: MemberPermissions;
  onClose: () => void;
  onAddUpdate: (payload: { text: string; checklist: ChecklistItem[] }) => void;
  onAddReply: (updateId: string, text: string) => void;
  onToggleChecklistItem: (updateId: string, itemId: string) => void;
  onUploadFile?: (file: File, onProgress: (pct: number) => void) => Promise<void>;
}

interface UploadTask {
  id: string;
  name: string;
  previewUrl: string | null;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

// ── Constants ─────────────────────────────────────────────────────────

const TEXT_COLORS = [
  '#e03131', '#e8590c', '#f59f00', '#2f9e44',
  '#1971c2', '#7048e8', '#c2255c', '#000000',
  '#495057', '#adb5bd',
];

const FONT_SIZES = [
  { label: 'Small',   value: '2' },
  { label: 'Normal',  value: '3' },
  { label: 'Large',   value: '5' },
  { label: 'Heading', value: '6' },
];

// Detect whether a string contains HTML markup
const isHTML = (s: string) => /<[a-zA-Z][\s\S]*?>/.test(s);

// Format a date value as "Today 2:30 PM", "Yesterday 9:15 AM", or "Mar 5 2:30 PM"
function formatDateTime(val: string | unknown | undefined): string {
  if (!val) return '';
  const d = new Date(val as string);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time;
}

// ── Main Component ────────────────────────────────────────────────────

export function UpdatesPanel({
  taskName,
  parentName,
  isSubitem = false,
  updates,
  files,
  permissions,
  onClose,
  onAddUpdate,
  onAddReply,
  onToggleChecklistItem,
  onUploadFile,
}: UpdatesPanelProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const [activeTab, setActiveTab] = useState<'updates' | 'files'>('updates');

  // ── Editor state ──────────────────────────────────────────────────
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [fmtState, setFmtState] = useState({
    bold: false, italic: false, underline: false, strikeThrough: false,
  });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // ── Checklist state ───────────────────────────────────────────────
  const [showChecklist, setShowChecklist] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);

  // ── Reply state ───────────────────────────────────────────────────
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // ── Upload state ──────────────────────────────────────────────────
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = permissions.canEdit;

  // Sync toolbar active-state on every selection change
  const updateFmtState = useCallback(() => {
    setFmtState({
      bold:          document.queryCommandState('bold'),
      italic:        document.queryCommandState('italic'),
      underline:     document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateFmtState);
    return () => document.removeEventListener('selectionchange', updateFmtState);
  }, [updateFmtState]);

  // Close colour/size pickers when clicking elsewhere
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-picker]')) {
        setShowColorPicker(false);
        setShowSizePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Formatting helpers ────────────────────────────────────────────

  // NOTE: execCommand is deprecated but universally supported and sufficient
  // for a basic rich-text composer. Could be replaced with a proper editor
  // library (Tiptap, Quill) if more advanced features are needed.
  const exec = useCallback((cmd: string, value?: string) => {
    document.execCommand(cmd, false, value ?? undefined);
    editorRef.current?.focus();
  }, []);

  const tbCls = (active: boolean) =>
    `p-1.5 rounded transition-colors ${
      active
        ? darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'
        : darkMode ? 'text-gray-400 hover:bg-white/10 hover:text-gray-200'
                   : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
    }`;

  const divider = (
    <span className={`w-px h-4 mx-0.5 shrink-0 ${darkMode ? 'bg-[#1e2340]' : 'bg-indigo-100'}`} />
  );

  // ── Editor handlers ───────────────────────────────────────────────

  const handleEditorInput = () => {
    const el = editorRef.current;
    if (!el) return;
    setIsEmpty(el.innerHTML === '' || el.innerHTML === '<br>');
  };

  const handleLinkClick = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
    setShowLinkInput(true);
    setLinkUrl('');
    setTimeout(() => linkInputRef.current?.focus(), 30);
  };

  const handleLinkConfirm = () => {
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current); }
    }
    if (linkUrl.trim()) {
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      exec('createLink', url);
    }
    setShowLinkInput(false);
    setLinkUrl('');
    savedRangeRef.current = null;
  };

  const handleToggleChecklist = () => {
    if (!showChecklist) {
      setShowChecklist(true);
      if (checklistItems.length === 0) {
        setChecklistItems([{ id: `c${Date.now()}`, text: '', done: false }]);
      }
    } else {
      setShowChecklist(false);
    }
  };

  const addChecklistItem = () => {
    setChecklistItems((prev) => [...prev, { id: `c${Date.now()}`, text: '', done: false }]);
  };

  // ── Submit ────────────────────────────────────────────────────────

  const handleSubmit = () => {
    const el = editorRef.current;
    const html = el?.innerHTML ?? '';
    const text = el?.innerText?.trim() ?? '';
    const validChecklist = checklistItems.filter((i) => i.text.trim());
    if (!text && validChecklist.length === 0) return;

    onAddUpdate({ text: html, checklist: showChecklist ? validChecklist : [] });

    if (el) el.innerHTML = '';
    setIsEmpty(true);
    setShowChecklist(false);
    setChecklistItems([]);
  };

  const handleSubmitReply = (updateId: string) => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onAddReply(updateId, trimmed);
    setReplyText('');
    setReplyingTo(null);
  };

  // ── File upload ───────────────────────────────────────────────────

  const handleFileSelect = () => fileInputRef.current?.click();

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selected = Array.from(e.target.files);
    e.target.value = '';
    setActiveTab('files');

    selected.forEach((file) => {
      const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      setUploadTasks((prev) => [...prev, { id, name: file.name, previewUrl, progress: 0, status: 'uploading' }]);

      onUploadFile?.(file, (pct) => {
        setUploadTasks((prev) => prev.map((t) => (t.id === id ? { ...t, progress: pct } : t)));
      })
        .then(() => {
          setUploadTasks((prev) => prev.map((t) => (t.id === id ? { ...t, progress: 100, status: 'done' } : t)));
          setTimeout(() => {
            setUploadTasks((prev) => prev.filter((t) => t.id !== id));
            if (previewUrl) URL.revokeObjectURL(previewUrl);
          }, 2500);
        })
        .catch((err: unknown) => {
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.id === id
                ? { ...t, status: 'error', errorMsg: err instanceof Error ? err.message : 'Upload failed' }
                : t,
            ),
          );
        });
    });
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className={`h-full w-full flex flex-col ${darkMode ? 'bg-[#111322] text-gray-200' : 'bg-[#f7f7f9] text-gray-800'}`}>

      {/* ── Header ── */}
      <div className={`flex items-start gap-3 px-4 py-3.5 border-b shrink-0 ${darkMode ? 'border-[#323652]' : 'border-[#bec3d4]'}`}>
        <div className="flex-1 min-w-0">
          {isSubitem && parentName && (
            <p className={`text-[10px] mb-0.5 truncate font-medium ${darkMode ? 'text-blue-400/70' : 'text-blue-500/70'}`}>
              {parentName}
            </p>
          )}
          <h3 className="text-sm font-semibold leading-snug">{taskName}</h3>
        </div>
        <button
          onClick={onClose}
          className={`shrink-0 p-1.5 rounded-lg transition-colors mt-0.5 ${darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-400'}`}
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className={`flex border-b shrink-0 ${darkMode ? 'border-[#323652]' : 'border-[#bec3d4]'}`}>
        {(['updates', 'files'] as const).map((tab) => {
          const count = tab === 'updates' ? updates.length : files.length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-400'
                  : `border-transparent ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`
              }`}
            >
              {tab === 'updates' ? <MessageSquare size={13} /> : <FileText size={13} />}
              <span className="capitalize">{tab}</span>
              {count > 0 && (
                <span className={`px-1.5 py-px rounded-full text-[10px] ${
                  activeTab === tab
                    ? 'bg-blue-500/20 text-blue-400'
                    : darkMode ? 'bg-white/8 text-gray-500' : 'bg-gray-100 text-gray-500'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Read-only notice ── */}
      {!canEdit && (
        <div className={`px-4 py-2 text-xs shrink-0 ${darkMode ? 'bg-amber-500/10 text-amber-400 border-b border-[#323652]' : 'bg-amber-50 text-amber-600 border-b border-[#bec3d4]'}`}>
          Read-only — you can view but not post updates.
        </div>
      )}

      {/* ── Updates tab ── */}
      {activeTab === 'updates' && (
        <>
          {/* Composer — fixed above the feed */}
          {canEdit && (
            <div className={`shrink-0 border-b ${darkMode ? 'border-[#323652] bg-[#0d0f23]' : 'border-[#bec3d4] bg-[#f2f4fb]'}`}>

              {/* Formatting toolbar */}
              <div className={`flex items-center flex-wrap gap-0.5 px-3 py-2 border-b ${darkMode ? 'border-[#323652]' : 'border-[#bec3d4]/80'}`}>
                <button onMouseDown={(e) => { e.preventDefault(); exec('bold'); }} className={tbCls(fmtState.bold)} title="Bold (Ctrl+B)"><Bold size={13} /></button>
                <button onMouseDown={(e) => { e.preventDefault(); exec('italic'); }} className={tbCls(fmtState.italic)} title="Italic (Ctrl+I)"><Italic size={13} /></button>
                <button onMouseDown={(e) => { e.preventDefault(); exec('underline'); }} className={tbCls(fmtState.underline)} title="Underline (Ctrl+U)"><Underline size={13} /></button>
                <button onMouseDown={(e) => { e.preventDefault(); exec('strikeThrough'); }} className={tbCls(fmtState.strikeThrough)} title="Strikethrough"><Strikethrough size={13} /></button>

                {divider}

                {/* Text colour */}
                <div className="relative" data-picker>
                  <button onMouseDown={(e) => { e.preventDefault(); setShowSizePicker(false); setShowColorPicker((v) => !v); }} className={tbCls(showColorPicker)} title="Text colour">
                    <Palette size={13} />
                  </button>
                  {showColorPicker && (
                    <div data-picker className={`absolute top-full left-0 mt-1 p-2 rounded-xl shadow-2xl border z-50 ${darkMode ? 'bg-[#0b0d1c] border-[#323652]' : 'bg-white border-gray-300'}`}>
                      <div className="grid grid-cols-5 gap-1.5 mb-1.5">
                        {TEXT_COLORS.map((c) => (
                          <button
                            key={c}
                            onMouseDown={(e) => { e.preventDefault(); exec('foreColor', c); setShowColorPicker(false); }}
                            className="w-5 h-5 rounded-full ring-1 ring-black/10 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                      <button onMouseDown={(e) => { e.preventDefault(); exec('removeFormat'); setShowColorPicker(false); }} className={`w-full text-[10px] py-0.5 rounded ${darkMode ? 'text-gray-500 hover:bg-white/10' : 'text-gray-400 hover:bg-gray-100'}`}>
                        Reset
                      </button>
                    </div>
                  )}
                </div>

                {/* Font size */}
                <div className="relative" data-picker>
                  <button onMouseDown={(e) => { e.preventDefault(); setShowColorPicker(false); setShowSizePicker((v) => !v); }} className={tbCls(showSizePicker)} title="Text size">
                    <Type size={13} />
                  </button>
                  {showSizePicker && (
                    <div data-picker className={`absolute top-full left-0 mt-1 rounded-xl shadow-2xl border z-50 overflow-hidden min-w-[100px] ${darkMode ? 'bg-[#0b0d1c] border-[#323652]' : 'bg-white border-gray-300'}`}>
                      {FONT_SIZES.map((s) => (
                        <button
                          key={s.value}
                          onMouseDown={(e) => { e.preventDefault(); exec('fontSize', s.value); setShowSizePicker(false); }}
                          className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${darkMode ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-gray-50 text-gray-700'}`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {divider}

                <button onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }} className={tbCls(false)} title="Bullet list"><List size={13} /></button>

                {/* Link */}
                <button onMouseDown={(e) => { e.preventDefault(); handleLinkClick(); }} className={tbCls(showLinkInput)} title="Insert link"><Link2 size={13} /></button>

                {divider}

                {/* Checklist toggle */}
                <button onMouseDown={(e) => { e.preventDefault(); handleToggleChecklist(); }} className={tbCls(showChecklist)} title="Checklist">
                  <CheckSquare size={13} />
                </button>
              </div>

              {/* Link URL input bar */}
              {showLinkInput && (
                <div className={`flex items-center gap-2 px-3 py-2 border-b ${darkMode ? 'border-[#323652]' : 'border-[#bec3d4]/80'}`}>
                  <Link2 size={12} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
                  <input
                    ref={linkInputRef}
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleLinkConfirm();
                      if (e.key === 'Escape') { setShowLinkInput(false); setLinkUrl(''); }
                    }}
                    placeholder="https://..."
                    className={`flex-1 text-xs bg-transparent outline-none ${darkMode ? 'text-gray-200 placeholder-gray-600' : 'text-gray-700 placeholder-gray-400'}`}
                  />
                  <button onClick={handleLinkConfirm} className="text-xs text-blue-500 hover:text-blue-400 font-medium">Apply</button>
                  <button onClick={() => { setShowLinkInput(false); setLinkUrl(''); }} className={darkMode ? 'text-gray-600 hover:text-gray-400' : 'text-gray-300 hover:text-gray-500'}>
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Contenteditable text area — grows with content, capped at ~180 px */}
              <div className="relative">
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  onKeyUp={updateFmtState}
                  onMouseUp={updateFmtState}
                  className={`min-h-[88px] max-h-[180px] overflow-y-auto outline-none px-4 py-3 text-sm leading-relaxed
                    [&_a]:text-blue-400 [&_a]:underline
                    [&_ul]:list-disc [&_ul]:ml-5
                    [&_h2]:text-base [&_h2]:font-bold [&_h2]:mb-1
                    [&_h3]:text-sm [&_h3]:font-semibold`}
                />
                {isEmpty && (
                  <div className={`absolute top-0 left-0 px-4 py-3 text-sm pointer-events-none select-none ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    Write an update…
                  </div>
                )}
              </div>

              {/* Inline checklist */}
              {showChecklist && (
                <div className={`px-4 py-2.5 border-t ${darkMode ? 'border-[#323652]' : 'border-[#bec3d4]/80'}`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Checklist
                  </p>
                  <div className="space-y-1.5">
                    {checklistItems.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-2 group">
                        <div className={`w-3.5 h-3.5 rounded border shrink-0 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`} />
                        <input
                          value={item.text}
                          onChange={(e) =>
                            setChecklistItems((prev) =>
                              prev.map((ci, i) => (i === idx ? { ...ci, text: e.target.value } : ci)),
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); }
                            if (e.key === 'Backspace' && !item.text && checklistItems.length > 1) {
                              e.preventDefault();
                              setChecklistItems((prev) => prev.filter((_, i) => i !== idx));
                            }
                          }}
                          placeholder={`Item ${idx + 1}`}
                          autoFocus={idx === checklistItems.length - 1}
                          className={`flex-1 bg-transparent outline-none text-sm ${darkMode ? 'placeholder-gray-700 text-gray-200' : 'placeholder-gray-400 text-gray-700'}`}
                        />
                        <button
                          onClick={() => setChecklistItems((prev) => prev.filter((_, i) => i !== idx))}
                          className={`opacity-0 group-hover:opacity-100 transition-opacity ${darkMode ? 'text-gray-600 hover:text-gray-400' : 'text-gray-300 hover:text-gray-500'}`}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addChecklistItem}
                    className={`flex items-center gap-1 mt-2 text-xs ${darkMode ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <Plus size={12} /> Add item
                  </button>
                </div>
              )}

              {/* Composer bottom bar */}
              <div className={`flex items-center gap-1 px-3 py-2 border-t ${darkMode ? 'border-[#323652]' : 'border-[#bec3d4]/80'}`}>
                {onUploadFile && (
                  <button
                    onClick={handleFileSelect}
                    title="Attach file"
                    className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-gray-500 hover:bg-white/10 hover:text-gray-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                  >
                    <Paperclip size={15} />
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={handleSubmit}
                  disabled={isEmpty && checklistItems.filter((i) => i.text.trim()).length === 0}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    !isEmpty || checklistItems.some((i) => i.text.trim())
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : darkMode ? 'bg-white/5 text-gray-600 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Update
                </button>
              </div>
            </div>
          )}

          {/* Updates feed */}
          <div className="flex-1 overflow-y-auto">
            {updates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3">
                <MessageSquare size={28} className={darkMode ? 'text-gray-700' : 'text-gray-300'} />
                <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>No updates yet</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {updates.map((update) => (
                  <UpdateCard
                    key={update.id}
                    update={update}
                    darkMode={darkMode}
                    canEdit={canEdit}
                    replyingTo={replyingTo}
                    replyText={replyText}
                    onSetReplyingTo={setReplyingTo}
                    onSetReplyText={setReplyText}
                    onSubmitReply={handleSubmitReply}
                    onToggleChecklistItem={onToggleChecklistItem}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Files tab ── */}
      {activeTab === 'files' && (
        <div className="flex-1 overflow-y-auto">
          <FilesList
            files={files}
            canUpload={permissions.canUpload}
            darkMode={darkMode}
            onAddFiles={handleFileSelect}
            uploadTasks={uploadTasks}
            onDismissError={(id) => setUploadTasks((prev) => prev.filter((t) => t.id !== id))}
          />
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} />
    </div>
  );
}

// ── UpdateCard ────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#3b5bdb', '#7048e8', '#0ca678', '#e03131', '#e8590c', '#1971c2', '#c2255c'];

function avatarColor(name: string) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function UpdateCard({
  update,
  darkMode,
  canEdit,
  replyingTo,
  replyText,
  onSetReplyingTo,
  onSetReplyText,
  onSubmitReply,
  onToggleChecklistItem,
}: {
  update: Update;
  darkMode: boolean;
  canEdit: boolean;
  replyingTo: string | null;
  replyText: string;
  onSetReplyingTo: (id: string | null) => void;
  onSetReplyText: (t: string) => void;
  onSubmitReply: (id: string) => void;
  onToggleChecklistItem: (uid: string, iid: string) => void;
}) {
  const initials = (update.author ?? 'U').slice(0, 2).toUpperCase();
  const bg = avatarColor(update.author ?? '');
  const dateStr = formatDateTime(update.createdAt);

  return (
    <div className={`rounded-xl border ${darkMode ? 'bg-[#161a32] border-[#323652]' : 'bg-white border-gray-100 shadow-sm'}`}>
      {/* Card header */}
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ backgroundColor: bg }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-xs font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{update.author}</span>
        </div>
        <span className={`text-[10px] shrink-0 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>{dateStr}</span>
      </div>

      <div className="px-3.5 pb-3">
        {/* Update text — rendered as HTML if it contains markup */}
        {update.text && (
          isHTML(update.text) ? (
            <div
              className={`text-sm leading-relaxed mb-2
                [&_a]:text-blue-400 [&_a]:underline
                [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-1
                [&_li]:mb-0.5
                [&_h2]:text-base [&_h2]:font-bold [&_h2]:mb-1
                [&_h3]:font-semibold [&_h3]:mb-0.5
                [&_b]:font-semibold [&_strong]:font-semibold
                ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
              dangerouslySetInnerHTML={{ __html: update.text }}
            />
          ) : (
            <p className={`text-sm leading-relaxed mb-2 whitespace-pre-wrap ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {update.text}
            </p>
          )
        )}

        {/* Checklist items */}
        {update.checklist && update.checklist.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {update.checklist.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 ${canEdit ? 'cursor-pointer' : ''}`}
                onClick={() => canEdit && onToggleChecklistItem(update.id, item.id)}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${item.done ? 'bg-green-500 border-green-500' : darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                  {item.done && <Check size={10} className="text-white" />}
                </div>
                <span className={`text-xs transition-opacity ${item.done ? 'line-through opacity-40' : darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Replies */}
        {update.replies && update.replies.length > 0 && (
          <div className={`mt-2.5 pt-2.5 border-t space-y-2.5 ${darkMode ? 'border-[#323652]' : 'border-gray-100'}`}>
            {update.replies.map((reply: Reply) => {
              const ri = (reply.author ?? 'U').slice(0, 2).toUpperCase();
              const rb = avatarColor(reply.author ?? '');
              const rd = formatDateTime(reply.createdAt);
              return (
                <div key={reply.id} className="flex gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5" style={{ backgroundColor: rb }}>
                    {ri}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[11px] font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{reply.author}</span>
                      <span className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>{rd}</span>
                    </div>
                    <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{reply.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reply area */}
        {canEdit && (
          <div className="mt-2.5">
            {replyingTo === update.id ? (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${darkMode ? 'bg-[#07080f] border border-[#323652]' : 'bg-gray-50 border border-gray-300'}`}>
                <input
                  value={replyText}
                  onChange={(e) => onSetReplyText(e.target.value)}
                  placeholder="Write a reply…"
                  className={`flex-1 bg-transparent text-xs outline-none ${darkMode ? 'placeholder-gray-600 text-gray-200' : 'placeholder-gray-400 text-gray-700'}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmitReply(update.id);
                    if (e.key === 'Escape') onSetReplyingTo(null);
                  }}
                  autoFocus
                />
                <button onClick={() => onSubmitReply(update.id)} className="text-xs text-blue-500 hover:text-blue-400 font-medium shrink-0">
                  Send
                </button>
                <button onClick={() => onSetReplyingTo(null)} className={darkMode ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onSetReplyingTo(update.id)}
                className={`text-[11px] font-medium transition-colors ${darkMode ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Reply
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── FilesList ─────────────────────────────────────────────────────────

function FilesList({
  files,
  canUpload,
  darkMode,
  onAddFiles,
  uploadTasks = [],
  onDismissError,
}: {
  files: ProjectFile[];
  canUpload: boolean;
  darkMode: boolean;
  onAddFiles?: () => void;
  uploadTasks?: UploadTask[];
  onDismissError?: (id: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('list');

  // Fetch-and-save download — works for cross-origin Firebase Storage URLs
  const handleDownload = (url: string, name: string) => {
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      })
      .catch(() => window.open(url, '_blank'));
  };

  const isImage = (f: ProjectFile) => typeof f.type === 'string' && f.type.startsWith('image/');
  const fileExt = (f: ProjectFile) => f.name.split('.').pop()?.toUpperCase() ?? 'FILE';

  const iconBtnCls = (active: boolean) =>
    `p-1.5 rounded-lg transition-colors ${
      active
        ? darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'
        : darkMode ? 'text-gray-600 hover:text-gray-300 hover:bg-white/8' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
    }`;

  return (
    <div className="p-4">
      {/* Top bar: upload button + view toggle */}
      <div className="flex items-center gap-2 mb-4">
        {canUpload && onAddFiles && (
          <button
            onClick={onAddFiles}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors ${
              darkMode
                ? 'border-[#323652] text-gray-500 hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/5'
                : 'border-gray-300 text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50'
            }`}
          >
            <Paperclip size={15} />
            Upload files
          </button>
        )}
        {files.length > 0 && (
          <div className={`flex items-center gap-0.5 rounded-lg p-0.5 ${darkMode ? 'bg-[#1d202f]' : 'bg-gray-100'}`}>
            <button onClick={() => setViewMode('list')} className={iconBtnCls(viewMode === 'list')} title="List view">
              <LayoutList size={14} />
            </button>
            <button onClick={() => setViewMode('gallery')} className={iconBtnCls(viewMode === 'gallery')} title="Gallery view">
              <LayoutGrid size={14} />
            </button>
          </div>
        )}
      </div>

      {/* In-progress / error upload cards */}
      {uploadTasks.length > 0 && (
        <div className="space-y-2 mb-4">
          {uploadTasks.map((task) => (
            <div
              key={task.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                task.status === 'error'
                  ? darkMode ? 'border-red-500/30 bg-red-500/10' : 'border-red-200 bg-red-50'
                  : darkMode ? 'border-[#323652] bg-[#161a32]' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className={`shrink-0 w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center ${darkMode ? 'bg-[#1e2340]' : 'bg-gray-200'}`}>
                {task.previewUrl ? (
                  <img src={task.previewUrl} alt={task.name} className="w-full h-full object-cover" />
                ) : task.status === 'error' ? (
                  <AlertCircle size={18} className="text-red-400" />
                ) : (
                  <ImageIcon size={18} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate mb-1.5 ${task.status === 'error' ? 'text-red-400' : darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  {task.name}
                </p>
                {task.status === 'error' ? (
                  <p className={`text-[10px] ${darkMode ? 'text-red-400' : 'text-red-500'}`}>{task.errorMsg ?? 'Upload failed'}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 h-1 rounded-full overflow-hidden ${darkMode ? 'bg-[#1e2340]' : 'bg-gray-200'}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-200 ${task.status === 'done' ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <span className={`text-[10px] tabular-nums shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {task.status === 'done' ? '100%' : `${task.progress}%`}
                    </span>
                  </div>
                )}
              </div>
              <div className="shrink-0">
                {task.status === 'done' && <CheckCircle2 size={16} className="text-green-500" />}
                {task.status === 'error' && (
                  <button onClick={() => onDismissError?.(task.id)} className={`p-0.5 rounded ${darkMode ? 'text-gray-500 hover:bg-white/10' : 'text-gray-400 hover:bg-gray-200'}`}>
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {files.length === 0 && uploadTasks.length === 0 && (
        <div className="flex flex-col items-center justify-center h-24 gap-2">
          <FileText size={24} className={darkMode ? 'text-gray-700' : 'text-gray-300'} />
          <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>No files yet</p>
        </div>
      )}

      {/* ── List view ── */}
      {files.length > 0 && viewMode === 'list' && (
        <div className="space-y-1">
          {files.map((file) => (
            <div
              key={file.id}
              className={`group flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
            >
              {/* Thumbnail or icon */}
              <div className={`w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 ${darkMode ? 'bg-[#1e2340]' : 'bg-indigo-50'}`}>
                {isImage(file) && (file.url || file.dataUrl) ? (
                  <img src={file.url ?? file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                ) : (
                  <FileText size={14} className={darkMode ? 'text-gray-400' : 'text-indigo-400'} />
                )}
              </div>
              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{file.name}</p>
                <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                  {[
                    file.author,
                    file.size ? `${(file.size / 1024).toFixed(1)} KB` : '',
                    formatDateTime(file.createdAt),
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              {/* Action buttons — visible on hover */}
              {file.url && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => handleDownload(file.url!, file.name)}
                    title="Download"
                    className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-gray-500 hover:text-gray-200 hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}
                  >
                    <Download size={14} />
                  </button>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open"
                    className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-gray-500 hover:text-blue-400 hover:bg-blue-500/10' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                  >
                    <ImageIcon size={14} />
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Gallery view ── */}
      {files.length > 0 && viewMode === 'gallery' && (
        <div className="grid grid-cols-2 gap-3">
          {files.map((file) => (
            <div
              key={file.id}
              className={`rounded-xl border overflow-hidden flex flex-col ${
                darkMode ? 'bg-[#161a32] border-[#323652]' : 'bg-white border-gray-100 shadow-sm'
              }`}
            >
              {/* Preview area */}
              <div className={`h-28 flex items-center justify-center overflow-hidden relative ${darkMode ? 'bg-[#07080f]' : 'bg-gray-50'}`}>
                {isImage(file) && (file.url || file.dataUrl) ? (
                  <img src={file.url ?? file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <FileText size={30} className={darkMode ? 'text-gray-700' : 'text-gray-300'} />
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                      darkMode ? 'bg-[#1e2340] text-gray-500' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {fileExt(file)}
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                <p className={`text-[11px] font-semibold truncate ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{file.name}</p>
                <p className={`text-[10px] leading-snug ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                  {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                  {file.createdAt ? (file.size ? ' · ' : '') + formatDateTime(file.createdAt) : ''}
                </p>
                {/* Buttons */}
                {file.url && (
                  <div className="flex gap-1.5 mt-auto pt-1">
                    <button
                      onClick={() => handleDownload(file.url!, file.name)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        darkMode ? 'bg-[#1d202f] text-gray-400 hover:bg-[#1e2340] hover:text-gray-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Download size={11} />
                      Save
                    </button>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                        darkMode ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                    >
                      View
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
