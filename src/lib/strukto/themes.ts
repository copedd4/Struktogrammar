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
  root.classList.toggle("dark", id === "dark" || id === "navy" || id === "siemens");
}

/**
 * Runs in <head> before the first paint, so a stored dark theme doesn't flash
 * the light one while the app loads. Keep in sync with applyTheme; the same
 * snippet is inlined in index.html.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}")||"light",r=document.documentElement;r.dataset.theme=t;if(t==="dark"||t==="navy"||t==="siemens")r.classList.add("dark");var l=localStorage.getItem("strukto.lang");if(l==="de"||l==="en")r.lang=l}catch(e){}`;
