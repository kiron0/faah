import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

export const zshIntegrationSnippet = [
  "# VS Code / Cursor Terminal Shell Integration for Zsh",
  'if [[ "$TERM_PROGRAM" == "vscode" ]] && command -v code >/dev/null 2>&1; then',
  '  . "$(code --locate-shell-integration-path zsh 2>/dev/null)"',
  'elif [[ "$TERM_PROGRAM" == "cursor" ]] && command -v cursor >/dev/null 2>&1; then',
  '  . "$(cursor --locate-shell-integration-path zsh 2>/dev/null)"',
  "fi",
].join("\n");

export type FsPromisesLike = {
  readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  appendFile: (
    filePath: string,
    data: string,
    encoding: BufferEncoding,
  ) => Promise<void>;
};

export async function appendZshFixToFile(
  filePath = path.join(os.homedir(), ".zshrc"),
  fsModule: FsPromisesLike = fs.promises,
): Promise<{ status: "added" | "already-exists" }> {
  let existing = "";
  try {
    existing = await fsModule.readFile(filePath, "utf8");
  } catch {
    // File may not exist yet
  }

  if (existing.includes("locate-shell-integration-path zsh")) {
    return { status: "already-exists" };
  }

  const prefix =
    existing.length > 0 && !existing.endsWith("\n")
      ? "\n\n"
      : existing.length > 0
        ? "\n"
        : "";
  await fsModule.appendFile(
    filePath,
    prefix + zshIntegrationSnippet + "\n",
    "utf8",
  );
  return { status: "added" };
}

export async function handleZshFixCommand(
  targetFilePath?: string,
  fsModule?: FsPromisesLike,
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    "Faah: Would you like to add terminal shell integration to ~/.zshrc automatically?",
    "Add to ~/.zshrc",
    "Copy Snippet",
  );

  if (choice === "Add to ~/.zshrc") {
    try {
      const result = await appendZshFixToFile(targetFilePath, fsModule);
      if (result.status === "already-exists") {
        void vscode.window.showInformationMessage(
          "Faah: ~/.zshrc already contains shell integration. Restart terminal to apply.",
        );
        return;
      }
      void vscode.window.showInformationMessage(
        "Faah: Added shell integration to ~/.zshrc! Please restart your terminal.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(
        `Faah: Failed to write to ~/.zshrc (${message}). Copied snippet to clipboard instead.`,
      );
      if (vscode.env?.clipboard?.writeText) {
        await vscode.env.clipboard.writeText(zshIntegrationSnippet);
      }
    }
    return;
  }

  if (choice === "Copy Snippet") {
    if (vscode.env?.clipboard?.writeText) {
      await vscode.env.clipboard.writeText(zshIntegrationSnippet);
      void vscode.window.showInformationMessage(
        "Copied Zsh shell integration fix to clipboard! Add to ~/.zshrc and restart terminal.",
      );
    }
  }
}
