/** Public contact address for the legal pages (Meta App Review requires a real one). */
export function supportEmail(): string | null {
  const v = process.env.SUPPORT_EMAIL?.trim();
  return v ? v : null;
}
