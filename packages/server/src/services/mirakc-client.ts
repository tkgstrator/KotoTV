import { env } from '../lib/config'
import { logger } from '../lib/logger'
import type { MirakcProgram, MirakcService } from '../schemas/Channel.dto'

export class MirakcError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'MirakcError'
  }
}

// ---------------------------------------------------------------------------
// Mock fixture — plausible Japanese broadcast lineup
// ---------------------------------------------------------------------------

const MOCK_SERVICES: MirakcService[] = [
  // GR (地上波)
  { id: 1024, serviceId: 1024, networkId: 32736, type: 1, name: 'NHK総合', channel: { type: 'GR', channel: '27' } },
  { id: 1025, serviceId: 1025, networkId: 32736, type: 1, name: 'NHKEテレ', channel: { type: 'GR', channel: '26' } },
  { id: 1026, serviceId: 1026, networkId: 32736, type: 1, name: '日テレ', channel: { type: 'GR', channel: '25' } },
  { id: 1027, serviceId: 1027, networkId: 32736, type: 1, name: 'TBS', channel: { type: 'GR', channel: '22' } },
  { id: 1028, serviceId: 1028, networkId: 32736, type: 1, name: 'フジテレビ', channel: { type: 'GR', channel: '21' } },
  { id: 1029, serviceId: 1029, networkId: 32736, type: 1, name: 'テレビ朝日', channel: { type: 'GR', channel: '24' } },
  { id: 1030, serviceId: 1030, networkId: 32736, type: 1, name: 'テレビ東京', channel: { type: 'GR', channel: '23' } },
  { id: 1031, serviceId: 1031, networkId: 32736, type: 1, name: 'TOKYO MX', channel: { type: 'GR', channel: '20' } },
  // BS
  { id: 400101, serviceId: 101, networkId: 4, type: 1, name: 'NHKBS', channel: { type: 'BS', channel: 'BS01_0' } },
  { id: 400141, serviceId: 141, networkId: 4, type: 1, name: 'BS日テレ', channel: { type: 'BS', channel: 'BS13_0' } },
  { id: 400151, serviceId: 151, networkId: 4, type: 1, name: 'BS朝日', channel: { type: 'BS', channel: 'BS15_0' } },
  { id: 400161, serviceId: 161, networkId: 4, type: 1, name: 'BS-TBS', channel: { type: 'BS', channel: 'BS03_0' } },
  { id: 400171, serviceId: 171, networkId: 4, type: 1, name: 'BSフジ', channel: { type: 'BS', channel: 'BS05_0' } },
  { id: 400211, serviceId: 211, networkId: 4, type: 1, name: 'BS11', channel: { type: 'BS', channel: 'BS11_0' } },
  // CS
  { id: 6040, serviceId: 6040, networkId: 6, type: 1, name: 'CNNj', channel: { type: 'CS', channel: 'CS8' } },
  { id: 6020, serviceId: 6020, networkId: 6, type: 1, name: 'アニマックス', channel: { type: 'CS', channel: 'CS6' } },
  { id: 6030, serviceId: 6030, networkId: 6, type: 1, name: 'カートゥーンNW', channel: { type: 'CS', channel: 'CS7' } },
  { id: 6090, serviceId: 6090, networkId: 6, type: 1, name: 'GAORA SPORTS', channel: { type: 'CS', channel: 'CS9' } }
]

// Programs per service — 3 consecutive slots: now-1h, now, now+1h (each 1h long)
const MOCK_PROGRAM_TITLES: Record<number, [string, string, string]> = {
  1024: ['NHKニュース おはよう日本', '連続テレビ小説　あの頃の空', 'NHKニュース　正午'],
  1025: ['Eテレ　にほんごであそぼ', 'バリバラ', '趣味の園芸'],
  1026: ['ZIP!', '午前のニュース', 'ヒルナンデス！'],
  1027: ['グッとラック！', 'ひるおび', 'Nスタ'],
  1028: ['めざまし8', 'バイキングMORE', 'Live News イット！'],
  1029: ['羽鳥慎一モーニングショー', 'グッドモーニング', 'スーパーJチャンネル'],
  1030: ['モーサテ', 'ワールドビジネスサテライト', 'Newsモーニングサテライト'],
  1031: ['MX NEWS ZERO', 'ゴールデンアワー', 'アニメ　機動戦士ガンダム'],
  400101: ['BS1スペシャル', 'ドキュメンタリー　世界のリアル', 'NHKBS　映画劇場'],
  400141: ['BS日テレ　ドラマ', '地球・ふしぎ大自然', '遠くへ行きたい'],
  400151: ['BS朝日　歴史番組', 'テレメンタリー', 'BS朝日　洋画'],
  400161: ['BS-TBS　音楽番組', '噂の東京マガジン', 'アニマックス特別枠'],
  400171: ['BSフジ　プレミアム', 'プライムニュース', 'BSフジ　映画'],
  400211: ['BS11　アニメ', 'BS11　ニュース', '偉大な映画遺産'],
  6040: ['CNN NEWSROOM', 'WORLD SPORT', 'CNN INTERNATIONAL'],
  6020: ['アニメ　鬼滅の刃', 'アニマックス映画劇場', 'アニメ　進撃の巨人'],
  6030: ['トムとジェリー', 'カートゥーン特集', 'スターウォーズ アニメ'],
  6090: ['プロ野球ダイジェスト', 'サッカー　Jリーグ', 'スポーツニュース']
}

function buildMockPrograms(serviceId: number): MirakcProgram[] {
  const now = Date.now()
  const oneHour = 60 * 60 * 1000
  const titles = MOCK_PROGRAM_TITLES[serviceId] ?? ['番組A', '番組B', '番組C']
  return [
    { id: serviceId * 100 + 1, serviceId, startAt: now - oneHour, duration: oneHour, name: titles[0] },
    { id: serviceId * 100 + 2, serviceId, startAt: now, duration: oneHour, name: titles[1] },
    { id: serviceId * 100 + 3, serviceId, startAt: now + oneHour, duration: oneHour, name: titles[2] }
  ]
}

// ---------------------------------------------------------------------------
// Live fetch helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs = 1000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const mirakcClient = {
  async listServices(): Promise<MirakcService[]> {
    try {
      const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/services`)
      if (!res.ok) throw new MirakcError(res.status, `services ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data)) throw new MirakcError(200, 'unexpected shape')
      return data as MirakcService[]
    } catch (err) {
      logger.warn({ module: 'mirakc-client', fallback: true, err }, 'mirakc unreachable, using mock')
      return MOCK_SERVICES
    }
  },

  /**
   * Fetch programs for a single service using the 40-bit Mirakurun service id
   * (i.e. `MirakcService.id`, not the short `serviceId`).
   * `/api/programs?serviceId=X` is broken in mirakc — it ignores the filter and
   * returns all programs. The per-service endpoint is the only reliable one.
   */
  async listPrograms(id: number): Promise<MirakcProgram[]> {
    try {
      const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/services/${id}/programs`)
      if (!res.ok) throw new MirakcError(res.status, `programs ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data)) throw new MirakcError(200, 'unexpected shape')
      return data as MirakcProgram[]
    } catch (err) {
      logger.warn({ module: 'mirakc-client', fallback: true, id, err }, 'mirakc programs unreachable, using mock')
      return buildMockPrograms(id)
    }
  },

  /**
   * Fetch ALL programs from mirakc in one call and group by Mirakurun service id.
   * Used by the channel list route to avoid N+1 per-service calls.
   * Mirakurun id = networkId * 100000 + serviceId (decimal, not bit-shift).
   */
  async listAllProgramsByServiceId(): Promise<Map<number, MirakcProgram[]>> {
    try {
      const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/programs`, 30_000)
      if (!res.ok) throw new MirakcError(res.status, `programs ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data)) throw new MirakcError(200, 'unexpected shape')
      const programs = data as MirakcProgram[]
      const map = new Map<number, MirakcProgram[]>()
      for (const p of programs) {
        if (p.networkId === undefined) continue
        const mirakurunId = p.networkId * 100000 + p.serviceId
        let bucket = map.get(mirakurunId)
        if (!bucket) {
          bucket = []
          map.set(mirakurunId, bucket)
        }
        bucket.push(p)
      }
      return map
    } catch (err) {
      logger.warn({ module: 'mirakc-client', err }, 'listAllProgramsByServiceId failed, returning empty map')
      return new Map()
    }
  },

  async listProgramsInRange(params: { channelId: string; startAt: Date; endAt: Date }): Promise<MirakcProgram[]> {
    const startMs = params.startAt.getTime()
    const endMs = params.endAt.getTime()

    let all: MirakcProgram[]
    try {
      const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/services/${params.channelId}/programs`, 30_000)
      if (!res.ok) throw new MirakcError(res.status, `programs ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data)) throw new MirakcError(200, 'unexpected shape')
      all = data as MirakcProgram[]
    } catch (err) {
      logger.warn(
        { module: 'mirakc-client', fallback: true, channelId: params.channelId, err },
        'mirakc programs unreachable, using mock'
      )
      all = buildMockPrograms(Number(params.channelId))
    }

    // Keep programs whose time range overlaps [startMs, endMs)
    const filtered = all.filter((p) => {
      const programEnd = p.startAt + p.duration
      return p.startAt < endMs && programEnd > startMs
    })

    // Return sorted by startAt ascending
    filtered.sort((a, b) => a.startAt - b.startAt)
    return filtered
  },

  /**
   * Open a live MPEG-TS stream for a service from Mirakc.
   *
   * The returned ReadableStream must be consumed by the transcoder's stdin pump.
   * Call `cancel()` to abort both the stream reader and the underlying fetch.
   *
   * A 30-second connect timeout is applied automatically; the caller may
   * supply an additional AbortSignal (e.g. session-level abort) which will be
   * combined via AbortSignal.any().
   */
  async openLiveStream(
    channelId: string,
    signal?: AbortSignal
  ): Promise<{ stream: ReadableStream<Uint8Array>; cancel: () => Promise<void> }> {
    const timeoutSignal = AbortSignal.timeout(30_000)
    const combinedSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal

    const url = `${env.MIRAKC_URL}/api/services/${channelId}/stream?decode=1`
    const res = await fetch(url, { signal: combinedSignal })

    if (!res.ok) {
      throw new MirakcError(res.status, `openLiveStream ${res.status} for channel ${channelId}`)
    }

    if (!res.body) {
      throw new MirakcError(200, `openLiveStream: empty body for channel ${channelId}`)
    }

    const reader = res.body.getReader()

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await reader.read()
        if (done) {
          controller.close()
        } else {
          controller.enqueue(value)
        }
      },
      cancel() {
        reader.cancel()
      }
    })

    const cancel = async (): Promise<void> => {
      await reader.cancel()
    }

    return { stream, cancel }
  },

  getLogoUrl(serviceId: number): string {
    return `${env.MIRAKC_URL}/api/services/${serviceId}/logo`
  },

  async getAvailableTunerCount(): Promise<number> {
    if (_cachedTunerTotal !== null && Date.now() - _cachedTunerTotal.at < 60_000) {
      return _cachedTunerTotal.value
    }

    try {
      const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/status`, 5_000)
      if (!res.ok) throw new MirakcError(res.status, `status ${res.status}`)
      const data = (await res.json()) as {
        tuners?: Array<{ isAvailable?: boolean }>
      }
      const tuners = data.tuners ?? []
      const available = tuners.filter((t) => t.isAvailable === true).length
      const value = available > 0 ? available : 2
      _cachedTunerTotal = { value, at: Date.now() }
      return value
    } catch {
      logger.warn({ module: 'mirakc-client' }, 'cannot fetch tuner status, using cached or default')
      if (_cachedTunerTotal !== null) return _cachedTunerTotal.value
      return 2
    }
  }
}

let _cachedTunerTotal: { value: number; at: number } | null = null
