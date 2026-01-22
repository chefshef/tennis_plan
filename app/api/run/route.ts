import { NextResponse } from 'next/server'
import { store } from '@/lib/store'
import { runAutomation } from '@/lib/browser'
import { initScheduler } from '@/lib/scheduler'

// Initialize scheduler on first API call
initScheduler()

export async function POST() {
  try {
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
