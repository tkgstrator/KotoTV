import type { AppType } from '@telemax/server/src/app'
import { hc } from 'hono/client'

export const api = hc<AppType>('/')
