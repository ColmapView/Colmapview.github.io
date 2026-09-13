import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useFloorPlaneStore, useReconstructionStore, useTransformStore, useUIStore } from '../../store';
import { ReconstructionSnapshot } from '../../wasm/reconstructionService';
import type { ReconstructionFloorResult } from '../../wasm/reconstructionProtocol';
import { buildWasmReconstructionWrapper } from '../../test/builders';
import { FloorDetectionModal } from './FloorDetectionModal';

vi.mock('../ui/FloatingWindowShell', () => ({
  FloatingWindowShell: ({ children, onClose }: { children: ReactNode; onClose(): void }) =>
    <div><button onClick={onClose}>Close</button>{children}</div>,
}));

const plane = { normal: [0, 1, 0] as [number, number, number], d: 0,
  centroid: [0, 0, 0] as [number, number, number], inlierCount: 3, radius: 1 };
const result: ReconstructionFloorResult = { plane, distances: new Float32Array([0, 0, 0]), normalFlipped: false };

describe('floor detection cancellation', () => {
  beforeEach(() => {
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useFloorPlaneStore.setState({ detectedPlane: plane, pointDistances: result.distances, floorColorMode: 'distance' });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each(['Clear', 'Close', 'Apply'])('does not restore cleared state after %s during a worker retry', async action => {
    let complete!: (value: ReconstructionFloorResult) => void;
    const pending = new Promise<ReconstructionFloorResult>(resolve => { complete = resolve; });
    const floor = vi.fn().mockReturnValue(pending);
    const source: ReconstructionSnapshot = Object.create(ReconstructionSnapshot.prototype);
    Object.defineProperties(source, {
      pointCount: { value: 3 }, hasPoints: { value: () => true }, floor: { value: floor },
    });
    useReconstructionStore.setState({ wasmReconstruction: source });
    render(<FloorDetectionModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-detect' }));
    expect(useFloorPlaneStore.getState().isDetecting).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(floor.mock.calls[0][1].aborted).toBe(true);
    await act(async () => { complete(result); await pending; });
    expect(useFloorPlaneStore.getState()).toMatchObject({
      detectedPlane: null, pointDistances: null, floorColorMode: 'off', isDetecting: false,
    });
  });

  it('cancels the deferred legacy calculation when Clear is clicked', () => {
    vi.useFakeTimers();
    const source = buildWasmReconstructionWrapper({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]) });
    const getPositions = vi.spyOn(source, 'getPositions');
    useReconstructionStore.setState({ wasmReconstruction: source });
    render(<FloorDetectionModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-detect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    act(() => { vi.advanceTimersByTime(20); });
    expect(getPositions).not.toHaveBeenCalled();
    expect(useFloorPlaneStore.getState()).toMatchObject({ detectedPlane: null, pointDistances: null, isDetecting: false });
  });
});
