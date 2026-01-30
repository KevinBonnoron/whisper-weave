import { useQuery } from '@tanstack/react-query';
import { pluginsClient } from '@/clients/plugins.client';

const REFETCH_INTERVAL_MS = 60_000;

export const instancesQueryKey = ['plugins', 'instances'] as const;

export function useInstances() {
  return useQuery({
    queryKey: instancesQueryKey,
    queryFn: () => pluginsClient.getInstances(),
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
