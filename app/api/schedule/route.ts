import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/lib/store'
import { initScheduler } from '@/lib/scheduler'

// Initialize scheduler on first API call
initScheduler()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, time } = body

    if (!date || !time) {
      return NextResponse.json({ success: false, error: 'Date and time required' }, { status: 400 })
    }

    // Combine date and time into ISO string
    const scheduledTime = new Date(`${date}T${time}`).toISOString()

    // Validate it's in the future
    if (new Date(scheduledTime) <= new Date()) {
      return NextResponse.json({ success: false, error: 'Scheduled time must be in the future' }, { status: 400 })
    }

    store.setScheduledTime(scheduledTime)

    return NextResponse.json({ success: true, scheduledTime })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE() {
  store.setScheduledTime(null)
  return NextResponse.json({ success: true })
}
