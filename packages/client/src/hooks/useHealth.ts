import type { HealthLogsResponse, HealthResponse } from '@kototv/server/src/schemas/Health.dto'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export type { HealthLogsResponse, HealthResponse }

export type Subsystem = 'mirakc' | 'postgres' | 'ffmpeg' | 'tuners'

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.api.health.$get()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<HealthResponse>
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false
  })
}

export function useHealthLogs(subsystem: Subsystem | undefined) {
  return useQuery<HealthLogsResponse>({
    queryKey: ['health', 'logs', subsystem],
    enabled: subsystem !== undefined,
    queryFn: async () => {
      if (!subsystem) throw new Error('subsystem required')
      const res = await api.api.health.logs.$get({ query: { subsystem } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<HealthLogsResponse>
    },
    staleTime: 5_000
  })
}
