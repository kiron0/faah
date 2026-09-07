import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  window: {
    showInformationMessage: vi.fn(async () => undefined),
    showErrorMessage: vi.fn(async () => undefined),
  },
  env: {
    clipboard: {
      writeText: vi.fn(async () => undefined),
    },
  },
}));

import {
  appendZshFixToFile,
  handleZshFixCommand,
  zshIntegrationSnippet,
} from "../../src/zsh-fix";

describe("zsh-fix unit tests", () => {
  describe("appendZshFixToFile", () => {
    it("appends snippet to an empty or non-existent file", async () => {
      let writtenData = "";
      const fakeFs = {
        readFile: vi.fn(async () => {
          throw new Error("ENOENT");
        }),
        appendFile: vi.fn(async (_path: string, data: string) => {
          writtenData = data;
        }),
      };

      const result = await appendZshFixToFile("/fake/.zshrc", fakeFs);

      expect(result.status).toBe("added");
      expect(writtenData).toContain(
        "# VS Code / Cursor Terminal Shell Integration for Zsh",
      );
      expect(fakeFs.appendFile).toHaveBeenCalledTimes(1);
    });

    it("appends with double newline prefix when existing file lacks trailing newline", async () => {
      let writtenData = "";
      const fakeFs = {
        readFile: vi.fn(async () => "export FOO=bar"),
        appendFile: vi.fn(async (_path: string, data: string) => {
          writtenData = data;
        }),
      };

      const result = await appendZshFixToFile("/fake/.zshrc", fakeFs);

      expect(result.status).toBe("added");
      expect(writtenData.startsWith("\n\n")).toBe(true);
    });

    it("does not re-append if snippet is already present in file", async () => {
      const fakeFs = {
        readFile: vi.fn(
          async () =>
            'export PATH="/bin"\n. "$(code --locate-shell-integration-path zsh 2>/dev/null)"\n',
        ),
        appendFile: vi.fn(async () => {}),
      };

      const result = await appendZshFixToFile("/fake/.zshrc", fakeFs);

      expect(result.status).toBe("already-exists");
      expect(fakeFs.appendFile).not.toHaveBeenCalled();
    });
  });

  describe("handleZshFixCommand", () => {
    it("handles 'Add to ~/.zshrc' user selection with success", async () => {
      vi.resetModules();
      const showInformationMessage = vi
        .fn()
        .mockResolvedValueOnce("Add to ~/.zshrc");
      const showErrorMessage = vi.fn();
      const writeText = vi.fn();

      vi.doMock("vscode", () => ({
        window: { showInformationMessage, showErrorMessage },
        env: { clipboard: { writeText } },
      }));

      const fakeFs = {
        readFile: vi.fn(async () => "export ZSH=1\n"),
        appendFile: vi.fn(async () => {}),
      };

      const zshFix = await import("../../src/zsh-fix");
      await zshFix.handleZshFixCommand("/fake/.zshrc", fakeFs);

      expect(fakeFs.appendFile).toHaveBeenCalledTimes(1);
      expect(showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("Added shell integration to ~/.zshrc"),
      );
    });

    it("notifies when fix already exists in ~/.zshrc", async () => {
      vi.resetModules();
      const showInformationMessage = vi
        .fn()
        .mockResolvedValueOnce("Add to ~/.zshrc");
      const showErrorMessage = vi.fn();

      vi.doMock("vscode", () => ({
        window: { showInformationMessage, showErrorMessage },
      }));

      const fakeFs = {
        readFile: vi.fn(
          async () => "code --locate-shell-integration-path zsh\n",
        ),
        appendFile: vi.fn(async () => {}),
      };

      const zshFix = await import("../../src/zsh-fix");
      await zshFix.handleZshFixCommand("/fake/.zshrc", fakeFs);

      expect(fakeFs.appendFile).not.toHaveBeenCalled();
      expect(showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("already contains shell integration"),
      );
    });

    it("falls back to copying snippet when file write fails", async () => {
      vi.resetModules();
      const showInformationMessage = vi
        .fn()
        .mockResolvedValueOnce("Add to ~/.zshrc");
      const showErrorMessage = vi.fn();
      const writeText = vi.fn();

      vi.doMock("vscode", () => ({
        window: { showInformationMessage, showErrorMessage },
        env: { clipboard: { writeText } },
      }));

      const fakeFs = {
        readFile: vi.fn(async () => ""),
        appendFile: vi.fn(async () => {
          throw new Error("EACCES: permission denied");
        }),
      };

      const zshFix = await import("../../src/zsh-fix");
      await zshFix.handleZshFixCommand("/fake/.zshrc", fakeFs);

      expect(showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to write to ~/.zshrc"),
      );
      expect(writeText).toHaveBeenCalledWith(zshIntegrationSnippet);
    });

    it("copies snippet directly when user selects 'Copy Snippet'", async () => {
      vi.resetModules();
      const showInformationMessage = vi
        .fn()
        .mockResolvedValueOnce("Copy Snippet");
      const writeText = vi.fn();

      vi.doMock("vscode", () => ({
        window: { showInformationMessage },
        env: { clipboard: { writeText } },
      }));

      const zshFix = await import("../../src/zsh-fix");
      await zshFix.handleZshFixCommand();

      expect(writeText).toHaveBeenCalledWith(zshIntegrationSnippet);
      expect(showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining(
          "Copied Zsh shell integration fix to clipboard",
        ),
      );
    });

    it("does nothing when user dismisses the dialog", async () => {
      vi.resetModules();
      const showInformationMessage = vi.fn().mockResolvedValueOnce(undefined);
      const writeText = vi.fn();

      vi.doMock("vscode", () => ({
        window: { showInformationMessage },
        env: { clipboard: { writeText } },
      }));

      const fakeFs = {
        readFile: vi.fn(async () => ""),
        appendFile: vi.fn(async () => {}),
      };

      const zshFix = await import("../../src/zsh-fix");
      await zshFix.handleZshFixCommand("/fake/.zshrc", fakeFs);

      expect(fakeFs.appendFile).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    });
  });
});
