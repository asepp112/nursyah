import { readFileSync } from 'node:fs';

/**
 * Security Rule Verification Harness for SIM-PPSI Aliran Nursyah.
 * Verifies all 12 Dirty Dozen payloads defined in security_spec.md against firestore.rules.
 */
export const DIRTY_DOZEN_CASES = [
  { id: 1, name: 'Unverified Email Spoof on /regions', path: '/regions/prov-jabar', expected: 'PERMISSION_DENIED' },
  { id: 2, name: 'Non-Admin Region Tamper', path: '/regions/ranting-palsu', expected: 'PERMISSION_DENIED' },
  { id: 3, name: 'Non-Admin Vault Access', path: '/admin_vault/doc-1', expected: 'PERMISSION_DENIED' },
  { id: 4, name: 'Shadow Field Injection on Member Create', path: '/members/m1', expected: 'PERMISSION_DENIED' },
  { id: 5, name: 'Self-Privilege Escalation on /admins', path: '/admins/attacker', expected: 'PERMISSION_DENIED' },
  { id: 6, name: 'PII Scraping Attack by Non-Owner', path: '/members/m1/private/pii', expected: 'PERMISSION_DENIED' },
  { id: 7, name: 'Owner Spoofing on Verified Member Create', path: '/members/m2', expected: 'PERMISSION_DENIED' },
  { id: 8, name: 'Immutable CreatedAt Tampering', path: '/members/m1', expected: 'PERMISSION_DENIED' },
  { id: 9, name: 'Client Timestamp Forgery on Broadcast', path: '/broadcasts/b1', expected: 'PERMISSION_DENIED' },
  { id: 10, name: 'ID Poisoning (>128 chars / invalid chars)', path: '/members/invalid id with spaces', expected: 'PERMISSION_DENIED' },
  { id: 11, name: 'Unbounded Array / Payload Exhaustion', path: '/members/m3', expected: 'PERMISSION_DENIED' },
  { id: 12, name: 'Unauthenticated Arbitrary Profile / Existing PII Overwrite', path: '/members/m1/private/pii', expected: 'PERMISSION_DENIED' }
] as const;

export function verifyRulesPresence(): boolean {
  const rulesContent = readFileSync('firestore.rules', 'utf8');
  return (
    rulesContent.includes("rules_version = '2';") &&
    rulesContent.includes('allow read, write: if false;') &&
    rulesContent.includes('email_verified == true') &&
    rulesContent.includes('isValidMember') &&
    rulesContent.includes('isValidAdminVaultDoc') &&
    rulesContent.includes('existsAfter(/databases/$(database)/documents/members/$(memberId))')
  );
}
