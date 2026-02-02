import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

export async function GET() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || ''
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || ''

  // List all env vars that start with UPSTASH or REDIS
  const envVars = Object.keys(process.env)
    .filter(key => key.includes('UPSTASH') || key.includes('REDIS') || key.includes('RAILWAY'))
    .map(key => `${key}=${process.env[key]?.substring(0, 20)}...`)

  const result: Record<string, unknown> = {
    redisUrlSet: !!redisUrl,
    redisUrlPreview: redisUrl ? `${redisUrl.substring(0, 40)}...` : 'MISSING',
    redisTokenSet: !!redisToken,
    relevantEnvVars: envVars,
    allEnvCount: Object.keys(process.env).length,
  }

  if (redisUrl && redisToken) {
    try {
      const redis = new Redis({ url: redisUrl, token: redisToken })
      await redis.set('test-key', 'test-value')
      const value = await redis.get('test-key')
      result.redisConnection = 'OK'
      result.testValue = value
    } catch (error) {
      result.redisConnection = 'FAILED'
      result.error = error instanceof Error ? error.message : String(error)
    }
  } else {
    result.redisConnection = 'NOT_CONFIGURED'
  }

  return NextResponse.json(result)
}
