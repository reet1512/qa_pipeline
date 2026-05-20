/**
 * Zustand store for Session Create dialog preferences.
 * Persists model selection per runner so users don't have to
 * re-select a model every time they open the dialog.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SessionCreatePreferencesState {
  /** Maps runner ID → last-selected model ID */
  modelByRunner: Record<string, string>;
  /** Persist the user's model choice for a given runner */
  setModelForRunner: (runnerId: string, modelId: string) => void;
  /** Retrieve the stored model for a runner (or undefined) */
  getModelForRunner: (runnerId: string) => string | undefined;
}

export const useSessionCreatePreferencesStore = create<SessionCreatePreferencesState>()(
  persist(
    (set, get) => ({
      modelByRunner: {},
      setModelForRunner: (runnerId, modelId) =>
        set((state) => ({
          modelByRunner: { ...state.modelByRunner, [runnerId]: modelId },
        })),
      getModelForRunner: (runnerId) => get().modelByRunner[runnerId],
    }),
    {
      name: 'leanspec:session-create:preferences',
      partialize: (state) => ({
        modelByRunner: state.modelByRunner,
      }),
    },
  ),
);
