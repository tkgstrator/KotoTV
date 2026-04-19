import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import {
  type Channel,
  ChannelListQuerySchema,
  ChannelListResponseSchema,
  type MirakcProgram,
  type MirakcService
} from '../schemas/Channel.dto'
import { mirakcClient } from '../services/mirakc-client'

function msToIso(ms: number): string {
  return new Date(ms).toISOString()
}

function pickCurrentAndNext(
  programs: MirakcProgram[],
  now: number
): { current: MirakcProgram | null; next: MirakcProgram | null } {
  let current: MirakcProgram | null = null
  let next: MirakcProgram | null = null

  for (const p of programs) {
    const end = p.startAt + p.duration
    if (p.startAt <= now && now < end) {
      current = p
    } else if (p.startAt > now) {
      if (next === null || p.startAt < next.startAt) {
        next = p
      }
    }
  }
  return { current, next }
}

const channelsRoute = new Hono().get('/', zValidator('query', ChannelListQuerySchema), async (c) => {
  const { type } = c.req.valid('query')

  let services: MirakcService[]
  try {
    services = await mirakcClient.listServices()
  } catch (_err) {
    throw new HTTPException(502, { message: 'mirakc unavailable' })
  }

  // Only TV services (type === 0x01)
  const tvServices = services.filter((s) => s.type === 0x01)

  // Optional channel-type filter
  const filtered = type ? tvServices.filter((s) => s.channel?.type === type) : tvServices

  const now = Date.now()

  // Single bulk fetch — one round-trip for all services instead of N+1
  const programMap = await mirakcClient.listAllProgramsByServiceId()

  const channels: Channel[] = filtered.map((svc) => {
    const programs: MirakcProgram[] = programMap.get(svc.id) ?? []
    const { current, next } = pickCurrentAndNext(programs, now)

    return {
      id: String(svc.id),
      type: (svc.channel?.type ?? 'GR') as Channel['type'],
      serviceId: svc.serviceId,
      networkId: svc.networkId,
      name: svc.name,
      channelNumber: svc.channel?.channel ?? '',
      hasLogo: true,
      currentProgram: current
        ? {
            id: String(current.id),
            title: current.name ?? '(無題)',
            startAt: msToIso(current.startAt),
            endAt: msToIso(current.startAt + current.duration),
            synopsis: current.description
          }
        : null,
      nextProgram: next
        ? {
            id: String(next.id),
            title: next.name ?? '(無題)',
            startAt: msToIso(next.startAt),
            endAt: msToIso(next.startAt + next.duration),
            synopsis: next.description
          }
        : null
    }
  })

  const body = ChannelListResponseSchema.parse({
    channels,
    updatedAt: new Date().toISOString()
  })

  return c.json(body)
})

export default channelsRoute
