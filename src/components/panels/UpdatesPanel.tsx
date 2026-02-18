// UpdatesPanel — slide-over panel for task updates, files, and activity.
// Shows updates feed, file attachments, checklists, and replies.

import { useState, useRef } from 'react';
import {
  X,
  MessageSquare,
  FileText,
  Send,
  Check,
  Plus,
  Paperclip,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { Update, Reply, ChecklistItem } from '../../types/item';
import type { ProjectFile } from '../../types/file';
import type { MemberPermissions } from '../../types/member';

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
  onAddFiles?: (files: FileList) => void;
}

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
  onAddFiles,
}: UpdatesPanelProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const [activeTab, setActiveTab] = useState<'updates' | 'files'>('updates');
  const [newText, setNewText] = useState('');
  const [isChecklist, setIsChecklist] = useState(false);
  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = permissions.canEdit;

  const handleSubmitUpdate = () => {
    const trimmed = newText.trim();
    if (!trimmed && checklistItems.length === 0) return;

    onAddUpdate({
      text: trimmed,
      checklist: isChecklist ? checklistItems : [],
    });

    setNewText('');
    setChecklistItems([]);
    setIsChecklist(false);
  };

  const handleSubmitReply = (updateId: string) => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onAddReply(updateId, trimmed);
    setReplyText('');
    setReplyingTo(null);
  };

  const handleAddChecklistItem = () => {
    setChecklistItems((prev) => [
      ...prev,
      { id: `c${Date.now()}`, text: '', done: false },
    ]);
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles?.(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div
      className={`fixed right-0 top-0 h-full w-96 z-[250] shadow-2xl flex flex-col ${
        darkMode ? 'bg-[#1c213e] text-gray-200' : 'bg-white text-gray-800'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
          darkMode ? 'border-[#2b2c32]' : 'border-gray-200'
        }`}
      >
        <div className="min-w-0">
          {isSubitem && parentName && (
            <p className={`text-[10px] truncate ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {parentName}
            </p>
          )}
          <h3 className="text-sm font-semibold truncate">{taskName}</h3>
        </div>
        <button
          onClick={onClose}
          className={`p-1 rounded transition-colors ${
            darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
          }`}
        >
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div
        className={`flex border-b shrink-0 ${
          darkMode ? 'border-[#2b2c32]' : 'border-gray-200'
        }`}
      >
        <TabButton
          active={activeTab === 'updates'}
          onClick={() => setActiveTab('updates')}
          darkMode={darkMode}
          icon={<MessageSquare size={14} />}
          label="Updates"
          count={updates.length}
        />
        <TabButton
          active={activeTab === 'files'}
          onClick={() => setActiveTab('files')}
          darkMode={darkMode}
          icon={<FileText size={14} />}
          label="Files"
          count={files.length}
        />
      </div>

      {/* Read-only notice */}
      {!canEdit && (
        <div
          className={`px-4 py-2 text-xs border-b ${
            darkMode
              ? 'bg-amber-500/10 text-amber-400 border-[#2b2c32]'
              : 'bg-amber-50 text-amber-600 border-gray-200'
          }`}
        >
          Read-only access: you can view updates and files, but cannot change content.
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'updates' ? (
          <UpdatesList
            updates={updates}
            canEdit={canEdit}
            darkMode={darkMode}
            replyingTo={replyingTo}
            replyText={replyText}
            onSetReplyingTo={setReplyingTo}
            onSetReplyText={setReplyText}
            onSubmitReply={handleSubmitReply}
            onToggleChecklistItem={onToggleChecklistItem}
          />
        ) : (
          <FilesList
            files={files}
            canUpload={permissions.canUpload}
            darkMode={darkMode}
            onAddFiles={handleFileSelect}
          />
        )}
      </div>

      {/* Composer (updates tab only) */}
      {activeTab === 'updates' && canEdit && (
        <div
          className={`border-t p-3 shrink-0 ${
            darkMode ? 'border-[#2b2c32]' : 'border-gray-200'
          }`}
        >
          {/* Mode toggle */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setIsChecklist(false)}
              className={`text-xs px-2 py-1 rounded ${
                !isChecklist
                  ? 'bg-blue-500 text-white'
                  : darkMode
                    ? 'text-gray-400 hover:bg-white/10'
                    : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Update
            </button>
            <button
              onClick={() => setIsChecklist(true)}
              className={`text-xs px-2 py-1 rounded ${
                isChecklist
                  ? 'bg-blue-500 text-white'
                  : darkMode
                    ? 'text-gray-400 hover:bg-white/10'
                    : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Checklist
            </button>
          </div>

          {/* Text input */}
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={isChecklist ? 'Checklist title...' : 'Write an update...'}
            rows={2}
            className={`w-full px-3 py-2 rounded text-sm border resize-none ${
              darkMode
                ? 'bg-[#181b34] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400'
            }`}
          />

          {/* Checklist items */}
          {isChecklist && (
            <div className="mt-2 space-y-1">
              {checklistItems.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2">
                  <Check
                    size={14}
                    className={darkMode ? 'text-gray-600' : 'text-gray-300'}
                  />
                  <input
                    value={item.text}
                    onChange={(e) =>
                      setChecklistItems((prev) =>
                        prev.map((ci, i) =>
                          i === idx ? { ...ci, text: e.target.value } : ci,
                        ),
                      )
                    }
                    placeholder={`Item ${idx + 1}`}
                    className={`flex-1 px-2 py-1 rounded text-xs border ${
                      darkMode
                        ? 'bg-[#181b34] border-[#2b2c32] text-gray-200'
                        : 'bg-white border-gray-200 text-gray-800'
                    }`}
                  />
                </div>
              ))}
              <button
                onClick={handleAddChecklistItem}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                  darkMode
                    ? 'text-gray-400 hover:bg-white/10'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <Plus size={12} /> Add item
              </button>
            </div>
          )}

          {/* Submit + file attach */}
          <div className="flex items-center gap-2 mt-2">
            {onAddFiles && (
              <button
                onClick={handleFileSelect}
                className={`p-1.5 rounded transition-colors ${
                  darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <Paperclip size={16} />
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={handleSubmitUpdate}
              disabled={!newText.trim() && checklistItems.length === 0}
              className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                newText.trim() || checklistItems.length > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : darkMode
                    ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Send size={14} /> Send
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />
    </div>
  );
}

// --- Sub-components ---

function TabButton({
  active,
  onClick,
  darkMode,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  darkMode: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
        active
          ? 'border-blue-500 text-blue-500'
          : `border-transparent ${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`
      }`}
    >
      {icon}
      {label}
      {count > 0 && (
        <span
          className={`px-1.5 rounded-full text-[10px] ${
            active
              ? 'bg-blue-500/20 text-blue-500'
              : darkMode
                ? 'bg-white/10 text-gray-400'
                : 'bg-gray-100 text-gray-500'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function UpdatesList({
  updates,
  canEdit,
  darkMode,
  replyingTo,
  replyText,
  onSetReplyingTo,
  onSetReplyText,
  onSubmitReply,
  onToggleChecklistItem,
}: {
  updates: Update[];
  canEdit: boolean;
  darkMode: boolean;
  replyingTo: string | null;
  replyText: string;
  onSetReplyingTo: (id: string | null) => void;
  onSetReplyText: (text: string) => void;
  onSubmitReply: (updateId: string) => void;
  onToggleChecklistItem: (updateId: string, itemId: string) => void;
}) {
  if (updates.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          No updates yet
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {updates.map((update) => (
        <div
          key={update.id}
          className={`rounded-lg p-3 ${
            darkMode ? 'bg-[#181b34] border border-[#2b2c32]' : 'bg-gray-50 border border-gray-100'
          }`}
        >
          {/* Author + time */}
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {update.author}
            </span>
            <span className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              {update.createdAt ? new Date(update.createdAt).toLocaleDateString() : ''}
            </span>
          </div>

          {/* Text */}
          {update.text && (
            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              {update.text}
            </p>
          )}

          {/* Checklist */}
          {update.checklist && update.checklist.length > 0 && (
            <div className="space-y-1 mb-2">
              {update.checklist.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 cursor-pointer ${
                    canEdit ? 'hover:opacity-80' : ''
                  }`}
                  onClick={() => canEdit && onToggleChecklistItem(update.id, item.id)}
                >
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      item.done
                        ? 'bg-green-500 border-green-500 text-white'
                        : darkMode
                          ? 'border-gray-600'
                          : 'border-gray-300'
                    }`}
                  >
                    {item.done && <Check size={10} />}
                  </div>
                  <span
                    className={`text-xs ${
                      item.done
                        ? 'line-through opacity-50'
                        : darkMode
                          ? 'text-gray-300'
                          : 'text-gray-600'
                    }`}
                  >
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Replies */}
          {update.replies && update.replies.length > 0 && (
            <div className={`mt-2 pl-3 border-l-2 space-y-2 ${
              darkMode ? 'border-[#2b2c32]' : 'border-gray-200'
            }`}>
              {update.replies.map((reply: Reply) => (
                <div key={reply.id}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {reply.author}
                    </span>
                    <span className={`text-[9px] ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                      {reply.createdAt ? new Date(reply.createdAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    {reply.text}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Reply button */}
          {canEdit && (
            <div className="mt-2">
              {replyingTo === update.id ? (
                <div className="flex items-center gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => onSetReplyText(e.target.value)}
                    placeholder="Write a reply..."
                    className={`flex-1 px-2 py-1 rounded text-xs border ${
                      darkMode
                        ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200'
                        : 'bg-white border-gray-200 text-gray-800'
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSubmitReply(update.id);
                      if (e.key === 'Escape') onSetReplyingTo(null);
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => onSubmitReply(update.id)}
                    className="text-blue-500 hover:text-blue-600"
                  >
                    <Send size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onSetReplyingTo(update.id)}
                  className={`text-[10px] ${
                    darkMode ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Reply
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FilesList({
  files,
  canUpload,
  darkMode,
  onAddFiles,
}: {
  files: ProjectFile[];
  canUpload: boolean;
  darkMode: boolean;
  onAddFiles?: () => void;
}) {
  return (
    <div className="p-3">
      {canUpload && onAddFiles && (
        <button
          onClick={onAddFiles}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed mb-3 text-sm transition-colors ${
            darkMode
              ? 'border-[#2b2c32] text-gray-400 hover:border-blue-500/50 hover:text-blue-400'
              : 'border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500'
          }`}
        >
          <Paperclip size={16} />
          Upload files
        </button>
      )}

      {files.length === 0 ? (
        <div className="flex items-center justify-center h-20">
          <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            No files yet
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className={`flex items-center gap-3 p-2 rounded ${
                darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'
              }`}
            >
              <FileText
                size={16}
                className={darkMode ? 'text-gray-400' : 'text-gray-500'}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  {file.name}
                </p>
                <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {file.author} · {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                </p>
              </div>
              {file.url && (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs px-2 py-1 rounded ${
                    darkMode
                      ? 'text-blue-400 hover:bg-blue-500/10'
                      : 'text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  View
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
