import type { ChannelType } from '@kototv/server/src/schemas/Channel.dto'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export type { ChannelType }

export function useChannels(type?: ChannelType) {
  return useQuery({
    queryKey: ['channels', type ?? 'all'] as const,
    queryFn: async () => {
      const res = await api.api.channels.$get({ query: type ? { type } : {} })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 30_000
  })
}
