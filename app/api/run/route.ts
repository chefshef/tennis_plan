import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/lib/store'
import { runAutomation } from '@/lib/browser'
import { initScheduler } from '@/lib/scheduler'

// Initialize scheduler on first API call
initScheduler()

export async function POST(request: NextRequest) {
  try {
    // For manual runs, allow passing a target time
    let targetTime: Date | null = null

    try {
      const body = await request.json()
      if (body.targetTime) {
        targetTime = new Date(body.targetTime)
      }
    } catch {
      // No body or invalid JSON, check if there's already a scheduled target
    }

    // If no target time provided and none scheduled, we can't run
    const state = store.getState()
    if (!targetTime && !state.targetReservationTime) {
      return NextResponse.json({
        success: false,
        error: 'No target reservation time set. Schedule a reservation first.'
      }, { status: 400 })
    }

    // If a new target time was provided, set it temporarily
    if (targetTime) {
      store.setSchedule(new Date().toISOString(), targetTime.toISOString())
    }

    store.addLog('Manual run triggered', 'info')
    const result = await runAutomation()
    store.setLastRun(result.success, result.message)

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    store.setLastRun(false, message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
