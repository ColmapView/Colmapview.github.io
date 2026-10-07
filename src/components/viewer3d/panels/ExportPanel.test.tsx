import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeletionStore, useReconstructionStore, useTransformStore } from '../../../store';
import { buildReconstruction } from '../../../test/builders';
import { createIdentityEuler } from '../../../utils/sim3dTransforms';
import { ExportPanel } from './ExportPanel';

const { reloadFilesMock, processFilesMock, requestConfirmationMock } = vi.hoisted(() => ({
  reloadFilesMock: vi.fn(async () => true),
  processFilesMock: vi.fn(async () => true),
  requestConfirmationMock: vi.fn(async () => true),
}));

vi.mock('../../../hooks/useFileDropzone', () => ({
  useFileDropzone: () => ({ reloadFiles: reloadFilesMock, processFiles: processFilesMock }),
}));

vi.mock('../../../utils/confirmation', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../utils/confirmation')>(),
  requestConfirmation: requestConfirmationMock,
}));

function renderPanel() {
  return render(<ExportPanel activePanel="export" setActivePanel={vi.fn()}
    onOpenDeletionModal={vi.fn()} onOpenConversionModal={vi.fn()} />);
}

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
  });

  afterEach(() => {
    cleanup();
  });

  it('reloads the dropped files through the Reload path, which keeps remote splat tiles', async () => {
    const droppedFiles = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
    useReconstructionStore.setState({ droppedFiles });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => expect(reloadFilesMock).toHaveBeenCalledExactlyOnceWith(droppedFiles));
    expect(processFilesMock).not.toHaveBeenCalled();
  });

  it('asks before a Reload that would discard a pending transform, and stays put when declined', async () => {
    const droppedFiles = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
    const transform = { ...createIdentityEuler(), scale: 1.5 };
    useReconstructionStore.setState({ droppedFiles });
    useTransformStore.setState({ transform });
    requestConfirmationMock.mockResolvedValueOnce(false);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => expect(requestConfirmationMock).toHaveBeenCalledOnce());
    expect(reloadFilesMock).not.toHaveBeenCalled();
    expect(useTransformStore.getState().transform).toEqual(transform);
  });
});
