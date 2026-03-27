// AiMemorySection — collapsible panel showing persistent AI memory
// with three tabs: Project, Team, Personal.

import { useState, useRef, useEffect } from 'react';
import { Trash2, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import type { MemoryFact, AiMemoryState } from '../../hooks/useAiMemory';

interface AiMemorySectionProps {
  memory: AiMemoryState;
  darkMode: boolean;
}

type MemoryTab = 'project' | 'team' | 'personal';

export function AiMemorySection({ memory, darkMode }: AiMemorySectionProps) {
  const [activeTab, setActiveTab] = useState<MemoryTab>('project');
  const [editingBrief, setEditingBrief] = useState(false);
  const [briefDraft, setBriefDraft] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const briefRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingBrief && briefRef.current) {
      briefRef.current.focus();
      briefRef.current.style.height = 'auto';
      briefRef.current.style.height = `${briefRef.current.scrollHeight}px`;
    }
  }, [editingBrief]);

  const tabs: { key: MemoryTab; label: string; count: number }[] = [
    { key: 'project', label: 'Project', count: memory.projectFacts.length },
    { key: 'team', label: 'Team', count: memory.workspaceFacts.length },
    { key: 'personal', label: 'Personal', count: memory.userFacts.length },
  ];

  const handleSaveBrief = async () => {
    await memory.updateBrief(briefDraft);
    setEditingBrief(false);
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    const existing = memory.userPreferences?.factCategories || [];
    if (existing.includes(newCategory.trim())) { setNewCategory(''); return; }
    await memory.updateCategories([...existing, newCategory.trim()]);
    setNewCategory('');
  };

  const handleRemoveCategory = async (cat: string) => {
    const existing = memory.userPreferences?.factCategories || [];
    await memory.updateCategories(existing.filter((c) => c !== cat));
  };

  return (
    <div className={`flex flex-col h-full overflow-hidden ${
      darkMode ? 'text-gray-200' : 'text-gray-800'
    }`}>
      {/* Tab bar */}
      <div className={`flex border-b shrink-0 ${
        darkMode ? 'border-white/10' : 'border-gray-200'
      }`}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
              activeTab === tab.key
                ? darkMode
                  ? 'text-purple-400'
                  : 'text-purple-600'
                : darkMode
                  ? 'text-gray-500 hover:text-gray-300'
                  : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                darkMode ? 'bg-white/10' : 'bg-gray-100'
              }`}>
                {tab.count}
              </span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-purple-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {activeTab === 'project' && (
          <>
            {/* Project brief */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide opacity-60">
                  Project Brief
                </span>
                <button
                  onClick={() => {
                    if (editingBrief) {
                      handleSaveBrief();
                    } else {
                      setBriefDraft(memory.projectBrief || '');
                      setEditingBrief(true);
                    }
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    darkMode ? 'hover:bg-white/10 text-purple-400' : 'hover:bg-gray-100 text-purple-600'
                  }`}
                >
                  {editingBrief ? 'Save' : memory.projectBrief ? 'Edit' : 'Create'}
                </button>
              </div>
              {editingBrief ? (
                <div className="space-y-1.5">
                  <textarea
                    ref={briefRef}
                    value={briefDraft}
                    onChange={(e) => {
                      setBriefDraft(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    placeholder="Write a project brief..."
                    className={`w-full resize-none rounded-lg px-3 py-2 text-xs leading-relaxed outline-none border ${
                      darkMode
                        ? 'bg-[#262b4d] border-white/10 text-gray-200 placeholder:text-gray-500'
                        : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400'
                    }`}
                    rows={4}
                  />
                  <button
                    onClick={() => setEditingBrief(false)}
                    className="text-[11px] text-gray-500 hover:text-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              ) : memory.projectBrief ? (
                <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                  darkMode ? 'bg-[#262b4d]' : 'bg-gray-50'
                }`}>
                  {memory.projectBrief}
                </div>
              ) : (
                <div className={`text-xs italic ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                  No brief yet. The AI will create one as it learns about your project.
                </div>
              )}
            </div>

            {/* Project facts */}
            <FactList
              facts={memory.projectFacts}
              scope="project"
              darkMode={darkMode}
              onDelete={memory.deleteFact}
            />
          </>
        )}

        {activeTab === 'team' && (
          <FactList
            facts={memory.workspaceFacts}
            scope="workspace"
            darkMode={darkMode}
            onDelete={memory.deleteFact}
          />
        )}

        {activeTab === 'personal' && (
          <>
            {/* Category manager */}
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide opacity-60">
                Fact Categories
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(memory.userPreferences?.factCategories || []).map((cat) => (
                  <span
                    key={cat}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${
                      darkMode ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {cat}
                    <button
                      onClick={() => handleRemoveCategory(cat)}
                      className="opacity-50 hover:opacity-100"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                    placeholder="Add..."
                    className={`w-20 px-1.5 py-0.5 rounded text-[11px] outline-none border ${
                      darkMode
                        ? 'bg-transparent border-white/10 text-gray-300 placeholder:text-gray-600'
                        : 'bg-transparent border-gray-200 text-gray-600 placeholder:text-gray-400'
                    }`}
                  />
                  <button
                    onClick={handleAddCategory}
                    className={`p-0.5 rounded ${
                      darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                    }`}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Personal facts */}
            <FactList
              facts={memory.userFacts}
              scope="user"
              darkMode={darkMode}
              onDelete={memory.deleteFact}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Fact List ────────────────────────────────────────────────────────

function FactList({
  facts,
  scope,
  darkMode,
  onDelete,
}: {
  facts: MemoryFact[];
  scope: 'project' | 'workspace' | 'user';
  darkMode: boolean;
  onDelete: (id: string, scope: 'project' | 'workspace' | 'user') => Promise<void>;
}) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  if (facts.length === 0) {
    return (
      <div className={`text-xs italic py-2 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
        No facts stored yet. The AI will save important details from your conversations.
      </div>
    );
  }

  // Group by category
  const grouped: Record<string, MemoryFact[]> = {};
  for (const fact of facts) {
    const cat = fact.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(fact);
  }

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-60">
        Facts ({facts.length})
      </span>
      {Object.entries(grouped).map(([category, catFacts]) => (
        <div key={category}>
          <button
            onClick={() => toggleCategory(category)}
            className={`flex items-center gap-1 text-[11px] font-medium w-full text-left py-0.5 ${
              darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-600'
            }`}
          >
            {collapsedCategories.has(category) ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
            {category}
            <span className="opacity-50 ml-1">({catFacts.length})</span>
          </button>
          {!collapsedCategories.has(category) && (
            <div className="space-y-1 ml-4 mt-1">
              {catFacts.map((fact) => (
                <div
                  key={fact.id}
                  className={`group flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                    darkMode ? 'bg-[#262b4d]' : 'bg-gray-50'
                  }`}
                >
                  <span className="flex-1">{fact.content}</span>
                  <button
                    onClick={() => onDelete(fact.id, scope)}
                    className={`shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                      darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
                    }`}
                    title="Delete fact"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
