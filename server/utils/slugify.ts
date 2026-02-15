import crypto from 'node:crypto';

export function slugify(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) return 'item';

  const slug = raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'item';
}

export function shortHash(input: string): string {
  return crypto.createHash('sha1').update(String(input ?? '')).digest('hex').slice(0, 6);
}

export function firmSlug(firmName: string): string {
  return `${slugify(firmName)}-${shortHash(firmName)}`;
}

export function hubSlug(label: string): string {
  return slugify(label.replace(/_/g, ' '));
}

