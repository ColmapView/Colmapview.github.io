import { create } from 'zustand';

// The toolbar can subscribe without importing export/upload code.
export const useDrivePublicationStatus = create<{ active: boolean }>(() => ({ active: false }));
