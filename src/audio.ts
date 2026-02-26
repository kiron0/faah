import { ExecException, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import playSound from "play-sound";
import * as vscode from "vscode";

import type { RuntimeSettings, StoredSettings } from "./settings";

const fixedSoundFile = "faah.wav";
const isWindows = process.platform === "win32";
const isLinux = process.platform === "linux";
const linuxPreferredPlayers = [
  "paplay",
  "ffplay",
  "mpv",
  "cvlc",
  "mplayer",
  "mpg123",
  "mpg321",
  "play",
  "aplay",
];
const player = playSound(
  isLinux ? ({ players: linuxPreferredPlayers as any } as any) : {},
);

let hasWarnedVolumeFallback = false;
let hasWarnedWindowsFallback = false;
let hasWarnedLinuxMissingPlayer = false;
let lastMissingSoundWarningPath: string | null = null;
let lastInvalidCustomSoundWarningPath: string | null = null;

type PlayMethodOptionsLoose = Record<string, Array<string | number>> & {
  timeout?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function showMissingSoundFileWarning(soundPath: string): void {
  if (lastMissingSoundWarningPath === soundPath) return;
  lastMissingSoundWarningPath = soundPath;

  if (path.basename(soundPath) === fixedSoundFile) {
    vscode.window.showWarningMessage(
      `Faah could not find audio file: ${fixedSoundFile} in media/.`,
    );
    return;
  }

  vscode.window.showWarningMessage(
    `Faah could not find audio file at: ${soundPath}`,
  );
}

function showInvalidCustomSoundFallbackWarning(
  rawCustomSoundPath: string,
  resolvedCustomSoundPath: string,
): void {
  if (lastInvalidCustomSoundWarningPath === resolvedCustomSoundPath) return;
  lastInvalidCustomSoundWarningPath = resolvedCustomSoundPath;
  vscode.window.showWarningMessage(
    `Faah custom sound not found: ${rawCustomSoundPath}. Using default ${fixedSoundFile}.`,
  );
}

function warnWindowsFallbackOnce(message: string): void {
  if (hasWarnedWindowsFallback) return;
  hasWarnedWindowsFallback = true;
  console.warn(message);
}

function warnLinuxPlayerMissingOnce(errorText: string): void {
  if (!isLinux || hasWarnedLinuxMissingPlayer) return;
  if (
    !errorText.toLowerCase().includes("couldn't find a suitable audio player")
  )
    return;

  hasWarnedLinuxMissingPlayer = true;
  vscode.window.showWarningMessage(
    "Faah could not find a Linux audio player. Install one of: ffmpeg (ffplay), mpv, mpg123, vlc, or sox.",
  );
}

function resolveCustomSoundPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const withExpandedHome =
    trimmed === "~"
      ? process.env.HOME ?? trimmed
      : trimmed.startsWith("~/")
        ? path.join(process.env.HOME ?? "~", trimmed.slice(2))
        : trimmed;

  if (path.isAbsolute(withExpandedHome)) return withExpandedHome;
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) return path.resolve(workspaceRoot, withExpandedHome);
  return path.resolve(withExpandedHome);
}

export function resolveSoundPath(
  context: vscode.ExtensionContext,
  settings?: Pick<StoredSettings, "customSoundPath">,
): string {
  const defaultSoundPath = context.asAbsolutePath(path.join("media", fixedSoundFile));
  const rawCustomSoundPath = settings?.customSoundPath?.trim() ?? "";
  if (rawCustomSoundPath.length > 0) {
    const resolvedCustomSoundPath = resolveCustomSoundPath(rawCustomSoundPath);
    if (resolvedCustomSoundPath && fs.existsSync(resolvedCustomSoundPath)) {
      return resolvedCustomSoundPath;
    }

    showInvalidCustomSoundFallbackWarning(rawCustomSoundPath, resolvedCustomSoundPath);
  }

  if (!fs.existsSync(defaultSoundPath)) {
    showMissingSoundFileWarning(defaultSoundPath);
  }

  return defaultSoundPath;
}

function playWithoutVolume(soundPath: string): void {
  player.play(soundPath, (err?: ExecException) => {
    if (!err) return;
    const errText = err.message ?? String(err);
    warnLinuxPlayerMissingOnce(errText);
    console.warn(`Failed to play sound: ${errText}`);
  });
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function playWindowsBeepFallback(volumePercent: number): void {
  if (volumePercent <= 0) return;

  const frequency = 880;
  const duration = 180;
  const script = `[console]::Beep(${frequency}, ${duration})`;
  const fallbackProcess = spawn(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  fallbackProcess.on("error", (err) => {
    warnWindowsFallbackOnce(`Windows fallback beep failed: ${err.message}`);
  });
}

function playOnWindows(soundPath: string, settings: RuntimeSettings): void {
  const escapedSoundPath = escapePowerShellSingleQuoted(soundPath);
  const volumeRatio = clamp(settings.volumePercent, 0, 100) / 100;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName PresentationCore",
    `$path = '${escapedSoundPath}'`,
    'if (-not (Test-Path -LiteralPath $path)) { throw "Sound file not found" }',
    "$player = New-Object System.Windows.Media.MediaPlayer",
    `$player.Volume = ${volumeRatio.toFixed(2)}`,
    "$player.Open([Uri]::new($path))",
    "$loadTimeoutAt = (Get-Date).AddSeconds(5)",
    "while (-not $player.NaturalDuration.HasTimeSpan -and (Get-Date) -lt $loadTimeoutAt) { Start-Sleep -Milliseconds 50 }",
    "$player.Play()",
    "$waitMs = 2000",
    "if ($player.NaturalDuration.HasTimeSpan) {",
    "  $waitMs = [Math]::Min(15000, [Math]::Max(300, [int]([Math]::Ceiling($player.NaturalDuration.TimeSpan.TotalMilliseconds) + 150)))",
    "}",
    "Start-Sleep -Milliseconds $waitMs",
    "$player.Stop()",
    "$player.Close()",
  ].join("; ");

  const playbackProcess = spawn(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  playbackProcess.on("error", (err) => {
    warnWindowsFallbackOnce(
      `Failed to play sound with hidden Windows player. Falling back to console beep. Error: ${err.message}`,
    );
    playWindowsBeepFallback(settings.volumePercent);
  });

  playbackProcess.on("close", (code) => {
    if (code === 0 || code === null) return;
    warnWindowsFallbackOnce(
      `Windows inline audio playback exited with code ${code}. Falling back to console beep.`,
    );
    playWindowsBeepFallback(settings.volumePercent);
  });
}

function playUsingSystemPlayer(
  soundPath: string,
  settings: RuntimeSettings,
): void {
  if (settings.volumePercent === 100) {
    playWithoutVolume(soundPath);
    return;
  }

  const options = buildCustomVolumeOptions(settings.volumePercent);
  player.play(soundPath, options as any, (err?: ExecException) => {
    if (!err) return;

    const errText = err.message ?? String(err);
    warnLinuxPlayerMissingOnce(errText);
    if (!hasWarnedVolumeFallback) {
      hasWarnedVolumeFallback = true;
      console.warn(
        `Custom volume options failed with current audio player. Falling back to default volume. Error: ${errText}`,
      );
    }

    playWithoutVolume(soundPath);
  });
}

function buildCustomVolumeOptions(
  volumePercent: number,
): PlayMethodOptionsLoose {
  const ratio = clamp(volumePercent, 0, 100) / 100;
  return {
    afplay: ["-v", ratio],
    mplayer: ["-volume", Math.round(ratio * 100)],
    mpg123: ["-f", Math.round(ratio * 32768)],
    play: ["vol", ratio],
    cvlc: ["--gain", ratio],
  };
}

function playCustomFileWithVolume(
  soundPath: string,
  settings: RuntimeSettings,
): void {
  if (isWindows) {
    playOnWindows(soundPath, settings);
    return;
  }

  playUsingSystemPlayer(soundPath, settings);
}

export function playAlert(settings: RuntimeSettings, soundPath: string): void {
  if (!fs.existsSync(soundPath)) {
    showMissingSoundFileWarning(soundPath);
    return;
  }

  playCustomFileWithVolume(soundPath, settings);
}
