import type { AppType } from '@kototv/server/src/app'
import { hc } from 'hono/client'

export const api = hc<AppType>('/')
