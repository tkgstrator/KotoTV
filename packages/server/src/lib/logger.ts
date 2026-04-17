import pino from 'pino'
import { env } from './config'

export const logger = pino(
  {
    base: { service: 'server' },
    level: 'info'
  },
  env.NODE_ENV !== 'production' ? pino.transport({ target: 'pino-pretty', options: { colorize: true } }) : undefined
)
