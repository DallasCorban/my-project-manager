// ItemAiChat — item-level AI chat component rendered in the AI tab
// of the UpdatesPanel sidebar. Pure presentational — all hooks are lifted
// to UpdatesPanel to avoid Firestore listener mount/unmount issues.

import { useUIStore } from '../../stores/uiStore';
import { AiChatCore } from './AiChatCore';
import type { DisplayMessage } from '../../hooks/useAiChat';

interface ItemAiChatProps {
  messages: DisplayMessage[];
  isLoading: boolean;
  error: string | null;
  forceSonnet: boolean;
  onSetForceSonnet: (v: boolean) => void;
  onSendMessage: (
    text: string,
    onStreamToken?: (token: string) => void,
    onStreamDone?: () => void,
    onComplete?: (fullResponse: string) => void,
  ) => Promise<void>;
  onClearChat: () => Promise<void>;
  itemName: string;
  contextBadge?: string;
}

export function ItemAiChat({
  messages,
  isLoading,
  error,
  forceSonnet,
  onSetForceSonnet,
  onSendMessage,
  onClearChat,
  itemName,
  contextBadge,
}: ItemAiChatProps) {
  const darkMode = useUIStore((s) => s.darkMode);

  return (
    <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${
      darkMode ? 'bg-[#1c213e] text-gray-200' : 'bg-white text-gray-800'
    }`}>
      <AiChatCore
        messages={messages}
        isLoading={isLoading}
        error={error}
        forceSonnet={forceSonnet}
        onSetForceSonnet={onSetForceSonnet}
        onSendMessage={onSendMessage}
        onClearChat={onClearChat}
        darkMode={darkMode}
        emptyStateMessage={`Ask me about "${itemName}". I can see its updates and context.`}
        emptyStateSubtext="Tap the mic to use voice input."
        contextBadge={contextBadge}
      />
    </div>
  );
}
