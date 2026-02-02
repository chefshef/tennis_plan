import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/lib/store'
import { notifyScheduled } from '@/lib/notify'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, time } = body

    if (!date || !time) {
      return NextResponse.json({ success: false, error: 'Date and time required' }, { status: 400 })
    }

    // This is the desired RESERVATION time (when user wants to play)
    const reservationTime = new Date(`${date}T${time}`)
    const now = new Date()

    // Validate reservation time is in the future
    if (reservationTime <= now) {
      return NextResponse.json({
        success: false,
        error: 'Reservation time must be in the future'
      }, { status: 400 })
    }

    // Calculate when to RUN the script (7 days before reservation)
    const runTime = new Date(reservationTime)
    runTime.setDate(runTime.getDate() - 7)

    // If run time has already passed, run in 1 minute
    // This handles cases where reservation is less than 7 days away
    if (runTime <= now) {
      runTime.setTime(now.getTime() + 60000) // Run in 1 minute
    }

    await store.setSchedule(runTime.toISOString(), reservationTime.toISOString())

    // Send notification
    await notifyScheduled(reservationTime, runTime)

    return NextResponse.json({
      success: true,
      runTime: runTime.toISOString(),
      reservationTime: reservationTime.toISOString(),
      message: `Script will run at ${runTime.toLocaleString()} to book court for ${reservationTime.toLocaleString()}`
    })
  } catch (error) {
    console.error('Schedule error:', error)
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE() {
  await store.cancelSchedule()
  return NextResponse.json({ success: true })
}
