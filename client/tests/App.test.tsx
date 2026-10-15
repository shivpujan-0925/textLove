import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/App';

describe('textLove Client Application', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Mock fetch for backend health check
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy' }),
      })
    );
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

  const setupMockAuth = () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/auth/google/url')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?prompt=select_account',
              state: 'mock_state_123',
              isMock: true,
            }),
        });
      }
      if (url.includes('/api/v1/auth/google/callback')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              user: {
                id: 'usr_bob_202',
                username: 'bob_martinez',
                displayName: 'Bob Martinez',
                avatarUrl: undefined,
                hasRegisteredKeys: false,
              },
              csrfToken: 'csrf_mock_token_777',
            }),
        });
      }
      if (url.includes('/api/v1/auth/me')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy' }),
      });
    });
  };

  const signInAsBob = async () => {
    setupMockAuth();
    render(<App />);

    const googleBtn = screen.getByRole('button', { name: /Sign in with Google/i });
    fireEvent.click(googleBtn);

    expect(await screen.findByText(/Choose an account to continue to/i)).toBeInTheDocument();
    const bobBtn = screen.getByRole('button', { name: /Bob Martinez/i });
    fireEvent.click(bobBtn);

    expect(await screen.findByText(/Signed in as Bob Martinez/i)).toBeInTheDocument();
  };

  it('renders textLove branding and hero text on landing page without unauthenticated explore feature', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /textLove Home/i })).toBeInTheDocument();
    expect(screen.getByText(/Live conversations that leave/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in with Google/i })).toBeInTheDocument();
    // Critical assertion: Unauthenticated "Explore Chat Layout" must be removed
    expect(screen.queryByText(/Explore Chat Layout/i)).not.toBeInTheDocument();
    // Critical assertion: Unauthenticated settings gear icon must not exist
    expect(screen.queryByLabelText(/Settings and Privacy/i)).not.toBeInTheDocument();
  });

  it('switches to the chat interface only after signing in', async () => {
    await signInAsBob();
    expect(await screen.findByText(/No active sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/Welcome to/i)).toBeInTheDocument();
  });

  it('can open and close settings modal via profile picture view after signing in', async () => {
    await signInAsBob();
    const settingsBtn = screen.getByLabelText(/Settings and Privacy/i);
    fireEvent.click(settingsBtn);

    expect(screen.getByText(/Settings & Privacy/i)).toBeInTheDocument();
    expect(screen.getByText(/Theme & Appearance/i)).toBeInTheDocument();
    expect(screen.getByText(/textLove Privacy Assurances/i)).toBeInTheDocument();

    const closeBtn = screen.getByLabelText(/Close dialog/i);
    fireEvent.click(closeBtn);
  });

  it('renders profile management, avatar file input, and account deletion dialog in Settings', async () => {
    await signInAsBob();
    const settingsBtn = screen.getByLabelText(/Settings and Privacy/i);
    fireEvent.click(settingsBtn);

    // Profile elements and cooldown limits
    expect(screen.getByText(/Unique Public Username/i)).toBeInTheDocument();
    expect(screen.getByText(/1 change every 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/Display Name/i)).toBeInTheDocument();
    expect(screen.getByText(/Change photo \(1h limit\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Danger Zone/i)).toBeInTheDocument();

    // Verify file input exists for avatar upload
    const fileInputs = document.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBeGreaterThanOrEqual(1);

    // Click Delete button in Danger Zone
    const deleteBtn = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteBtn);

    // Confirmation dialog should open
    expect(screen.getByText(/Confirm Account Deletion/i)).toBeInTheDocument();
    expect(screen.getByText(/Are you certain you wish to permanently delete your account/i)).toBeInTheDocument();
  });

  it('allows searching users in the sidebar once signed in', async () => {
    await signInAsBob();

    const searchInput = await screen.findByPlaceholderText(/Search by username or name.../i);
    expect(searchInput).toBeInTheDocument();
    fireEvent.change(searchInput, { target: { value: 'alice' } });
    expect(searchInput).toHaveValue('alice');
  });

  it('clicking "Sign in with Google" opens the Google Account Chooser and allows choosing Bob', async () => {
    setupMockAuth();
    render(<App />);

    // Click "Sign in with Google"
    const googleBtn = screen.getByRole('button', { name: /Sign in with Google/i });
    fireEvent.click(googleBtn);

    // Verify account chooser modal opens
    expect(await screen.findByText(/Choose an account to continue to/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice Smith/i)).toBeInTheDocument();
    expect(screen.getByText(/Bob Martinez/i)).toBeInTheDocument();
    expect(screen.getByText(/Use another Google account/i)).toBeInTheDocument();

    // Select Bob Martinez
    const bobBtn = screen.getByRole('button', { name: /Bob Martinez/i });
    fireEvent.click(bobBtn);

    // Verify chat interface loads Bob's session
    expect(await screen.findByText(/Signed in as Bob Martinez/i)).toBeInTheDocument();
  });
});
