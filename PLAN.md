# Plan: Add XYZ Views with Popup Menu on Reset Button

## Overview
Convert the reset button into a hover-triggered popup menu containing axis view options:
- **X View** - Look along X axis (from +X toward origin)
- **Y View** - Look along Y axis (from +Y toward origin)
- **Z View** - Look along Z axis (from +Z toward origin)
- **Reset View** - Isometric reset (existing functionality)

---

## UI Consistency Analysis

### Existing Patterns Used
| Pattern | Source | Application |
|---------|--------|-------------|
| `ControlButton` + `PanelWrapper` | Transform, Export panels | Main button with hover panel |
| `presetGroup` + `presetButton` | Transform panel (line 810-827) | View option buttons |
| Hotkey hints in labels | Transform presets use tooltips | Show "(1)", "(2)", "(3)", "(R)" in buttons |
| `PanelType` union | Line 480 | Add `'view'` to type |
| Icon pattern | ResetIcon, etc. | Create `ViewIcon` for main button |

### Panel Width
All panels use `w-[240px]` - view panel will match this.

### Button Styling
The `presetButton` style is:
```
buttonStyles.base + buttonStyles.sizes.toggle + buttonStyles.variants.toggle + w-full justify-start
```
Result: `px-4 py-1 text-sm` with full width and left-aligned text.

---

## Implementation Steps

### Step 1: Add State to UI Store
**File:** `src/store/stores/uiStore.ts`

```typescript
// Add to UIState interface
viewDirection: 'reset' | 'x' | 'y' | 'z' | null;
viewTrigger: number;

// Add action
setView: (direction: 'reset' | 'x' | 'y' | 'z') => void;

// Implementation
viewDirection: null,
viewTrigger: 0,
setView: (direction) => set((state) => ({
  viewDirection: direction,
  viewTrigger: state.viewTrigger + 1
})),
```

**Note:** Keep `resetView()` for backwards compatibility - it just calls `setView('reset')`.

### Step 2: Create ViewIcon
**File:** `src/components/viewer3d/ViewerControls.tsx`

Add new icon (cube perspective style to suggest viewing angles):
```typescript
function ViewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {/* 3D cube suggesting view perspective */}
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
      <path d="M2 7v10" />
      <path d="M12 12v10" />
      <path d="M22 7v10" />
    </svg>
  );
}
```

### Step 3: Update PanelType
**File:** `src/components/viewer3d/ViewerControls.tsx` (line 480)

```typescript
type PanelType = 'view' | 'points' | 'color' | ... | null;
```

### Step 4: Convert Reset Button to ControlButton
**File:** `src/components/viewer3d/ViewerControls.tsx`

Replace lines 1103-1109 with:
```tsx
<ControlButton
  panelId="view"
  activePanel={activePanel}
  setActivePanel={setActivePanel}
  icon={<ViewIcon className="w-6 h-6" />}
  tooltip="View options (R)"
  onClick={() => setView('reset')}
  panelTitle="View"
>
  <div className={styles.panelContent}>
    <div className={styles.presetGroup}>
      <button
        onClick={() => setView('x')}
        className={styles.presetButton}
      >
        <span>X Axis View</span>
        <span className="text-ds-muted ml-auto text-xs">1</span>
      </button>
      <button
        onClick={() => setView('y')}
        className={styles.presetButton}
      >
        <span>Y Axis View</span>
        <span className="text-ds-muted ml-auto text-xs">2</span>
      </button>
      <button
        onClick={() => setView('z')}
        className={styles.presetButton}
      >
        <span>Z Axis View</span>
        <span className="text-ds-muted ml-auto text-xs">3</span>
      </button>
    </div>
    <div className={styles.actionGroup}>
      <button
        onClick={() => setView('reset')}
        className={styles.actionButtonPrimary}
      >
        Reset View
        <span className="text-ds-void/70 ml-2 text-xs">R</span>
      </button>
    </div>
  </div>
</ControlButton>
```

**Design Notes:**
- X/Y/Z buttons use `presetButton` style (same as Transform presets)
- Reset View uses `actionButtonPrimary` for visual emphasis (primary action)
- Hotkey hints shown as muted text on right side
- `actionGroup` wrapper gives proper spacing from preset buttons

### Step 5: Add Hotkeys for XYZ Views
**File:** `src/config/hotkeys.ts`

```typescript
viewX: {
  keys: '1',
  description: 'X-axis view',
  category: 'camera',
  scopes: ['viewer'],
},
viewY: {
  keys: '2',
  description: 'Y-axis view',
  category: 'camera',
  scopes: ['viewer'],
},
viewZ: {
  keys: '3',
  description: 'Z-axis view',
  category: 'camera',
  scopes: ['viewer'],
},
```

### Step 6: Register Hotkeys in ViewerControls
**File:** `src/components/viewer3d/ViewerControls.tsx`

Add after the existing `resetView` hotkey registration:
```typescript
useHotkeys(
  HOTKEYS.viewX.keys,
  () => setView('x'),
  { scopes: HOTKEYS.viewX.scopes },
  [setView]
);
useHotkeys(
  HOTKEYS.viewY.keys,
  () => setView('y'),
  { scopes: HOTKEYS.viewY.scopes },
  [setView]
);
useHotkeys(
  HOTKEYS.viewZ.keys,
  () => setView('z'),
  { scopes: HOTKEYS.viewZ.scopes },
  [setView]
);
```

**Note:** Update existing `resetView` hotkey to use `setView('reset')`.

### Step 7: Implement Camera Positioning in TrackballControls
**File:** `src/components/viewer3d/TrackballControls.tsx`

Update the reset effect (lines 211-238) to handle view directions:

```typescript
// Props interface update
interface TrackballControlsProps {
  // ... existing props
  viewDirection?: 'reset' | 'x' | 'y' | 'z' | null;
  viewTrigger?: number;
}

// Camera offset and up vectors for each axis view
const AXIS_VIEWS = {
  x: { offset: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  y: { offset: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  z: { offset: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
};

// In the useEffect:
useEffect(() => {
  targetVec.current.set(...target);
  const isTriggered = viewTrigger !== lastViewTrigger.current;
  lastViewTrigger.current = viewTrigger;

  if (isTriggered || distance.current === 5) {
    distance.current = Math.max(CONTROLS.minDistance, radius * CAMERA.initialDistanceMultiplier);
    targetDistance.current = distance.current;

    let camOffset: THREE.Vector3;
    let upDir: THREE.Vector3;

    if (viewDirection && viewDirection !== 'reset' && AXIS_VIEWS[viewDirection]) {
      // Axis view: position camera along axis looking at target
      const view = AXIS_VIEWS[viewDirection];
      camOffset = view.offset.clone().multiplyScalar(distance.current);
      upDir = view.up.clone();
    } else {
      // Reset view: use existing isometric calculation
      const sqrt2_2 = Math.SQRT1_2;
      camOffset = new THREE.Vector3(-0.5, -sqrt2_2, -0.5).normalize()
        .multiplyScalar(distance.current);
      upDir = new THREE.Vector3(0.5, -sqrt2_2, 0.5).normalize();
    }

    const camPos = targetVec.current.clone().add(camOffset);
    const lookMatrix = new THREE.Matrix4();
    lookMatrix.lookAt(camPos, targetVec.current, upDir);
    cameraQuat.current.setFromRotationMatrix(lookMatrix);

    camera.position.copy(camPos);
    camera.quaternion.copy(cameraQuat.current);

    // Clear velocities
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
    flyVelocity.current.set(0, 0, 0);
  }
}, [target[0], target[1], target[2], radius, viewTrigger, viewDirection, camera]);
```

### Step 8: Pass Props from Scene3D
**File:** `src/components/viewer3d/Scene3D.tsx`

```typescript
const viewDirection = useUIStore((s) => s.viewDirection);
const viewTrigger = useUIStore((s) => s.viewTrigger);

<TrackballControls
  // ... existing props
  viewDirection={viewDirection}
  viewTrigger={viewTrigger}
/>
```

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/store/stores/uiStore.ts` | Add `viewDirection`, `viewTrigger`, `setView()` |
| `src/components/viewer3d/ViewerControls.tsx` | Add `ViewIcon`, update `PanelType`, convert reset to ControlButton, add hotkeys |
| `src/components/viewer3d/TrackballControls.tsx` | Handle axis views in camera positioning |
| `src/components/viewer3d/Scene3D.tsx` | Pass `viewDirection`, `viewTrigger` props |
| `src/config/hotkeys.ts` | Add `viewX`, `viewY`, `viewZ` definitions |

---

## Visual Design

```
┌─────────────────────┐
│ View                │  ← Panel title (same style as other panels)
├─────────────────────┤
│ ┌─────────────────┐ │
│ │ X Axis View   1 │ │  ← presetButton style
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ Y Axis View   2 │ │  ← presetButton style
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ Z Axis View   3 │ │  ← presetButton style
│ └─────────────────┘ │
│                     │
│ ┌─────────────────┐ │
│ │  Reset View  R  │ │  ← actionButtonPrimary (accent color)
│ └─────────────────┘ │
└─────────────────────┘
```

---

## Behavior

1. **Hover on view button** → Opens popup with view options
2. **Click view button directly** → Triggers reset view (backwards compatible)
3. **Click X/Y/Z in popup** → Camera snaps to that axis view
4. **Click Reset View in popup** → Same as clicking button directly
5. **Press 1/2/3 keys** → Quick access to X/Y/Z views
6. **Press R key** → Reset view (unchanged)
