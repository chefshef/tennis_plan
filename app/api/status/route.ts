import { NextResponse } from 'next/server'
import { store } from '@/lib/store'
import { initScheduler } from '@/lib/scheduler'

// Initialize scheduler on first API call
initScheduler()

export async function GET() {
  const state = store.getState()

  return NextResponse.json({
    scheduled: !!state.scheduledTime,
    scheduledTime: state.scheduledTime,
    lastRun: state.lastRun,
    logs: state.logs,
  })
}
