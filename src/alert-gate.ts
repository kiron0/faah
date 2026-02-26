import type { RuntimeSettings } from "./settings";

const sharedWindowMs = 250;
const globalScope = "__global__";
const lastPlaybackAtMsByScope = new Map<string, number>();
let lastPlaybackScope: string | null = null;
let snoozeUntilMs = 0;

export type AlertSuppressionReason = "snoozed" | "quietHours" | null;

function toMinutesSinceMidnight(time: string): number {
  const [hoursText, minutesText] = time.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return 0;
  return hours * 60 + minutes;
}

function isNowWithinQuietHours(settings: RuntimeSettings, nowMs: number): boolean {
  if (!settings.quietHoursEnabled) return false;

  const startMinutes = toMinutesSinceMidnight(settings.quietHoursStart);
  const endMinutes = toMinutesSinceMidnight(settings.quietHoursEnd);
  if (startMinutes === endMinutes) return true;

  const now = new Date(nowMs);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export function getRemainingPlaybackCooldownMs(
  cooldownMs: number,
  scope = globalScope,
  nowMs = Date.now(),
): number {
  const scopedElapsedMs = nowMs - (lastPlaybackAtMsByScope.get(scope) ?? 0);
  const scopedRemainingMs = Math.max(0, cooldownMs - scopedElapsedMs);
  const sharedElapsedMs = nowMs - (lastPlaybackAtMsByScope.get(globalScope) ?? 0);
  const shouldApplySharedWindow = lastPlaybackScope !== null && lastPlaybackScope !== scope;
  const sharedRemainingMs = shouldApplySharedWindow
    ? Math.max(0, sharedWindowMs - sharedElapsedMs)
    : 0;
  return Math.max(scopedRemainingMs, sharedRemainingMs);
}

export function getSnoozeRemainingMs(nowMs = Date.now()): number {
  return Math.max(0, snoozeUntilMs - nowMs);
}

export function snoozeAlertsForMs(durationMs: number): number {
  const nowMs = Date.now();
  const clampedDurationMs = Math.max(0, Math.floor(durationMs));
  snoozeUntilMs = nowMs + clampedDurationMs;
  return snoozeUntilMs;
}

export function clearSnoozeAlerts(): void {
  snoozeUntilMs = 0;
}

export function getAlertSuppressionReason(
  settings: RuntimeSettings,
  nowMs = Date.now(),
): AlertSuppressionReason {
  if (getSnoozeRemainingMs(nowMs) > 0) return "snoozed";
  if (isNowWithinQuietHours(settings, nowMs)) return "quietHours";
  return null;
}

export function tryAcquirePlaybackWindow(cooldownMs: number, scope = globalScope): boolean {
  const nowMs = Date.now();
  if (getRemainingPlaybackCooldownMs(cooldownMs, scope, nowMs) > 0) return false;
  lastPlaybackAtMsByScope.set(scope, nowMs);
  lastPlaybackAtMsByScope.set(globalScope, nowMs);
  lastPlaybackScope = scope;
  return true;
}
