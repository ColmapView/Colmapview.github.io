import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePointPickingStore } from '../../store';
import { useTransformStore } from '../../store/stores/transformStore';
import { DistanceInputModal } from './DistanceInputModal';

function createSelectedPoints(distance: number) {
  return [
    { position: new THREE.Vector3(0, 0, 0), point3DId: 1n },
    { position: new THREE.Vector3(distance, 0, 0), point3DId: 2n },
  ];
}

function openDistanceModal(distance: number): void {
  usePointPickingStore.setState({
    pickingMode: 'distance-2pt',
    selectedPoints: createSelectedPoints(distance),
    showDistanceModal: true,
    modalPosition: { x: 100, y: 100 },
  });
}

describe('DistanceInputModal', () => {
  beforeEach(() => {
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes the distance input when opened without replacing user edits while open', () => {
    openDistanceModal(5);
    render(<DistanceInputModal />);

    const input = screen.getByTitle('Target distance');
    expect(input).toHaveValue('5.0000');

    fireEvent.change(input, { target: { value: '7.25' } });
    expect(input).toHaveValue('7.25');

    act(() => {
      usePointPickingStore.setState({ selectedPoints: createSelectedPoints(10) });
    });

    expect(screen.getByTitle('Target distance')).toHaveValue('7.25');
  });

  it('reinitializes the distance input on the next modal open', () => {
    openDistanceModal(5);
    render(<DistanceInputModal />);

    fireEvent.change(screen.getByTitle('Target distance'), { target: { value: '7.25' } });

    act(() => {
      usePointPickingStore.setState({ showDistanceModal: false });
    });
    act(() => {
      openDistanceModal(10);
    });

    expect(screen.getByTitle('Target distance')).toHaveValue('10.0000');
  });
});
