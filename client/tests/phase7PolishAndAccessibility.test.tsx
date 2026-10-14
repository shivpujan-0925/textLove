import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatArea } from '../src/components/layout/ChatArea';
import { Sidebar } from '../src/components/layout/Sidebar';
import { ToastProvider } from '../src/context/ToastContext';
import { useToast } from '../src/context/useToast';
import { Conversation, User } from '../src/types';

// Mock useSocket
vi.mock('../src/context/SocketContext', () => ({
  useSocket: () => ({
    isConnected: true,
    isConnecting: false,
    presenceMap: {
      alice_sec: true,
    },
    subscribePresence: vi.fn(),
    socket: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    startTyping: vi.fn(),
    stopTyping: vi.fn(),
    sendMessage: vi.fn(),
    isTyping: false,
    fetchPeerKeyBundle: vi.fn().mockResolvedValue({
      identityPublicKey: 'test-public-key',
      ephemeralPublicKey: 'test-ephemeral-key',
    }),
    onTyping: vi.fn(() => () => {}),
  }),
}));

describe('Phase 7: Interface Polish, Accessibility, and Design Verification', () => {
  beforeEach(() => {
    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  const dummyUser: User = {
    id: 'my_id_123',
    displayName: 'My Profile',
    username: 'my_profile',
    isOnline: true,
    lastSeen: new Date().toISOString(),
  };

  const dummyConversation: Conversation = {
    id: 'conv_123',
    peer: {
      id: 'peer_456',
      displayName: 'Alice Security',
      username: 'alice_sec',
      avatarUrl: '',
      isOnline: true,
      lastSeen: new Date().toISOString(),
    },
    status: 'active',
    safetyNumber: '123456789012',
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
    lastActivityAt: new Date().toISOString(),
  };

  it('renders chat area with accessible 30-minute expiry timer and safety number', () => {
    const handleSend = () => {};
    const handleEnd = () => {};

    render(
      <ToastProvider>
        <ChatArea
          conversation={dummyConversation}
          messages={[]}
          onSendMessage={handleSend}
          onEndConversation={handleEnd}
        />
      </ToastProvider>
    );

    // Dynamic timer pill should have role="timer" and accessible aria-label
    const timerPill = screen.getByRole('timer');
    expect(timerPill).toBeInTheDocument();
    expect(timerPill.getAttribute('aria-label')).toContain('Inactivity timer');

    // Safety number button should have accessible aria-label
    const safetyNumberBtn = screen.getByRole('button', { name: /safety number/i });
    expect(safetyNumberBtn).toBeInTheDocument();
  });

  it('provides accessible search input, clear button, and touch-friendly conversation items in Sidebar', () => {
    const onSelect = vi.fn();

    render(
      <ToastProvider>
        <Sidebar
          currentUser={dummyUser}
          conversations={[dummyConversation]}
          selectedConversationId={dummyConversation.id}
          onSelectConversation={onSelect}
          onStartNewChat={() => {}}
        />
      </ToastProvider>
    );

    // Find the search input
    const searchInput = screen.getByLabelText(/search users or conversations/i);
    expect(searchInput).toBeInTheDocument();

    // Type query to show clear button
    fireEvent.change(searchInput, { target: { value: 'alice' } });

    // Clear search button must have an accessible label
    const clearBtn = screen.getByLabelText(/clear search input/i);
    expect(clearBtn).toBeInTheDocument();

    // Clicking clear resets input
    fireEvent.click(clearBtn);
    expect(searchInput).toHaveValue('');

    // Conversation item should be accessible with online presence status
    const convBtn = screen.getByRole('button', {
      name: /Conversation with Alice Security, Online/i,
    });
    expect(convBtn).toBeInTheDocument();
    expect(convBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders accessible toast notifications with assertive alerts for errors and polite for status', () => {
    const TestComponent = () => {
      const { toast } = useToast();
      return (
        <div>
          <button onClick={() => toast.error('Encryption Warning', 'Failed to decrypt')}>
            Trigger Error
          </button>
          <button onClick={() => toast.success('Key Verified', 'Identity key matched')}>
            Trigger Success
          </button>
        </div>
      );
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Trigger Error'));
    const errorAlert = screen.getByRole('alert');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert.getAttribute('aria-live')).toBe('assertive');

    fireEvent.click(screen.getByText('Trigger Success'));
    const statusNotice = screen.getByRole('status');
    expect(statusNotice).toBeInTheDocument();
    expect(statusNotice.getAttribute('aria-live')).toBe('polite');
  });
});
