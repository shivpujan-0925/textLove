/**
 * Compute deterministic canonical conversation ID for a one-to-one pair
 */
export function getCanonicalConversationId(userA: string, userB: string): string {
  const u1 = userA.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  const u2 = userB.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
  const sorted = [u1, u2].sort();
  return `conv_${sorted[0]}_${sorted[1]}`;
}
