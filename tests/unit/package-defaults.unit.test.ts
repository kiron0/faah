import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

async function loadDefaults() {
  vi.resetModules();
  vi.doMock("vscode", () => ({}));
  return import("../../src/settings");
}

function readConfigurationProperties(): Record<
  string,
  { default?: unknown; pattern?: string }
> {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
  ) as {
    contributes: {
      configuration: {
        properties: Record<string, { default?: unknown; pattern?: string }>;
      };
    };
  };
  return packageJson.contributes.configuration.properties;
}

describe("extension package defaults", () => {
  it("matches the runtime defaults and contains valid regex patterns", async () => {
    const settings = await loadDefaults();
    const properties = readConfigurationProperties();

    expect(properties["faah.patterns"].default).toEqual(
      settings.defaultStoredSettings.patterns,
    );
    expect(properties["faah.excludePatterns"].default).toEqual(
      settings.defaultStoredSettings.excludePatterns,
    );

    for (const pattern of settings.defaultStoredSettings.patterns) {
      expect(() => new RegExp(pattern, "i")).not.toThrow();
    }
    for (const pattern of settings.defaultStoredSettings.excludePatterns) {
      expect(() => new RegExp(pattern, "i")).not.toThrow();
    }
    for (const key of ["faah.quietHoursStart", "faah.quietHoursEnd"]) {
      const pattern = properties[key].pattern ?? "";
      expect(pattern).toBe("^([01]\\d|2[0-3]):([0-5]\\d)$");
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });
});
