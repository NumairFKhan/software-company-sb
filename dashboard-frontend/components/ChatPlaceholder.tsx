'use client';

import { useActiveProject } from '@/contexts/ActiveProjectContext';

/**
 * Placeholder chat input panel.
 * Exposes its <input> through ActiveProjectContext.chatInputRef so the
 * Sidebar's "+ New" button can focus it programmatically.
 * Full chat functionality is implemented in Ticket 4.
 */
export function ChatPlaceholder() {
  const { chatInputRef } = useActiveProject();

  return (
    <div className="border-t border-gray-200 p-4 bg-gray-50">
      <div className="flex gap-2">
        <input
          ref={chatInputRef}
          type="text"
          placeholder="Message Communicator… (chat coming soon)"
          className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-md
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     bg-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          disabled
          aria-label="Chat input (placeholder — not yet active)"
          data-testid="chat-input-placeholder"
        />
        <button
          disabled
          className="px-4 py-2 text-sm font-medium text-white bg-blue-400 rounded-md
                     cursor-not-allowed opacity-60"
          aria-disabled="true"
          aria-label="Send message (not yet active)"
        >
          Send
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">Full chat panel coming in Ticket 4.</p>
    </div>
  );
}
