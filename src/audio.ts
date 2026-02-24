import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ExecException } from "child_process";
import playSound from "play-sound";

import type { RuntimeSettings } from "./settings";

const player = playSound({});
const fixedSoundFile = "faah.mp3";

let hasWarnedVolumeFallback = false;
let lastMissingSoundFileWarning: string | null = null;

type PlayMethodOptionsLoose = Record<string, Array<string | number>> & {
  timeout?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function showMissingSoundFileWarning(): void {
  if (lastMissingSoundFileWarning === fixedSoundFile) return;
  lastMissingSoundFileWarning = fixedSoundFile;
  vscode.window.showWarningMessage(`Faah could not find audio file: ${fixedSoundFile} in media/.`);
}

export function resolveSoundPath(context: vscode.ExtensionContext): string {
  const soundPath = context.asAbsolutePath(path.join("media", fixedSoundFile));
  if (!fs.existsSync(soundPath)) {
    showMissingSoundFileWarning();
  }

  return soundPath;
}

function playWithoutVolume(soundPath: string): void {
  player.play(soundPath, (err?: ExecException) => {
    if (!err) return;
    const errText = err.message ?? String(err);
    console.warn(`Failed to play sound: ${errText}`);
  });
}

function buildCustomVolumeOptions(volumePercent: number): PlayMethodOptionsLoose {
  const ratio = clamp(volumePercent, 0, 100) / 100;
  return {
    afplay: ["-v", ratio],
    mplayer: ["-volume", Math.round(ratio * 100)],
    mpg123: ["-f", Math.round(ratio * 32768)],
    play: ["vol", ratio],
    cvlc: ["--gain", ratio],
  };
}

function playCustomFileWithVolume(soundPath: string, settings: RuntimeSettings): void {
  if (settings.volumePercent === 100) {
    playWithoutVolume(soundPath);
    return;
  }

  const options = buildCustomVolumeOptions(settings.volumePercent);
  player.play(soundPath, options as any, (err?: ExecException) => {
    if (!err) return;

    const errText = err.message ?? String(err);
    if (!hasWarnedVolumeFallback) {
      hasWarnedVolumeFallback = true;
      console.warn(
        `Custom volume options failed with current audio player. Falling back to default volume. Error: ${errText}`,
      );
    }

    playWithoutVolume(soundPath);
  });
}

export function playAlert(settings: RuntimeSettings, soundPath: string): void {
  if (!fs.existsSync(soundPath)) {
    showMissingSoundFileWarning();
    return;
  }

  playCustomFileWithVolume(soundPath, settings);
}
