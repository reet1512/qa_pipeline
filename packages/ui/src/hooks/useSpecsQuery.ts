/**
 * TanStack Query Specs Hooks - PoC
 *
 * Replaces manual data fetching in components with query hooks.
 * Benefits:
 * - Automatic caching and deduplication
 * - Built-in loading/error states
 * - Background refetching
 * - Optimistic updates support
 * - Request deduplication (same query = 1 request)
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getBackend } from '../lib/backend-adapter';
import type { Spec, ListParams, SpecSearchFilters } from '../types/api';

// Query key factory for consistent cache management
export const specKeys = {
  all: ['specs'] as const,
  lists: () => [...specKeys.all, 'list'] as const,
  list: (projectId: string, params?: ListParams) =>
    [...specKeys.lists(), projectId, params] as const,
  details: () => [...specKeys.all, 'detail'] as const,
  detail: (projectId: string, specName: string) =>
    [...specKeys.details(), projectId, specName] as const,
  stats: (projectId: string) => [...specKeys.all, 'stats', projectId] as const,
  dependencies: (projectId: string, specName?: string) =>
    [...specKeys.all, 'deps', projectId, specName] as const,
};

/**
 * Hook to fetch specs list with automatic caching
 */
export function useSpecsList(projectId: string | null, params?: ListParams) {
  return useQuery({
    queryKey: specKeys.list(projectId ?? '', params),
    queryFn: () => {
      if (projectId) {
        api.setCurrentProjectId(projectId);
      }
      return api.getSpecs(params);
    },
    enabled: !!projectId,
    // Specs change frequently during active work
    staleTime: 10 * 1000,
  });
}

/**
 * Hook to fetch specs with hierarchy (for board/tree views)
 */
export function useSpecsWithHierarchy(projectId: string | null, params?: ListParams) {
  return useQuery({
    queryKey: [...specKeys.list(projectId ?? '', params), 'hierarchy'],
    queryFn: () => {
      if (projectId) {
        api.setCurrentProjectId(projectId);
      }
      return api.getSpecsWithHierarchy(params);
    },
    enabled: !!projectId,
    staleTime: 10 * 1000,
  });
}

/**
 * Hook to search specs using the backend search API.
 * Only fires when query is non-empty. Uses keepPreviousData for smooth typing UX.
 */
export function useSearchSpecs(projectId: string | null, query: string, filters?: SpecSearchFilters) {
  return useQuery({
    queryKey: [...specKeys.all, 'search', projectId ?? '', query, filters],
    queryFn: () => {
      if (projectId) {
        api.setCurrentProjectId(projectId);
      }
      return api.searchSpecs(query, filters);
    },
    enabled: !!projectId && query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 1000,
  });
}

/**
 * Hook to fetch batch metadata (token counts, validation status) for a list of specs.
 * Fires as soon as spec names are available. Results are cached by the sorted spec name list.
 */
export function useBatchMetadata(projectId: string | null, specNames: string[]) {
  // Stable key: sort spec names so order doesn't affect cache hits
  const stableKey = useMemo(() => [...specNames].sort(), [specNames]);

  return useQuery({
    queryKey: [...specKeys.all, 'batch-metadata', projectId ?? '', stableKey],
    queryFn: () => {
      if (projectId) {
        api.setCurrentProjectId(projectId);
      }
      const backend = getBackend();
      return backend.getBatchMetadata(projectId!, stableKey);
    },
    enabled: !!projectId && stableKey.length > 0,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch a single spec's details
 */
export function useSpecDetail(projectId: string | null, specName: string | null) {
  return useQuery({
    queryKey: specKeys.detail(projectId ?? '', specName ?? ''),
    queryFn: () => {
      if (projectId) {
        api.setCurrentProjectId(projectId);
      }
      return api.getSpec(specName!);
    },
    enabled: !!projectId && !!specName,
    // Details are more stable
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch project stats
 */
export function useProjectStats(projectId: string | null) {
  return useQuery({
    queryKey: specKeys.stats(projectId ?? ''),
    queryFn: () => {
      if (projectId) {
        api.setCurrentProjectId(projectId);
      }
      return api.getStats();
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to fetch dependency graph
 */
export function useDependencyGraph(projectId: string | null, specName?: string) {
  return useQuery({
    queryKey: specKeys.dependencies(projectId ?? '', specName),
    queryFn: () => {
      if (projectId) {
        api.setCurrentProjectId(projectId);
      }
      return api.getDependencies(specName);
    },
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
}

/**
 * Mutation hook for updating spec metadata
 */
export function useUpdateSpec(projectId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      specName,
      updates,
    }: {
      specName: string;
      updates: Parameters<typeof api.updateSpec>[1];
    }) => api.updateSpec(specName, updates),

    // Optimistic update example
    onMutate: async ({ specName, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: specKeys.lists() });

      // Snapshot previous value
      const previousSpecs = queryClient.getQueryData(
        specKeys.list(projectId ?? '')
      );

      // Optimistically update the cache
      queryClient.setQueryData(
        specKeys.list(projectId ?? ''),
        (old: Spec[] | undefined) =>
          old?.map((spec) =>
            spec.specName === specName ? { ...spec, ...updates } : spec
          )
      );

      return { previousSpecs };
    },

    // Rollback on error
    onError: (_err, _variables, context) => {
      if (context?.previousSpecs) {
        queryClient.setQueryData(
          specKeys.list(projectId ?? ''),
          context.previousSpecs
        );
      }
    },

    // Refetch after success or error
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: specKeys.lists() });
      queryClient.invalidateQueries({ queryKey: specKeys.stats(projectId ?? '') });
    },
  });
}

/**
 * Hook to invalidate all spec queries (for SSE/external updates)
 */
export function useInvalidateSpecs() {
  const queryClient = useQueryClient();

  return () => {
    // Keep realtime updates focused on active list/detail/stats queries.
    // Avoid invalidating every specs sub-query (e.g. batch-metadata/search)
    // on each SSE/poll event, which can negate cache benefits.
    queryClient.invalidateQueries({ queryKey: specKeys.lists(), refetchType: 'active' });
    queryClient.invalidateQueries({ queryKey: specKeys.details(), refetchType: 'active' });
    queryClient.invalidateQueries({ queryKey: ['specs', 'stats'], refetchType: 'active' });
  };
}
