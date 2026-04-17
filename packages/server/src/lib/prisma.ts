import { PrismaClient } from '../generated/prisma'
import { env } from './config'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error']
  })

// Reuse across bun --hot reloads instead of leaking connections
if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
})
