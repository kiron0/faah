let lastPlayedAt = 0;

export function tryAcquirePlaybackWindow(cooldownMs: number): boolean {
  const now = Date.now();
  if (now - lastPlayedAt < cooldownMs) return false;
  lastPlayedAt = now;
  return true;
}
