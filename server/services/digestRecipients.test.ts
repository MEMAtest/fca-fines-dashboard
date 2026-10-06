import { describe, expect, it } from 'vitest';
import { isDeliverableDigestEmail } from './digestRecipients.js';

describe('isDeliverableDigestEmail', () => {
  it('rejects the seeded placeholder addresses', () => {
    expect(isDeliverableDigestEmail('contact@treehill.placeholder')).toBe(false);
    expect(isDeliverableDigestEmail('contact@firstsentinelwealth.placeholder')).toBe(false);
    expect(isDeliverableDigestEmail('CONTACT@SAIBLE.PLACEHOLDER')).toBe(false);
  });

  it('rejects reserved test domains', () => {
    expect(isDeliverableDigestEmail('a@foo.test')).toBe(false);
    expect(isDeliverableDigestEmail('a@foo.invalid')).toBe(false);
    expect(isDeliverableDigestEmail('a@example.com')).toBe(false);
    expect(isDeliverableDigestEmail('a@mail.example')).toBe(false);
  });

  it('rejects empty and malformed input', () => {
    expect(isDeliverableDigestEmail('')).toBe(false);
    expect(isDeliverableDigestEmail(null)).toBe(false);
    expect(isDeliverableDigestEmail('not-an-email')).toBe(false);
    expect(isDeliverableDigestEmail('a@nodot')).toBe(false);
  });

  it('accepts real addresses', () => {
    expect(isDeliverableDigestEmail('contact@memaconsultants.com')).toBe(true);
    expect(isDeliverableDigestEmail(' Jane.Doe@hri-investments.co.uk ')).toBe(true);
  });
});
