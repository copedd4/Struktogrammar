export const THEMES = [
  { id: "light", label: "Light", labelDe: "Hell" },
  { id: "dark", label: "Dark", labelDe: "Dunkel" },
  { id: "eggshell", label: "Eggshell White", labelDe: "Eierschalenweiß" },
  { id: "navy", label: "Navy Blue Dark", labelDe: "Navy Blau Dunkel" },
  { id: "siemens", label: "Siemens", labelDe: "Siemens" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_STORAGE_KEY = "strukto.theme";

export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  root.dataset["theme"] = id;
  root.classList.toggle("dark", id === "dark" || id === "navy");
}
