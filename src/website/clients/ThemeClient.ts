// per browser, not per account
export class ThemeClient {
  private readonly listeners = new Set<() => void>();
  private readonly query = window.matchMedia("(prefers-color-scheme: dark)");

  public connect() {
    this.query.addEventListener("change", () => this.apply());
    this.apply();
  }

  public snapshot = (): ThemeClient.Preference => {
    const stored = localStorage.getItem(ThemeClient.STORAGE_KEY);
    return ThemeClient.PREFERENCES.includes(stored as ThemeClient.Preference) ? (stored as ThemeClient.Preference) : "system";
  };

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public set(preference: ThemeClient.Preference) {
    preference === "system" ? localStorage.removeItem(ThemeClient.STORAGE_KEY) : localStorage.setItem(ThemeClient.STORAGE_KEY, preference);
    this.apply();
    this.listeners.forEach((listener) => listener());
  }

  private apply() {
    const preference = this.snapshot();
    const dark = preference === "dark" || (preference === "system" && this.query.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const background = getComputedStyle(document.documentElement).getPropertyValue("--color-c-bg");
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => (meta.content = background));
  }
}

export namespace ThemeClient {
  export const PREFERENCES = ["system", "light", "dark"] as const;
  export type Preference = (typeof PREFERENCES)[number];

  // also read by the inline script in index.html
  export const STORAGE_KEY = "notas.theme";
}
