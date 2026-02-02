import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

export async function GET() {
  const UPSTASH_URL = 'https://helpful-penguin-61658.upstash.io'
  const UPSTASH_TOKEN = 'AfDaAAIncDFkNDhlMTQyMWZjNzA0ZWQ1YmIzOTIzZDI0ODI5ZjRlZXAxNjE2NTg'

  try {
    const redis = new Redis({
      url: UPSTASH_URL,
      token: UPSTASH_TOKEN,
    })

    // Test write
    await redis.set('test-key', 'hello-' + Date.now())

    // Test read
    const value = await redis.get('test-key')

    return NextResponse.json({
      status: 'OK',
      testValue: value,
      message: 'Redis connection working!'
    })
  } catch (error) {
    return NextResponse.json({
      status: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
