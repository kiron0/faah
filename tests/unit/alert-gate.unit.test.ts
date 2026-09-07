import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSnoozeAlerts,
  getAlertSuppressionReason,
  getRemainingPlaybackCooldownMs,
  getSnoozeRemainingMs,
  snoozeAlertsForMs,
  tryAcquirePlaybackWindow,
} from "../../src/alert-gate";
import type { RuntimeSettings } from "../../src/settings";

function createSettings(
  overrides: Partial<RuntimeSettings> = {},
): RuntimeSettings {
  return {
    enabled: true,
    monitorTerminal: true,
    monitorDiagnostics: true,
    diagnosticsSeverity: "error",
    terminalDetectionMode: "either",
    cooldownMs: 1500,
    terminalCooldownMs: 1500,
    diagnosticsCooldownMs: 1500,
    volumePercent: 70,
    showVisualNotifications: false,
    customSoundPath: "",
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    excludePresetIds: [],
    patterns: [/error/i],
    excludePatterns: [],
    ...overrides,
  };
}

describe("alert gate unit tests", () => {
  beforeEach(() => {
    clearSnoozeAlerts();
  });

  describe("snooze logic", () => {
    it("returns 0 snooze remaining by default", () => {
      expect(getSnoozeRemainingMs()).toBe(0);
    });

    it("sets snooze timestamp and calculates remaining ms correctly", () => {
      const now = 1_000_000;
      snoozeAlertsForMs(60_000);
      expect(getSnoozeRemainingMs(Date.now() + 30_000)).toBeGreaterThan(0);
      expect(getSnoozeRemainingMs(Date.now() + 70_000)).toBe(0);
    });

    it("clears snooze immediately when requested", () => {
      snoozeAlertsForMs(60_000);
      clearSnoozeAlerts();
      expect(getSnoozeRemainingMs()).toBe(0);
    });

    it("clamps negative snooze duration to 0", () => {
      snoozeAlertsForMs(-10_000);
      expect(getSnoozeRemainingMs()).toBe(0);
    });
  });

  describe("quiet hours calculation via getAlertSuppressionReason", () => {
    function makeDate(hours: number, minutes: number): number {
      const date = new Date(2026, 0, 15, hours, minutes, 0, 0);
      return date.getTime();
    }

    it("returns null when quiet hours is disabled even during quiet window", () => {
      const settings = createSettings({
        quietHoursEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      });

      expect(getAlertSuppressionReason(settings, makeDate(23, 0))).toBeNull();
      expect(getAlertSuppressionReason(settings, makeDate(3, 0))).toBeNull();
    });

    it("detects overnight quiet hours correctly", () => {
      const settings = createSettings({
        quietHoursEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      });

      // Active cases
      expect(getAlertSuppressionReason(settings, makeDate(22, 0))).toBe(
        "quietHours",
      );
      expect(getAlertSuppressionReason(settings, makeDate(23, 30))).toBe(
        "quietHours",
      );
      expect(getAlertSuppressionReason(settings, makeDate(0, 0))).toBe(
        "quietHours",
      );
      expect(getAlertSuppressionReason(settings, makeDate(4, 15))).toBe(
        "quietHours",
      );
      expect(getAlertSuppressionReason(settings, makeDate(6, 59))).toBe(
        "quietHours",
      );

      // Inactive cases
      expect(getAlertSuppressionReason(settings, makeDate(7, 0))).toBeNull();
      expect(getAlertSuppressionReason(settings, makeDate(7, 1))).toBeNull();
      expect(getAlertSuppressionReason(settings, makeDate(12, 0))).toBeNull();
      expect(getAlertSuppressionReason(settings, makeDate(21, 59))).toBeNull();
    });

    it("detects same-day daytime quiet hours correctly", () => {
      const settings = createSettings({
        quietHoursEnabled: true,
        quietHoursStart: "13:00",
        quietHoursEnd: "17:00",
      });

      // Active cases
      expect(getAlertSuppressionReason(settings, makeDate(13, 0))).toBe(
        "quietHours",
      );
      expect(getAlertSuppressionReason(settings, makeDate(15, 30))).toBe(
        "quietHours",
      );
      expect(getAlertSuppressionReason(settings, makeDate(16, 59))).toBe(
        "quietHours",
      );

      // Inactive cases
      expect(getAlertSuppressionReason(settings, makeDate(12, 59))).toBeNull();
      expect(getAlertSuppressionReason(settings, makeDate(17, 0))).toBeNull();
      expect(getAlertSuppressionReason(settings, makeDate(19, 0))).toBeNull();
      expect(getAlertSuppressionReason(settings, makeDate(8, 0))).toBeNull();
    });

    it("treats equal start and end time as 24-hour quiet hours", () => {
      const settings = createSettings({
        quietHoursEnabled: true,
        quietHoursStart: "12:00",
        quietHoursEnd: "12:00",
      });

      expect(getAlertSuppressionReason(settings, makeDate(12, 0))).toBe(
        "quietHours",
      );
      expect(getAlertSuppressionReason(settings, makeDate(3, 0))).toBe(
        "quietHours",
      );
      expect(getAlertSuppressionReason(settings, makeDate(18, 0))).toBe(
        "quietHours",
      );
    });

    it("prioritizes snooze over quiet hours", () => {
      const settings = createSettings({
        quietHoursEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      });

      snoozeAlertsForMs(60_000);
      const nowDuringQuietHours = Date.now();
      expect(getAlertSuppressionReason(settings, nowDuringQuietHours)).toBe(
        "snoozed",
      );
    });
  });

  describe("cooldown & playback window acquisition", () => {
    it("reports remaining cooldown after acquiring a window", async () => {
      vi.resetModules();
      const gate = await import("../../src/alert-gate");
      const cooldownMs = 2000;
      const acquired = gate.tryAcquirePlaybackWindow(cooldownMs, "test-scope");
      expect(acquired).toBe(true);

      const remaining = gate.getRemainingPlaybackCooldownMs(
        cooldownMs,
        "test-scope",
      );
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(cooldownMs);
    });

    it("blocks immediate re-acquisition within cooldown window", async () => {
      vi.resetModules();
      const gate = await import("../../src/alert-gate");
      const cooldownMs = 5000;
      const first = gate.tryAcquirePlaybackWindow(cooldownMs, "scope-a");
      const second = gate.tryAcquirePlaybackWindow(cooldownMs, "scope-a");

      expect(first).toBe(true);
      expect(second).toBe(false);
    });

    it("allows acquisition after cooldown elapsed", async () => {
      vi.useFakeTimers();
      try {
        vi.resetModules();
        const gate = await import("../../src/alert-gate");
        const cooldownMs = 1000;
        const first = gate.tryAcquirePlaybackWindow(cooldownMs, "timer-scope");
        expect(first).toBe(true);

        vi.advanceTimersByTime(cooldownMs + 50);

        const second = gate.tryAcquirePlaybackWindow(cooldownMs, "timer-scope");
        expect(second).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
