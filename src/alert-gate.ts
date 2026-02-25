let lastPlaybackAtMs = 0;

export function tryAcquirePlaybackWindow(cooldownMs: number): boolean {
  const nowMs = Date.now();
  if (nowMs - lastPlaybackAtMs < cooldownMs) return false;
  lastPlaybackAtMs = nowMs;
  return true;
}
