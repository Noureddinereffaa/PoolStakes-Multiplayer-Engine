import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function buildDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (url.includes('connection_limit=')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}connection_limit=5&pool_timeout=10`;
}

const prisma = new PrismaClient({
  datasourceUrl: buildDatasourceUrl(),
});

prisma.$use(async (params, next) => {
  const result = await next(params);
  deepConvertDecimals(result);
  return result;
});

function deepConvertDecimals(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const item of obj) deepConvertDecimals(item);
    return;
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val instanceof Prisma.Decimal) {
      (obj as Record<string, unknown>)[key] = val.toNumber();
    } else if (typeof val === 'object') {
      deepConvertDecimals(val);
    }
  }
}

export { prisma };

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
