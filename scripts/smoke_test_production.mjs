#!/usr/bin/env node
/**
 * textLove Production Deployment Smoke Test Script
 *
 * Verifies:
 * 1. API Health & Operational Metrics (/api/v1/health)
 * 2. Privacy & Zero-Retention Invariant Flags
 * 3. OAuth Initiation Endpoint (/api/v1/auth/google/url)
 * 4. PWA Manifest & Service Worker Static Assets
 * 5. HTTP Security Headers
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

console.log('='.repeat(70));
console.log('textLove Production Smoke Test Suite');
console.log(`Backend Target : ${BACKEND_URL}`);
console.log(`Frontend Target: ${FRONTEND_URL}`);
console.log('='.repeat(70));

let passes = 0;
let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passes++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failures++;
  }
}

async function testHealthEndpoint() {
  console.log('\n1. Checking Operational Health Endpoint...');
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/health`);
    assert(res.status === 200, `Health check returned status 200 (got ${res.status})`);

    const data = await res.json();
    assert(data.status === 'healthy', `Status is 'healthy' (got '${data.status}')`);
    assert(typeof data.uptimeSeconds === 'number', `Uptime is reported (${data.uptimeSeconds}s)`);
    assert(data.system?.memory?.heapUsedMB !== undefined, 'Memory usage is tracked');
    assert(data.invariants?.zeroMessageRetention === true, 'Invariant zeroMessageRetention === true');
    assert(data.invariants?.liveOnlyMessaging === true, 'Invariant liveOnlyMessaging === true');
    assert(data.invariants?.e2eeMandatory === true, 'Invariant e2eeMandatory === true');
    assert(data.invariants?.authoritativeInactivityExpiryMinutes === 30, 'Invariant 30-min inactivity expiry');
  } catch (err) {
    assert(false, `Health check failed with error: ${err.message}`);
  }
}

async function testSecurityHeaders() {
  console.log('\n2. Checking Security Headers...');
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/health`);
    const headers = res.headers;

    assert(
      headers.get('x-content-type-options') === 'nosniff',
      'X-Content-Type-Options is nosniff'
    );
    assert(
      headers.get('x-frame-options') === 'DENY',
      'X-Frame-Options is DENY'
    );
  } catch (err) {
    assert(false, `Security header check failed: ${err.message}`);
  }
}

async function testOAuthEndpoint() {
  console.log('\n3. Checking OAuth Initiation Endpoint...');
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/auth/google/url`);
    assert(res.status === 200, `OAuth endpoint returned status 200 (got ${res.status})`);

    const data = await res.json();
    assert(typeof data.authUrl === 'string' && data.authUrl.length > 0, 'OAuth authUrl generated');
    assert(typeof data.state === 'string' && data.state.length >= 32, 'OAuth anti-CSRF state token generated');
  } catch (err) {
    assert(false, `OAuth check failed: ${err.message}`);
  }
}

async function testPwaAssets() {
  console.log('\n4. Checking PWA Static Assets & Manifest...');
  const assets = [
    { path: '/manifest.webmanifest', contentType: 'application/manifest+json' },
    { path: '/sw.js', contentType: 'javascript' },
    { path: '/icons/icon-192.svg', contentType: 'image/svg+xml' },
    { path: '/icons/icon-512.svg', contentType: 'image/svg+xml' },
    { path: '/icons/icon-maskable.svg', contentType: 'image/svg+xml' },
  ];

  for (const asset of assets) {
    try {
      const res = await fetch(`${FRONTEND_URL}${asset.path}`);
      assert(res.status === 200, `Asset ${asset.path} returns HTTP 200 (got ${res.status})`);
      const cType = res.headers.get('content-type') || '';
      assert(
        cType.includes(asset.contentType) || cType.includes('text/xml') || cType.includes('svg') || cType.includes('json') || cType.includes('javascript'),
        `Asset ${asset.path} Content-Type valid (${cType})`
      );
    } catch (err) {
      assert(false, `PWA asset ${asset.path} failed: ${err.message}`);
    }
  }
}

async function run() {
  await testHealthEndpoint();
  await testSecurityHeaders();
  await testOAuthEndpoint();
  await testPwaAssets();

  console.log('\n' + '='.repeat(70));
  console.log(`Smoke Test Results: ${passes} Passed, ${failures} Failed`);
  console.log('='.repeat(70));

  if (failures > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during smoke tests:', err);
  process.exit(1);
});
