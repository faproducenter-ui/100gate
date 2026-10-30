import type { StoryDocument } from "./content";

export type GameMode = "title" | "playing" | "paused" | "note" | "journal" | "settings" | "code" | "levelComplete" | "gameover" | "chapterSelect" | "ending";
export type Quality = "low" | "medium" | "high";

export interface GameSettings {
  quality: Quality;
  master: number;
  music: number;
  effects: number;
  muted: boolean;
  sensitivity: number;
  fov: number;
  interactKey: string;
  movement: "wasd" | "arrows";
}

export interface SaveData {
  currentLevel: number;
  maxUnlocked: number;
  documents: string[];
}

export interface GameUIState {
  mode: GameMode;
  previousMode: GameMode;
  level: number;
  chapter: number;
  chapterTitle: string;
  location: string;
  roomName: string;
  objective: string;
  interaction: string;
  hasKey: boolean;
  hasFuse: boolean;
  bottles: number;
  hidden: boolean;
  flashlight: boolean;
  threat: number;
  message: string;
  note: StoryDocument | null;
  collectedDocuments: StoryDocument[];
  settings: GameSettings;
  save: SaveData;
  levelTime: number;
  roomsSolved: number;
  codeError: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: "high",
  master: 0.72,
  music: 0.42,
  effects: 0.78,
  muted: false,
  sensitivity: 1,
  fov: 72,
  interactKey: "KeyE",
  movement: "wasd",
};

export function keyLabel(code: string): string {
  const labels: Record<string, string> = {
    KeyE: "E", KeyF: "F", KeyQ: "Q", KeyR: "R", Space: "Пробел",
    ShiftLeft: "Левый Shift", ShiftRight: "Правый Shift", ControlLeft: "Левый Ctrl",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "Enter",
  };
  return labels[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "");
}
