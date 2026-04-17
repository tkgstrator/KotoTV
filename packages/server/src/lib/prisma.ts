import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'
import { env } from './config'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error']
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

// Reuse across bun --hot reloads instead of leaking connections
if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
})
