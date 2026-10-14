import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { ChatArea } from '../src/components/layout/ChatArea';
import { Navbar } from '../src/components/layout/Navbar';
import { ThemeProvider } from '../src/context/ThemeContext';
import * as PwaContextModule from '../src/context/PwaContext';
import { Conversation, User } from '../src/types';

// Mock useSocket
vi.mock('../src/context/SocketContext', () => ({
  useSocket: () => ({
    isConnected: true,
    isConnecting: false,
    presenceMap: { bob_pwa: true },
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

// Mock useAuth
vi.mock('../src/context/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'usr_me',
      username: 'alice_pwa',
      displayName: 'Alice Tester',
      isOnline: true,
    },
    logout: vi.fn(),
  }),
}));

describe('Phase 9: PWA Capabilities & Strict Offline Privacy Policy', () => {
  const dummyUser: User = {
    id: 'usr_me',
    displayName: 'Alice Tester',
    username: 'alice_pwa',
    isOnline: true,
  };

  const dummyConversation: Conversation = {
    id: 'conv_pwa_1',
    peer: {
      id: 'usr_peer',
      displayName: 'Bob Peer',
      username: 'bob_pwa',
      isOnline: true,
    },
    status: 'active',
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock matchMedia for ThemeContext in jsdom
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  describe('A. Web App Manifest & Static Assets', () => {
    it('manifest.webmanifest exists and defines correct application configuration', () => {
      const manifestPath = path.resolve(__dirname, '../public/manifest.webmanifest');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifestContent.name).toBe('textLove - Privacy-First Live Messaging');
      expect(manifestContent.short_name).toBe('textLove');
      expect(manifestContent.display).toBe('standalone');
      expect(manifestContent.start_url).toBe('/');
      expect(manifestContent.theme_color).toBe('#8B5CF6');
      expect(manifestContent.background_color).toBe('#090A0F');
      expect(manifestContent.icons.length).toBeGreaterThanOrEqual(3);

      const maskable = manifestContent.icons.find((i: { purpose?: string }) => i.purpose?.includes('maskable'));
      expect(maskable).toBeDefined();
    });

    it('all icon files referenced in manifest exist on disk', () => {
      const icon192 = path.resolve(__dirname, '../public/icons/icon-192.svg');
      const icon512 = path.resolve(__dirname, '../public/icons/icon-512.svg');
      const iconMaskable = path.resolve(__dirname, '../public/icons/icon-maskable.svg');

      expect(fs.existsSync(icon192)).toBe(true);
      expect(fs.existsSync(icon512)).toBe(true);
      expect(fs.existsSync(iconMaskable)).toBe(true);
    });

    it('index.html includes manifest link, theme-color, and apple-mobile-web-app tags', () => {
      const indexPath = path.resolve(__dirname, '../index.html');
      const htmlContent = fs.readFileSync(indexPath, 'utf-8');

      expect(htmlContent).toContain('rel="manifest" href="/manifest.webmanifest"');
      expect(htmlContent).toContain('name="theme-color"');
      expect(htmlContent).toContain('name="apple-mobile-web-app-capable" content="yes"');
    });
  });

  describe('B. Strict Service Worker Privacy Invariants', () => {
    it('service worker strictly forbids caching API, WebSocket, ciphertext, or keys', () => {
      const swPath = path.resolve(__dirname, '../public/sw.js');
      expect(fs.existsSync(swPath)).toBe(true);
      const swCode = fs.readFileSync(swPath, 'utf-8');

      // Verify privacy filter blocks API
      expect(swCode).toContain("url.pathname.startsWith('/api/')");
      expect(swCode).toContain("url.pathname.startsWith('/socket.io/')");
      expect(swCode).toContain("request.method !== 'GET'");

      // Verify static cache-first with network fallback applies only to static files
      expect(swCode).toContain('textlove-static-v1');
      expect(swCode).toContain('SKIP_WAITING');
    });
  });

  describe('C. Offline UI Enforcement & Zero-Retention Protection', () => {
    it('disables message composer when client is offline to prevent retention or queuing', () => {
      // Mock offline state
      vi.spyOn(PwaContextModule, 'usePwa').mockReturnValue({
        isOnline: false,
        isInstallable: false,
        isUpdateAvailable: false,
        installPwa: vi.fn(),
        applyUpdate: vi.fn(),
      });

      render(
        <ChatArea
          currentUser={dummyUser}
          conversation={dummyConversation}
          messages={[]}
          onSendMessage={vi.fn()}
        />
      );

      const messageInput = screen.getByPlaceholderText(/You are offline\. Live messaging is disabled/i);
      expect(messageInput).toBeDisabled();

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeDisabled();
    });

    it('enables message composer when client is online and peer is online', () => {
      // Mock online state
      vi.spyOn(PwaContextModule, 'usePwa').mockReturnValue({
        isOnline: true,
        isInstallable: false,
        isUpdateAvailable: false,
        installPwa: vi.fn(),
        applyUpdate: vi.fn(),
      });

      render(
        <ChatArea
          currentUser={dummyUser}
          conversation={dummyConversation}
          messages={[]}
          onSendMessage={vi.fn()}
        />
      );

      const messageInput = screen.getByPlaceholderText(/Live encrypted message to/i);
      expect(messageInput).toBeEnabled();
    });
  });

  describe('D. PWA Installability and Prompt Handling', () => {
    it('renders Install App button in Navbar when isInstallable is true', () => {
      const installPwaMock = vi.fn();
      vi.spyOn(PwaContextModule, 'usePwa').mockReturnValue({
        isOnline: true,
        isInstallable: true,
        isUpdateAvailable: false,
        installPwa: installPwaMock,
        applyUpdate: vi.fn(),
      });

      render(
        <ThemeProvider>
          <Navbar
            currentUser={dummyUser}
            onOpenSettings={vi.fn()}
          />
        </ThemeProvider>
      );

      const installBtn = screen.getByRole('button', { name: /Install textLove App/i });
      expect(installBtn).toBeInTheDocument();

      fireEvent.click(installBtn);
      expect(installPwaMock).toHaveBeenCalledTimes(1);
    });

    it('does not render Install App button when isInstallable is false', () => {
      vi.spyOn(PwaContextModule, 'usePwa').mockReturnValue({
        isOnline: true,
        isInstallable: false,
        isUpdateAvailable: false,
        installPwa: vi.fn(),
        applyUpdate: vi.fn(),
      });

      render(
        <ThemeProvider>
          <Navbar
            currentUser={dummyUser}
            onOpenSettings={vi.fn()}
          />
        </ThemeProvider>
      );

      expect(screen.queryByRole('button', { name: /Install textLove App/i })).not.toBeInTheDocument();
    });
  });
});
