export const SUPPORT_EMAIL = 'ops@nutasolutions.com';
export const PHONE_DISPLAY = '054 129 8861';
export const PHONE_TEL = '+233541298861';

export function mailtoHref(subject?: string): string {
  const base = `mailto:${SUPPORT_EMAIL}`;
  if (!subject) return base;
  return `${base}?subject=${encodeURIComponent(subject)}`;
}

export function telHref(): string {
  return `tel:${PHONE_TEL}`;
}
