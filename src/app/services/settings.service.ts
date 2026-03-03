import { Injectable, signal, computed } from '@angular/core';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, type Settings } from '../models/settings.model';
import type { ColorPoolId } from '../utils/color-pools';
import type { GridType } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<Settings>(this.loadFromStorage());

  readonly settings = this._settings.asReadonly();

  // ── Convenience computed signals ────────────────────────────────────────────
  readonly theme = computed(() => this._settings().theme);
  readonly defaultColorPool = computed(() => this._settings().defaultColorPool);
  readonly defaultGridType = computed(() => this._settings().defaultGridType);

  constructor() {
    this.applyTheme(this._settings().theme);
  }

  /**
   * Merge a partial update into the current settings, persist, and react.
   * Partial updates never lose fields not included in the patch.
   */
  update(patch: Partial<Settings>): void {
    const next = { ...this._settings(), ...patch };
    this._settings.set(next);
    this.persist(next);
    this.applyTheme(next.theme);
  }

  /** Restore all settings to their defaults. */
  resetToDefaults(): void {
    this.update({ ...DEFAULT_SETTINGS });
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Read settings from localStorage, merging over defaults so that any missing
   * keys (e.g. from an older app version) always have a safe value.
   */
  private loadFromStorage(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw == null) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<Settings>;
      // Spread defaults first; saved values override only known keys.
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private persist(settings: Settings): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage may be unavailable (private browsing quota, etc.). Ignore.
    }
  }

  private applyTheme(theme: 'dark' | 'light'): void {
    const html = document.documentElement;
    html.classList.toggle('light-theme', theme === 'light');
    html.style.colorScheme = theme;
  }
}
