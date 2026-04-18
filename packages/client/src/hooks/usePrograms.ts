import type { Program } from '@kototv/server/src/schemas/Program.dto'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export type { Program }

interface UseProgramsOptions {
  channelId: string
  startAt: string
  endAt: string
  enabled?: boolean
}

export function usePrograms({ channelId, startAt, endAt, enabled = true }: UseProgramsOptions) {
  return useQuery({
    queryKey: ['programs', channelId, startAt, endAt] as const,
    queryFn: async () => {
      const res = await api.api.programs.$get({ query: { channelId, startAt, endAt } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 5 * 60_000,
    enabled: enabled && Boolean(channelId && startAt && endAt)
  })
}

export function useProgramsForChannels(channelIds: string[], startAt: string, endAt: string) {
  return useQueries({
    queries: channelIds.map((channelId) => ({
      queryKey: ['programs', channelId, startAt, endAt] as const,
      queryFn: async () => {
        const res = await api.api.programs.$get({ query: { channelId, startAt, endAt } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      },
      staleTime: 5 * 60_000
    }))
  })
}
