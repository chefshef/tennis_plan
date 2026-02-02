import { NextResponse } from 'next/server'

export async function GET() {
  const redisUrl = process.env.REDIS_URL || ''

  // List ALL env var names to see what Railway is passing
  const allEnvNames = Object.keys(process.env).sort()

  return NextResponse.json({
    redisUrlSet: !!redisUrl,
    redisUrlPreview: redisUrl ? `${redisUrl.substring(0, 50)}...` : 'MISSING',
    allEnvNames: allEnvNames,
    allEnvCount: allEnvNames.length,
  })
}
