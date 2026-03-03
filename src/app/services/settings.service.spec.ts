import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsService } from './settings.service';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../models/settings.model';

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SettingsService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Initial load ──────────────────────────────────────────────────────────

  it('returns DEFAULT_SETTINGS when localStorage is empty', () => {
    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('loads persisted settings from localStorage on construction', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'light', defaultColorPool: 'delica' }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(SettingsService);

    expect(freshService.settings().theme).toBe('light');
    expect(freshService.settings().defaultColorPool).toBe('delica');
  });

  it('merges stored partial settings with defaults (forward compatibility)', () => {
    // Simulate a stored object that is missing newer fields.
    const partial = { theme: 'light' };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(partial));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(SettingsService);

    // Listed field from storage is restored.
    expect(freshService.settings().theme).toBe('light');
    // Missing fields fall back to defaults.
    expect(freshService.settings().defaultColorPool).toBe(DEFAULT_SETTINGS.defaultColorPool);
    expect(freshService.settings().defaultWidth).toBe(DEFAULT_SETTINGS.defaultWidth);
  });

  it('returns DEFAULT_SETTINGS when localStorage contains invalid JSON', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, 'not-valid-json{{{');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(SettingsService);

    expect(freshService.settings()).toEqual(DEFAULT_SETTINGS);
  });

  // ── update() ─────────────────────────────────────────────────────────────

  it('update() merges a partial patch into the current settings signal', () => {
    service.update({ defaultColorPool: 'delica', defaultWidth: 64 });

    expect(service.settings().defaultColorPool).toBe('delica');
    expect(service.settings().defaultWidth).toBe(64);
    // Unpatched fields remain unchanged.
    expect(service.settings().theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('update() persists the new settings to localStorage', () => {
    service.update({ theme: 'light' });

    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
    expect(stored.theme).toBe('light');
  });

  it('update() sets the html.light-theme class when theme is light', () => {
    service.update({ theme: 'light' });
    expect(document.documentElement.classList.contains('light-theme')).toBe(true);
  });

  it('update() removes the html.light-theme class when theme is dark', () => {
    document.documentElement.classList.add('light-theme');
    service.update({ theme: 'dark' });
    expect(document.documentElement.classList.contains('light-theme')).toBe(false);
  });

  // ── resetToDefaults() ─────────────────────────────────────────────────────

  it('resetToDefaults() restores the signal to DEFAULT_SETTINGS', () => {
    service.update({ theme: 'light', defaultColorPool: 'delica', defaultWidth: 16 });
    service.resetToDefaults();

    expect(service.settings()).toEqual(DEFAULT_SETTINGS);
  });

  it('resetToDefaults() persists DEFAULT_SETTINGS to localStorage', () => {
    service.update({ theme: 'light' });
    service.resetToDefaults();

    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
    expect(stored.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  // ── Computed signals ──────────────────────────────────────────────────────

  it('theme signal reflects current theme setting', () => {
    expect(service.theme()).toBe('dark');
    service.update({ theme: 'light' });
    expect(service.theme()).toBe('light');
  });

  it('defaultColorPool signal reflects current color pool setting', () => {
    expect(service.defaultColorPool()).toBe('any');
    service.update({ defaultColorPool: 'delica' });
    expect(service.defaultColorPool()).toBe('delica');
  });

  it('defaultGridType signal reflects current grid type setting', () => {
    expect(service.defaultGridType()).toBe('square');
    service.update({ defaultGridType: 'peyote' });
    expect(service.defaultGridType()).toBe('peyote');
  });
});
