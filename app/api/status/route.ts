import { NextResponse } from 'next/server'
import { store } from '@/lib/store'

export async function GET() {
  const state = await store.getStateAsync()

  return NextResponse.json({
    scheduled: !!state.scheduledTime,
    scheduledTime: state.scheduledTime,
    targetReservationTime: state.targetReservationTime,
    lastRun: state.lastRun,
    logs: state.logs,
    retryCount: state.retryCount,
    maxRetries: state.maxRetries,
  })
}
