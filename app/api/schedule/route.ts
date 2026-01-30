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

    // This is the desired RESERVATION time (when user wants to play)
    const reservationTime = new Date(`${date}T${time}`)

    // Validate reservation time is at least 7 days in the future
    const now = new Date()
    const minDate = new Date(now)
    minDate.setDate(minDate.getDate() + 7)

    if (reservationTime < minDate) {
      return NextResponse.json({
        success: false,
        error: 'Reservation must be at least 7 days in the future (reservations open 7 days ahead)'
      }, { status: 400 })
    }

    // Calculate when to RUN the script (7 days before reservation)
    const runTime = new Date(reservationTime)
    runTime.setDate(runTime.getDate() - 7)

    // If run time has already passed today, run immediately
    if (runTime <= now) {
      runTime.setTime(now.getTime() + 60000) // Run in 1 minute
    }

    store.setSchedule(runTime.toISOString(), reservationTime.toISOString())

    return NextResponse.json({
      success: true,
      runTime: runTime.toISOString(),
      reservationTime: reservationTime.toISOString(),
      message: `Script will run at ${runTime.toLocaleString()} to book court for ${reservationTime.toLocaleString()}`
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE() {
  store.cancelSchedule()
  return NextResponse.json({ success: true })
}
