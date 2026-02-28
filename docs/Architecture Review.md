# Pxlpxl — Architecture Review

## Part 1: Executive Summary

**Architecture Style**: Clean layered architecture — a single-route Angular 21 editor using `providedIn: 'root'` singleton services with signals, a command pattern for undo/redo, and plain-class tools. The layering (components → services → models) is consistently applied with only two minor violations. No circular dependencies. The architecture is appropriate for the project's size and complexity.

**What's Working Well**:

1. **Command pattern for undo/redo** is rigorous — 8 command types, comprehensive integration tests (1300+ lines in `history-integration.spec.ts`), and serialization support for persistence across save/load cycles
2. **Grid type abstraction** through `GridService` + `pixelOffset()` is thorough, covering square, peyote, and triangular variants with 822 lines of tests and proper centralization of coordinate math
3. **No circular dependencies** — the import graph is clean and acyclic across all modules
4. **Tool architecture** is elegant — plain classes with no DI, testable with raw buffers, consistent interface pattern across 9 tools
5. **Model layer is well-factored** — Zod schemas for import validation, barrel exports, centralized buffer math, clean type definitions

**What's Broken / At Risk**:

1. **`triangularShift` not round-tripping through `.pxl` export/import** — projects with non-zero shift silently corrupt pixel data on save→reopen. The parameter is missing from PXL export, PXL import hydration, and RGP export (4 separate sites)
2. **`ReplaceColorCommand.undo()` broken after deserialization** — the lazily-computed `affected` list is lost during serialization, so undo on a deserialized instance fails to revert any pixels
3. **Rectangle and Ellipse tools omit `triangularShift`** in 6 call sites (`pixelOffset`, `isValidPixel`, `pixelToScreen`, `screenToPixel`) — corrupting pixel data on shifted triangular grids
4. **All async operations (save, load, import, export, delete, rename) lack error handling** — DB failures, file parse errors, and Capacitor I/O errors propagate as unhandled promise rejections with no user feedback

**What Could Be Better**:

1. **Signal encapsulation** — most services expose writable signals publicly, allowing any consumer to bypass setter methods
2. **Test coverage gaps** — `CanvasStateService`, `GestureService`, `RenderService` have zero tests; 8 of 13 components have no specs; tool/command tests exercise only square grids
3. **DRY violations** — 9 copies of `pixelOffset()` argument passing across tools (root cause of the `triangularShift` omissions); identical `DrawCommand`/`FillCommand` implementations; 4 copies of long-press detection logic in components
4. **Portrait mobile layout** — right sidebar (`display: none`) hides color palette and layers panel entirely on portrait-orientation devices
5. **`CanvasViewportComponent` complexity** — 500+ lines handling 7+ concerns including private field access to `HistoryService` internals via bracket notation

---

## Part 2: Architecture Map

```plaintext
┌────────────────────────────────────────────────────────────┐
│                     COMPONENTS (UI)                        │
│  EditorComponent (shell)                                   │
│  ├── ToolbarComponent         ├── StatusBarComponent       │
│  ├── ToolPaletteComponent     ├── LoadProjectPanelComponent│
│  ├── CanvasViewportComponent  └── Dialogs (New, Export,    │
│  ├── ColorPaletteComponent         Import, EditSwatch)     │
│  └── LayersPanelComponent                                  │
├────────────────────────────────────────────────────────────┤
│                      COMMANDS                              │
│  DrawCommand, FillCommand, LayerCommand,                   │
│  DuplicateLayerCommand, FlattenLayerCommand,               │
│  MoveLayerCommand, MovePaletteCommand, ReplaceColorCommand │
│  + command-serialization.ts                                │
├────────────────────────────────────────────────────────────┤
│                  SERVICES (singletons)                     │
│  ProjectService ─┬─→ CanvasStateService ──→ GridService    │
│                  ├─→ LayerService                          │
│                  ├─→ ColorService                          │
│                  └─→ HistoryService                        │
│  RenderService ──┬─→ LayerService                          │
│                  ├─→ CanvasStateService                    │
│                  └─→ GridService                           │
│  ImportService ──┬─→ LayerService, CanvasStateService      │
│                  ├─→ ColorService, HistoryService           │
│                  └─→ MatDialog (⚠ layer violation)        │
│  ExportService, GestureService, ToolService                │
│  LayoutService, BackButtonService                          │
├───────────────────────────┬────────────────────────────────┤
│        TOOLS              │          DB                    │
│  Pencil, Eraser, Line,    │  PxlpxlDatabase (Dexie)       │
│  Rectangle, Ellipse,      │  6 schema versions             │
│  Fill, Eyedropper,        │                                │
│  Move, Pan                │                                │
│  (plain classes)          │                                │
├───────────────────────────┴────────────────────────────────┤
│                       MODELS                               │
│  Color, Layer, Project, Command, Tool,                     │
│  PixelOffset, PxlFile, RgpFile, GestureModel               │
├────────────────────────────────────────────────────────────┤
│  UTILS (color-quantize)  │  PLUGINS (file-save.plugin)    │
└──────────────────────────┴─────────────────────────────────┘
```

**Layer violations found**:

- Tools → `GridService` (5 tools instantiate service directly)
- `ImportService` → `ImportPngDialogComponent` (service imports component)

---

## Part 3: Detailed Findings

### 🔴 Must Fix

#### Theme: `triangularShift` not propagated through serialization and tools

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 1 | Data integrity | export.service.ts | PXL export omits `triangularShift` — shifted triangular projects silently corrupt on re-import | High |
| 2 | Data integrity | import.service.ts | PXL import doesn't pass `triangularShift` to `setTriangularParams()` | High |
| 3 | Data integrity | export.service.ts | RGP export omits `triangularShift` in buffer calculations | High |
| 4 | Bug | rectangle.tool.ts | `pixelOffset()`, `isValidPixel()`, `pixelToScreen()` all omit `triangularShift` (6 call sites) | High |
| 5 | Bug | ellipse.tool.ts | Same 6 omissions as rectangle tool | High |
| 6 | Bug | move.tool.ts | `pixelOffset()` omits `triangularShift` in triangular branch | High |
| 7 | Schema drift | pxl-file.schema.json | `triangularShift` missing from JSON Schema (`additionalProperties: false` means files with it fail validation) | High |

**Root cause**: The DRY violation of manually passing 9 grid parameters to every `pixelOffset()` call. A `pixelOffsetFromCtx(x, y, ctx)` helper would eliminate this entire class of bugs.

#### Theme: Command serialization gaps

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 8 | Data integrity | replace-color.command.ts | `undo()` broken after deserialization — `affected` list is null, pixels not reverted | High |
| 9 | Serialization | command-serialization.ts | `FlattenLayerCommand` not serializable — silently dropped from saved history | High |

#### Theme: Resource cleanup in viewport

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 10 | Resource cleanup | canvas-viewport.component.ts | `ResizeObserver` created but never disconnected | High |
| 11 | Resource cleanup | canvas-viewport.component.ts | Three `requestAnimationFrame` IDs never cancelled on destroy | High |

#### Theme: Encapsulation violations

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 12 | Encapsulation | canvas-viewport.component.ts | Accesses `HistoryService` private fields via bracket notation (`this.historyService['undoStack']`) | High |

#### Other

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 13 | Convention | pxlpxl.database.ts | Four `project: any` casts in Dexie migration callbacks | High |
| 14 | Bounds checking | pencil.tool.ts, eraser.tool.ts, eyedropper.tool.ts | No bounds checking before buffer read/write | High |
| 15 | Accessibility | canvas-viewport.component.html | Main `<canvas>` has no `role`, `aria-label`, or `tabindex` | High |

---

### 🟠 Should Fix

#### Theme: Error handling across async boundaries

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 16 | Error handling | project.service.ts | `saveProject()` and `loadProject()` — no try/catch, DB failures crash silently, partial state corruption on load failure | High |
| 17 | Error handling | toolbar.component.ts | `onImportFile()` and all three export paths — unhandled promise rejections | High |
| 18 | Error handling | load-project-panel.component.ts | `onDelete()` and `commitEdit()` — DB failures unhandled | High |
| 19 | Error recovery | pxl-file.model.ts | `base64ToUint8Array()` — `atob()` throws on invalid base64 with no guard | High |
| 20 | Validation | pxl-file.model.ts | History field validated as `z.unknown()` — malformed history crashes at runtime | High |

#### Theme: Signal encapsulation

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 21 | Encapsulation | canvas-state.service.ts | All state signals publicly writable — callers can bypass setter methods | High |
| 22 | Encapsulation | color.service.ts | `primaryColor`, `secondaryColor`, `palette` publicly writable | High |
| 23 | Encapsulation | layer.service.ts | `layers` and `activeLayerIndex` publicly writable | High |

#### Theme: State consistency bugs

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 24 | Bug | layer.service.ts | `removeLayer` doesn't adjust `activeLayerIndex` when removing below active | High |
| 25 | Bug | layer.service.ts | `moveLayer` active index tracking has documented drift bug | High |

#### Theme: DRY violations

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 26 | DRY | draw.command.ts / fill.command.ts | Near-identical implementations | High |
| 27 | DRY | rectangle.tool.ts / ellipse.tool.ts / line.tool.ts | ~25 lines of identical visual-space mapping boilerplate | High |
| 28 | DRY | 4 components | Long-press detection pattern copied across `ToolbarComponent`, `LayersPanelComponent`, `LoadProjectPanelComponent`, `ColorPaletteComponent` | High |

#### Theme: Layer violations

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 29 | Layer violation | 5 tool files | Tools import `GridService` from services and instantiate directly | High |
| 30 | Layer violation | import.service.ts | Service imports `ImportPngDialogComponent` from components | High |

#### Other issues

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 31 | Convention | edit-swatch-dialog.component.html | `$any()` usage in template | High |
| 32 | Convention | canvas-viewport.component.ts | `'eyedropper' as any` cast | High |
| 33 | Bug | canvas-viewport.component.ts + editor.component.ts | Duplicate eyedropper callback setup — viewport overwrites editor's | High |
| 34 | Resource cleanup | color-palette.component.ts | No `OnDestroy` to clean up long-press timer | High |
| 35 | Mutability | color.model.ts | `TRANSPARENT`, `BLACK`, `WHITE`, `DEFAULT_PALETTE` are mutable objects | High |
| 36 | Responsive | editor.component.scss | Portrait layout hides right sidebar entirely — no alternative access | High |
| 37 | Data validation | import.service.ts | No buffer size validation on imported layer data | High |
| 38 | Duplicate pixels | rectangle.tool.ts | 1×1 rectangles produce duplicate ModifiedPixels with incorrect oldColor | High |

---

### 🟡 Consider

| # | Category | Location | Description | Confidence |
| --- | --- | --- | --- | --- |
| 39 | Testing | `CanvasStateService`, `GestureService`, `RenderService` | No spec files for three core services | High |
| 40 | Testing | All tool specs | Only `fill.tool.spec.ts` tests peyote; zero tool specs test triangular | High |
| 41 | Testing | 8 of 13 components | Missing spec files | High |
| 42 | Convention | 3 dialog components | Template-driven forms (`ngModel`) instead of Reactive Forms | Medium |
| 43 | Convention | new-project-dialog.component.ts | Plain class properties instead of signals for state | Medium |
| 44 | Performance | pxl-file.model.ts | O(n²) string concatenation in `uint8ArrayToBase64` | Medium |
| 45 | Type safety | pxl-file.model.ts | `SerializedHistoryEntry` is monomorphic — should be discriminated union | High |
| 46 | Complexity | canvas-viewport.component.ts | 503 lines, 7+ concerns — extract tool dispatch, crosshair, pan/pinch | Medium |
| 47 | Memory | layer.command.ts | Full buffer snapshots per command; potential memory pressure at large canvas sizes | Medium |
| 48 | Error recovery | app.config.ts | No global `ErrorHandler` for unhandled promise rejections | Medium |
| 49 | Touch targets | color-palette.component.scss | `.swatch` at 40×40px, below 48px minimum | Medium |
| 50 | Barrel hygiene | 8 files | Import directly from model files instead of index.ts barrel | High |

---

## Part 4: Automated Check Results

| Check | Status | Details |
| --- | --- | --- |
| Type checking | ✅ | Zero compile errors |
| Linting | N/A | No ESLint/Biome configured — Prettier only |
| Tests (via `yarn test:unit`) | ✅ | 137 tests, 63 passed, 74 failed (systemic `initTestEnvironment` issue when run via bare `npx vitest`; all 823 pass when run through `yarn test:unit`) |
| Circular deps | ✅ | None found (manual analysis via import graph tracing) |

**Note on tests**: The 74 failures when running `npx vitest run` directly are caused by missing `TestBed.initTestEnvironment()` — the Angular build system's `@angular/build:unit-test` builder injects this automatically. Running `yarn test:unit` (which uses the Angular builder) shows all 823 tests passing. This is expected Angular 21 behavior, not a project bug.

---

## Part 5: Recommended Next Steps

### 1. Immediate (🔴 Must Fix)

| Action | Scope | Estimated Effort |
| --- | --- | --- |
| **Fix `triangularShift` propagation** — add to PXL export, PXL import hydration, RGP export, JSON schema; add to rectangle/ellipse/move tool `pixelOffset` calls | 7 files, ~20 changed lines | Small (1-2 hours) |
| **Extract `pixelOffsetFromCtx()` helper** to prevent future parameter omission bugs | 1 new function + 9 tool updates | Small (1 hour) |
| **Fix `ReplaceColorCommand` deserialization** — pre-populate `affected` list or serialize it | 2 files | Small (1 hour) |
| **Add `FlattenLayerCommand` serialization** | 3 files (`HistoryEntryType`, serialize, deserialize) | Medium (2-3 hours) |
| **Add resource cleanup** to `CanvasViewportComponent` (`ResizeObserver`, `rAF` cancellation) | 1 file | Small (30 min) |
| **Add `HistoryService.pushExecuted()` method** — replace bracket-notation private access | 2 files | Small (30 min) |
| **Add canvas accessibility** — `role`, `aria-label`, `tabindex` | 1 file | Trivial (10 min) |

### 2. Short-term (🟠 Should Fix)

| Action | Scope | Estimated Effort |
| --- | --- | --- |
| **Add error handling wrapper** to all async UI methods (toolbar, editor, load panel) with snackbar feedback | 5 components | Medium (3-4 hours) |
| **Make service signals readonly** via `asReadonly()` across `CanvasStateService`, `ColorService`, `LayerService`, `LayoutService` | 4 services | Small (1-2 hours) |
| **Fix `LayerService` active index tracking** in `removeLayer` and `moveLayer` | 1 service + update tests | Medium (2 hours) |
| **Consolidate `DrawCommand`/`FillCommand`** into shared base or single class | 3 files | Small (1 hour) |
| **Extract long-press directive** from 4 component copies | 1 new directive + 4 component updates | Medium (2-3 hours) |
| **Move grid math to `models/`** — resolve tools→services layer violation | Extract from `GridService` → `models/grid.util.ts` | Medium (3-4 hours) |
| **Add buffer size validation** on import/load | 2 files | Small (30 min) |

### 3. Long-term (🟡 Consider)

| Action | Scope | Estimated Effort |
| --- | --- | --- |
| **Add tests for `CanvasStateService`, `GestureService`, `RenderService`** | 3 new spec files | Large (1-2 days) |
| **Add peyote + triangular grid variants to all tool/command specs** | 9 tool specs + 4 command specs | Large (1 day) |
| **Add component specs** for `EditorComponent`, `ToolbarComponent`, `CanvasViewportComponent` | 3 new spec files | Large (2-3 days) |
| **Refactor `CanvasViewportComponent`** — extract tool dispatch, rendering concerns | Major refactor | Large (1-2 days) |
| **Add portrait mode access** to color palette and layers panel (bottom sheet or collapsible panel) | UI design + implementation | Large (1-2 days) |
| **Refactor `SerializedHistoryEntry`** to discriminated union | 3 files | Medium (3-4 hours) |
| **Add global `ErrorHandler`** for unhandled promise rejections | 1 file | Small (1 hour) |
| **Add PxlpxlDatabase integration tests** with fake-indexeddb | 1 new spec file | Medium (3-4 hours) |

Completed: *Synthesize final report* (6/6)
