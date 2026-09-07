import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {},
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
}));

import {
  defaultStoredSettings,
  excludePatternPresetDefinitions,
  toRuntimeSettings,
} from "../../src/settings";

describe("settings patterns & matching unit tests", () => {
  const runtime = toRuntimeSettings(defaultStoredSettings);

  function matchesAny(text: string): boolean {
    return runtime.patterns.some((p) => p.test(text));
  }

  function isExcludedAny(text: string): boolean {
    return runtime.excludePatterns.some((p) => p.test(text));
  }

  describe("built-in error pattern matches", () => {
    it("matches 'error' with word boundaries", () => {
      expect(matchesAny("Build error occurred")).toBe(true);
      expect(matchesAny("ERROR: compilation failed")).toBe(true);
      expect(matchesAny("terrorism")).toBe(false);
    });

    it("matches 'failed'", () => {
      expect(matchesAny("Task failed successfully")).toBe(true);
      expect(matchesAny("FAILED: test suite")).toBe(true);
    });

    it("matches 'failure'", () => {
      expect(matchesAny("Job failure detected")).toBe(true);
      expect(matchesAny("FAILURE in step 2")).toBe(true);
    });

    it("matches 'fatal'", () => {
      expect(matchesAny("fatal: cannot open file")).toBe(true);
      expect(matchesAny("FATAL error in worker")).toBe(true);
    });

    it("matches 'exception'", () => {
      expect(matchesAny("Exception in thread 'main'")).toBe(true);
      expect(matchesAny("An uncaught exception was thrown")).toBe(true);
    });

    it("matches 'critical'", () => {
      expect(matchesAny("critical system event")).toBe(true);
      expect(matchesAny("CRITICAL failure")).toBe(true);
    });

    it("matches 'err:' and 'error!'", () => {
      expect(matchesAny("err: timeout")).toBe(true);
      expect(matchesAny("error! something broke")).toBe(true);
      expect(matchesAny("error]")).toBe(true);
    });

    it("matches 'uncaught'", () => {
      expect(matchesAny("uncaught exception in thread")).toBe(true);
      expect(matchesAny("Uncaught Error: boom")).toBe(true);
    });

    it("matches 'UnhandledPromiseRejection'", () => {
      expect(matchesAny("UnhandledPromiseRejection: fetch failed")).toBe(true);
    });

    it("matches Python 'Traceback (most recent call last):'", () => {
      expect(matchesAny("Traceback (most recent call last):")).toBe(true);
    });

    it("matches 'SyntaxError'", () => {
      expect(matchesAny("SyntaxError: Unexpected token <")).toBe(true);
    });

    it("matches 'TypeError'", () => {
      expect(matchesAny("TypeError: cannot read property of undefined")).toBe(
        true,
      );
    });

    it("matches 'ReferenceError'", () => {
      expect(matchesAny("ReferenceError: foo is not defined")).toBe(true);
    });

    it("matches 'RangeError'", () => {
      expect(matchesAny("RangeError: Maximum call stack size exceeded")).toBe(
        true,
      );
    });

    it("matches 'module not found'", () => {
      expect(matchesAny("module not found: react")).toBe(true);
    });

    it("matches 'cannot find module'", () => {
      expect(matchesAny("cannot find module 'lodash'")).toBe(true);
    });

    it("matches 'No module named'", () => {
      expect(matchesAny("No module named 'requests'")).toBe(true);
    });

    it("matches 'segmentation fault'", () => {
      expect(matchesAny("Segmentation fault (core dumped)")).toBe(true);
    });

    it("matches 'core dumped'", () => {
      expect(matchesAny("Process 1234 core dumped")).toBe(true);
    });

    it("matches 'panic:' and 'panicked at'", () => {
      expect(matchesAny("panic: runtime error")).toBe(true);
      expect(matchesAny("thread 'main' panicked at 'assertion failed'")).toBe(
        true,
      );
    });

    it("matches '^caused by:'", () => {
      expect(matchesAny("Caused by: Connection reset")).toBe(true);
      expect(matchesAny("  caused by: I/O failure")).toBe(true);
    });

    it("matches 'permission denied'", () => {
      expect(matchesAny("bash: /bin/secret: Permission denied")).toBe(true);
    });

    it("matches 'access denied'", () => {
      expect(matchesAny("EACCES: access denied to /root")).toBe(true);
    });

    it("matches 'command not found'", () => {
      expect(matchesAny("zsh: command not found: vitest")).toBe(true);
    });

    it("matches 'timeout' and 'timeout exceeded'", () => {
      expect(matchesAny("operation timeout exceeded")).toBe(true);
      expect(matchesAny("request timeout")).toBe(true);
    });

    it("matches connection errors", () => {
      expect(matchesAny("connection refused: 127.0.0.1:8080")).toBe(true);
      expect(matchesAny("connection reset by peer")).toBe(true);
      expect(matchesAny("connection timed out")).toBe(true);
    });

    it("matches HTTP 5xx errors", () => {
      expect(matchesAny("HTTP 500 Internal Server Error")).toBe(true);
      expect(matchesAny("Server responded with http 502")).toBe(true);
      expect(matchesAny("http 503 service unavailable")).toBe(true);
      expect(matchesAny("http 200 ok")).toBe(false);
    });

    it("does not match benign compiler output", () => {
      expect(matchesAny("Compiled successfully in 120ms")).toBe(false);
      expect(matchesAny("ready - started server on 0.0.0.0:3000")).toBe(false);
      expect(matchesAny("✨ Done in 1.45s.")).toBe(false);
    });
  });

  describe("exclusion patterns & presets", () => {
    it("excludes conventional commits in commit message format", () => {
      expect(isExcludedAny("fix: handle syntax error in parser")).toBe(true);
      expect(isExcludedAny("feat(auth): prevent login error")).toBe(true);
      expect(isExcludedAny("docs: document error codes")).toBe(true);
      expect(
        isExcludedAny("[main 1a2b3c4] fix: prevent crash on null pointer"),
      ).toBe(true);
    });

    it("does not exclude non-commit error lines", () => {
      expect(isExcludedAny("error: variable not declared")).toBe(false);
      expect(isExcludedAny("Uncaught TypeError: bad object")).toBe(false);
    });

    it("supports testSnapshots preset patterns", () => {
      const snapshotPreset = excludePatternPresetDefinitions.find(
        (p) => p.id === "testSnapshots",
      );
      expect(snapshotPreset).toBeDefined();
      const regexes = snapshotPreset!.patterns.map((p) => new RegExp(p, "i"));

      const matchSnapshot = (text: string) => regexes.some((r) => r.test(text));
      expect(matchSnapshot("PASS tests/error-handling.test.ts")).toBe(true);
      expect(matchSnapshot("SNAPSHOT error output matches")).toBe(true);
      expect(matchSnapshot("Expected error message to match")).toBe(true);
      expect(matchSnapshot("Received error code 400")).toBe(true);
      expect(matchSnapshot("real fatal error")).toBe(false);
    });

    it("supports lintSummaries preset patterns", () => {
      const lintPreset = excludePatternPresetDefinitions.find(
        (p) => p.id === "lintSummaries",
      );
      expect(lintPreset).toBeDefined();
      const regexes = lintPreset!.patterns.map((p) => new RegExp(p, "i"));

      const matchLint = (text: string) => regexes.some((r) => r.test(text));
      expect(matchLint("0 errors, 2 warnings")).toBe(true);
      expect(matchLint("1 error, 0 warnings")).toBe(true);
      expect(matchLint("✖ 2 problems (1 error, 1 warning)")).toBe(true);
      expect(matchLint("✖ 0 problems (0 errors, 0 warnings)")).toBe(true);
      expect(matchLint("SyntaxError on line 42")).toBe(false);
    });

    it("supports packageManagerAdvisories preset patterns", () => {
      const pkgPreset = excludePatternPresetDefinitions.find(
        (p) => p.id === "packageManagerAdvisories",
      );
      expect(pkgPreset).toBeDefined();
      const regexes = pkgPreset!.patterns.map((p) => new RegExp(p, "i"));

      const matchPkg = (text: string) => regexes.some((r) => r.test(text));
      expect(matchPkg("npm audit found 0 vulnerabilities")).toBe(true);
      expect(matchPkg("yarn advisory report completed")).toBe(true);
      expect(matchPkg("pnpm audit report")).toBe(true);
      expect(matchPkg("found 3 vulnerabilities")).toBe(true);
      expect(matchPkg("12 packages are looking for funding")).toBe(true);
      expect(matchPkg("npm ERR! code ENOENT")).toBe(false);
    });

    it("combines multiple preset patterns in toRuntimeSettings", () => {
      const multiPresetRuntime = toRuntimeSettings({
        ...defaultStoredSettings,
        excludePresetIds: [
          "conventionalCommits",
          "testSnapshots",
          "lintSummaries",
          "packageManagerAdvisories",
        ],
      });

      expect(multiPresetRuntime.excludePatterns.length).toBeGreaterThan(
        defaultStoredSettings.excludePatterns.length,
      );
    });
  });

  describe("pattern compilation robustness", () => {
    it("handles invalid regex gracefully without throwing", () => {
      const safeRuntime = toRuntimeSettings({
        ...defaultStoredSettings,
        patternMode: "override",
        patterns: ["[unclosed-bracket", "\\bvalid_error\\b", "*invalid-start"],
        excludePatterns: ["(unclosed-group", "^valid_exclude$"],
      });

      expect(safeRuntime.patterns.length).toBe(1);
      expect(safeRuntime.patterns[0].test("valid_error")).toBe(true);
      expect(safeRuntime.excludePatterns.length).toBe(1);
      expect(safeRuntime.excludePatterns[0].test("valid_exclude")).toBe(true);
    });

    it("falls back to default compiled patterns when patterns array is empty in override mode", () => {
      const emptyRuntime = toRuntimeSettings({
        ...defaultStoredSettings,
        patternMode: "override",
        patterns: [],
      });

      expect(emptyRuntime.patterns.length).toBeGreaterThan(0);
      expect(emptyRuntime.patterns.some((p) => p.test("error"))).toBe(true);
    });
  });
});
