
Pxlpxl is a pixel-art editor built with Angular 21+, Angular Material, and Capacitor (Android). It uses Dexie (IndexedDB) for persistence, Vitest for testing, and Yarn as its package manager.

## Development

- **Always use `yarn` scripts** — only invoke `ng`, `npx`, or other binaries directly if there's no corresponding `yarn` script.
- `yarn start` — dev server at `http://localhost:4200/`
- `yarn test:unit` — unit tests (Vitest, not Jasmine/Karma)
- `yarn test:e2e` — Playwright end-to-end tests
- `yarn build` — production build to `dist/pxlpxl/browser/`
- `yarn build:android` — build web app + sync to native Android project
- `yarn cap:run` — build and run on a connected Android device/emulator
- Uses SCSS with Angular Material theme tokens (`var(--mat-sys-*)`)

## Architecture Overview

The app is a single-route editor (`/editor/:id?`). The `EditorComponent` is the shell — it lazy-loads via the router, registers all tools on init, and orchestrates layout panels.

### Service Layer (all `providedIn: 'root'` singletons using signals)

| Service | Responsibility |
|---|---|
| `ProjectService` | Create/save/load/delete projects via `PxlpxlDatabase` (Dexie). Coordinates `CanvasStateService`, `LayerService`, `ColorService`, `HistoryService` on load. |
| `LayerService` | Manages layers array signal. Pixel data is `Uint8ClampedArray` (RGBA, `width * height * 4`). Provides `getPixel`/`setPixel` at raw buffer offsets. |
| `CanvasStateService` | Canvas dimensions, grid type, zoom/pan `ViewTransform`, screen↔pixel coordinate mapping. |
| `ColorService` | Primary/secondary color signals and palette management. |
| `HistoryService` | Command-based undo/redo (max 100 entries). Execute a `Command` to push it onto the undo stack. |
| `ToolService` | Tool registry (`Map<ToolType, Tool>`). Tools are registered by `EditorComponent.ngOnInit()`. |
| `GestureService` | Pointer event → gesture classification (draw/pinch/pan/long-press). Callback-based (`onDraw`, `onPinch`, etc.). |
| `RenderService` | Composites visible layers onto a `<canvas>` with zoom/pan transform. Handles both square and peyote grid rendering. |
| `GridService` | Grid-type-aware coordinate math, neighbor lookups (4-connected for square, 6-connected for peyote). |
| `LayoutService` | Responsive sidebar state, orientation detection. |
| `BackButtonService` | Capacitor back-button dismissal stack. |
| `ExportService` | Export canvas as PNG blob with scale factor. |

### Command Pattern (undo/redo)

All state mutations that should be undoable go through `HistoryService.execute(command)`. Commands implement `Command` interface (`execute()` + `undo()` + `description`).

- `DrawCommand` — stores `ModifiedPixel[]` (coord + oldColor + newColor), replays via `LayerService.setPixel()`
- `FillCommand` — same shape as `DrawCommand` but for flood fill
- `LayerCommand` — stores full before/after `Uint8ClampedArray` snapshots for bulk operations

New commands go in `src/app/commands/` and follow this pattern.

### Tool Pattern

Tools implement the `Tool` interface: `onPointerDown`/`onPointerMove`/`onPointerUp` receive a `ToolContext` + raw `Uint8ClampedArray` layer data, and return `ToolResult | null` (list of `ModifiedPixel`). Tools mutate the buffer directly for immediate visual feedback, then the viewport wraps the result in a `DrawCommand`.

- Tools are plain classes (not Angular services) — instantiated in `EditorComponent.registerTools()`
- New tools go in `src/app/tools/`, add a `ToolType` enum value, and register in `EditorComponent`

### Pixel Data Format

Layer pixel data is a flat `Uint8ClampedArray` of RGBA bytes. The `Color` model is `{ r, g, b, a }` with `a` in 0–255 range. Use helpers from `src/app/models/color.model.ts` (`colorsEqual`, `colorToHex`, `hexToColor`).

**Always use `pixelOffset(x, y, bufferWidth, gridType, ...)` from `src/app/models/pixel-offset.ts`** to compute byte offsets — never inline `(y * bufferWidth + x) * 4` directly, as triangular grids use a different formula.

For square and peyote grids: `(y * bufferWidth + x) * 4`. For triangular grids: cumulative row-width formula via `triangularCumPixels()`.

Buffer dimensions for any grid: use `computeBufferDimensions()` from `project.model.ts` and the `bufferWidth()`/`bufferHeight()` signals on `CanvasStateService`.

### Grid Types

Three grid types: `'square'` (standard), `'peyote'` (hex-offset bead columns), `'triangular'` (growing-row triangle patterns). Use `GridService` for all coordinate math — never hard-code square-grid assumptions.

**Peyote dense-row buffer layout**: Even buffer rows (0, 2, 4…) hold beads from even visual columns; odd buffer rows hold odd visual columns.
- `bufferWidth = Math.ceil(visualColumns / 2)`, `bufferHeight = visibleRows`
- `GridService.bufferToVisual(bx, by)` / `GridService.visualToBuffer(col, beadRow)` to convert
- 6-connected neighbor connectivity

**Triangular buffer layout**: Row `r` has `(a + d·r)` pixels packed contiguously (variable-width rows). Parameters: `triangularA` (first-row width), `triangularDNum`/`triangularDDen` (fractional per-row growth), `triangularShift` (phase). Even `d` → 4-connected neighbors; odd `d` → 6-connected (peyote-like stagger). These parameters flow through `ToolContext`, `DrawCommand`, `CanvasStateService`, and `pixelOffset()`.

### Persistence

`PxlpxlDatabase` extends Dexie. Layer data is serialized to `number[]` for IndexedDB storage (`serializeLayer`/`deserializeLayer` in `project.model.ts`). Projects store layers, palette, grid type, and timestamps.

## Angular & TypeScript Conventions

- Angular 21+ standalone components — do NOT set `standalone: true` (it's the default)
- `ChangeDetectionStrategy.OnPush` on all components
- `input()`/`output()` functions, not decorators
- `inject()` function, not constructor injection
- Signals for state (`signal`, `computed`); use `update` or `set`, never `mutate`
- Native control flow (`@if`, `@for`, `@switch`), not structural directives
- `host` object in decorator for host bindings, not `@HostBinding`/`@HostListener`
- Use external template and style files for all components (`templateUrl` / `styleUrl`)
- External template/style paths must be relative to the component TS file
- Prefer Reactive forms over Template-driven
- Use `class` bindings, not `ngClass`; `style` bindings, not `ngStyle`
- Use `NgOptimizedImage` for all static images (does not work for inline base64 images)
- Use the async pipe to handle observables in templates
- Do not assume globals like `new Date()` are available in templates
- Do not write arrow functions in templates (they are not supported)
- Strict TypeScript — no `any`, use `unknown` when uncertain

## Testing

Three tiers of tests, all using **Vitest** (`@angular/build:unit-test`). Test files are co-located: `foo.ts` → `foo.spec.ts`.

### Unit Tests

Test individual classes, functions, and services in isolation.

- Services use `TestBed` with `describe`/`it`/`expect`
- Tools are plain classes — instantiate directly with `makeContext()` helpers and raw `Uint8ClampedArray` buffers, no Angular DI needed (see `pencil.tool.spec.ts`)
- Commands are tested by verifying `execute()` applies changes and `undo()` reverts them

### Integration Tests

Test whole components or multi-service action flows (e.g., draw → undo → redo, project save → load round-trip).

- Use `TestBed` to configure real service graphs, not mocks, where feasible
- Verify that service interactions produce the expected combined state
- File suffix: `.integration.spec.ts` (co-located with the primary subject)

### E2E Tests

Test user-click-based actions and observe outcomes on the DOM using **Playwright**.

- Interact via user-visible affordances (click buttons, drag on canvas, open dialogs)
- Assert against DOM state (element presence, text content, canvas pixel sampling)
- E2E tests live in a top-level `e2e/` directory

## File Formats

`ImportService` handles three file formats (`.pxl`, `.png`, `.rgp`). Detection is by magic bytes, not extension.

- **`.pxl`** — native JSON format validated by `PxlFileSchema` (Zod). Layers stored as base64-encoded RGBA `Uint8ClampedArray`. History serialized via `serializeCommand`/`deserializeCommand` in `src/app/commands/command-serialization.ts`. Handles legacy `triangular-slow` grid type migration via `remapLegacyGridType()`.
- **`.png`** — imported via `<canvas>` decode; prompts user to choose target layer/dimensions.
- **`.rgp`** — bead pattern format; parsed by `RgpProjectSchema` (Zod) from `src/app/models/rgp-file.model.ts`.

## Accessibility

- MUST pass AXE checks and meet WCAG AA (focus management, color contrast, ARIA attributes)
- Touch targets: minimum 48px (`$touch-target-min` in `_variables.scss`)
