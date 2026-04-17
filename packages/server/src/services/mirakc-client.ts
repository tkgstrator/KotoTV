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

  async listPrograms(serviceId: number): Promise<MirakcProgram[]> {
    try {
      const res = await fetchWithTimeout(`${env.MIRAKC_URL}/api/programs?serviceId=${serviceId}`)
      if (!res.ok) throw new MirakcError(res.status, `programs ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data)) throw new MirakcError(200, 'unexpected shape')
      return data as MirakcProgram[]
    } catch (err) {
      logger.warn(
        { module: 'mirakc-client', fallback: true, serviceId, err },
        'mirakc programs unreachable, using mock'
      )
      return buildMockPrograms(serviceId)
    }
  },

  getLogoUrl(serviceId: number): string {
    return `${env.MIRAKC_URL}/api/services/${serviceId}/logo`
  }
}
