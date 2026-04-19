import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'
import { env } from './config'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
  return new PrismaClient({
    adapter,
    // Query-level logging floods stdout during EPG sync (~20k program
    // upserts); keep it to warn/error unless DEBUG_PRISMA=1 is set.
    log: Bun.env.DEBUG_PRISMA === '1' ? ['query', 'warn', 'error'] : ['warn', 'error']
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
