import assert from 'assert';

const BASE_URL = 'http://localhost:4000/api/v1';

function extractSessionCookie(res) {
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const sessionCookie = cookies.find((c) => c && c.includes('textlove_session='));
  return sessionCookie ? sessionCookie.split(';')[0].trim() : '';
}

function extractOAuthStateCookie(res) {
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const stateCookie = cookies.find((c) => c && c.includes('textlove_oauth_state='));
  return stateCookie ? stateCookie.split(';')[0].trim() : '';
}

async function runLiveVerification() {
  console.log('=== Starting Two Independent Browser Profiles Live Verification ===\n');

  // -------------------------------------------------------------
  // PROFILE 1: Alice Smith
  // -------------------------------------------------------------
  console.log('1. Profile 1 initiating Google OAuth...');
  const urlResA = await fetch(`${BASE_URL}/auth/google/url`);
  assert.strictEqual(urlResA.status, 200, 'Profile 1 url status should be 200');
  const urlDataA = await urlResA.json();
  const stateCookieA = extractOAuthStateCookie(urlResA);
  assert.ok(stateCookieA, 'State cookie A must be set');
  assert.ok(urlDataA.authUrl.includes('prompt=select_account'), 'Auth URL must have prompt=select_account');
  assert.ok(urlDataA.authUrl.includes('response_type=code'), 'Auth URL must have response_type=code');
  console.log('  -> Auth URL generated with prompt=select_account');

  console.log('2. Profile 1 selecting Google Account: Alice Smith (alice.live@textlove.app)...');
  const callbackResA = await fetch(`${BASE_URL}/auth/google/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: stateCookieA,
    },
    body: JSON.stringify({
      idToken: 'mock_google_token_:sub_alice_live_101:alice.live%40textlove.app:Alice%20Smith',
      state: urlDataA.state,
    }),
  });
  if (callbackResA.status !== 200) {
    console.error('Callback A failed with:', callbackResA.status, await callbackResA.text());
  }
  assert.strictEqual(callbackResA.status, 200, 'Profile 1 callback should succeed');
  const authDataA = await callbackResA.json();
  const sessionCookieA = extractSessionCookie(callbackResA);
  assert.ok(sessionCookieA, 'Session cookie A must be issued');
  console.log(`  -> Profile 1 logged in successfully as: ${authDataA.user.displayName} (@${authDataA.user.username}) [ID: ${authDataA.user.id}]`);

  // Verify Profile 1 session
  const meResA = await fetch(`${BASE_URL}/auth/me`, {
    headers: { cookie: sessionCookieA },
  });
  assert.strictEqual(meResA.status, 200);
  const meDataA = await meResA.json();
  assert.strictEqual(meDataA.user.displayName, 'Alice Smith');
  console.log('  -> Profile 1 session validated via /auth/me');

  // -------------------------------------------------------------
  // PROFILE 2: Bob Martinez (Independent browser profile)
  // -------------------------------------------------------------
  console.log('\n3. Profile 2 (independent clean session) initiating Google OAuth...');
  const urlResB = await fetch(`${BASE_URL}/auth/google/url`);
  assert.strictEqual(urlResB.status, 200);
  const urlDataB = await urlResB.json();
  const stateCookieB = extractOAuthStateCookie(urlResB);
  assert.ok(stateCookieB);

  console.log('4. Profile 2 selecting Google Account: Bob Martinez (bob.live@textlove.app)...');
  const callbackResB = await fetch(`${BASE_URL}/auth/google/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: stateCookieB,
    },
    body: JSON.stringify({
      idToken: 'mock_google_token_:sub_bob_live_202:bob.live%40textlove.app:Bob%20Martinez',
      state: urlDataB.state,
    }),
  });
  assert.strictEqual(callbackResB.status, 200, 'Profile 2 callback should succeed');
  const authDataB = await callbackResB.json();
  const sessionCookieB = extractSessionCookie(callbackResB);
  assert.ok(sessionCookieB, 'Session cookie B must be issued');
  console.log(`  -> Profile 2 logged in successfully as: ${authDataB.user.displayName} (@${authDataB.user.username}) [ID: ${authDataB.user.id}]`);

  // Verify Profile 2 session
  const meResB = await fetch(`${BASE_URL}/auth/me`, {
    headers: { cookie: sessionCookieB },
  });
  assert.strictEqual(meResB.status, 200);
  const meDataB = await meResB.json();
  assert.strictEqual(meDataB.user.displayName, 'Bob Martinez');
  console.log('  -> Profile 2 session validated via /auth/me');

  // -------------------------------------------------------------
  // ISOLATION AND INDEPENDENCE ASSERTIONS
  // -------------------------------------------------------------
  console.log('\n5. Verifying complete account and session isolation:');
  assert.notStrictEqual(authDataA.user.id, authDataB.user.id, 'User IDs must be distinct');
  assert.notStrictEqual(authDataA.user.username, authDataB.user.username, 'Usernames must be distinct');
  assert.notStrictEqual(sessionCookieA, sessionCookieB, 'Session cookies must be distinct');
  console.log('  ✓ User A ID !== User B ID');
  console.log('  ✓ User A username !== User B username');
  console.log('  ✓ User A session !== User B session');

  // -------------------------------------------------------------
  // PROFILE 1 LOGOUT & REVOCATION
  // -------------------------------------------------------------
  console.log('\n6. Profile 1 logging out...');
  const logoutResA = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      cookie: sessionCookieA,
      'X-CSRF-Token': authDataA.csrfToken,
    },
  });
  assert.strictEqual(logoutResA.status, 200, 'Profile 1 logout should succeed');
  console.log('  -> Profile 1 session revoked.');

  // Verify Profile 1 is invalidated
  const afterLogoutResA = await fetch(`${BASE_URL}/auth/me`, {
    headers: { cookie: sessionCookieA },
  });
  assert.strictEqual(afterLogoutResA.status, 401, 'Profile 1 session must return 401 after logout');
  console.log('  ✓ Profile 1 session is strictly invalidated (401 Unauthorized)');

  // Verify Profile 2 is completely unaffected and remains valid
  const afterLogoutResB = await fetch(`${BASE_URL}/auth/me`, {
    headers: { cookie: sessionCookieB },
  });
  assert.strictEqual(afterLogoutResB.status, 200, 'Profile 2 session must remain valid');
  const meDataBRemaining = await afterLogoutResB.json();
  assert.strictEqual(meDataBRemaining.user.id, authDataB.user.id);
  console.log('  ✓ Profile 2 (Bob Martinez) remains active, authenticated, and unaffected!');

  console.log('\n🎉 ALL LIVE TWO-PROFILE VERIFICATION CHECKS PASSED SUCCESSFULLY!');
}

runLiveVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
