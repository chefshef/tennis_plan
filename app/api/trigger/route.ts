import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { targetDate, targetTime } = body

    if (!targetDate || !targetTime) {
      return NextResponse.json(
        { success: false, error: 'Missing targetDate or targetTime' },
        { status: 400 }
      )
    }

    const githubToken = process.env.GITHUB_TOKEN
    const githubRepo = process.env.GITHUB_REPO || 'chefshef/tennis_plan'

    if (!githubToken) {
      return NextResponse.json(
        { success: false, error: 'GITHUB_TOKEN not configured' },
        { status: 500 }
      )
    }

    // Calculate when booking window opens (exactly 7 days before target, at same time)
    // Parse target date components
    const [year, month, day] = targetDate.split('-').map(Number)
    const [hour, minute] = targetTime.split(':').map(Number)

    // Calculate run date (7 days before target)
    const runDate = new Date(year, month - 1, day - 7)
    const runDateStr = `${runDate.getFullYear()}-${String(runDate.getMonth() + 1).padStart(2, '0')}-${String(runDate.getDate()).padStart(2, '0')}`

    // Get current date/time in EST
    const nowEST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const nowDateStr = `${nowEST.getFullYear()}-${String(nowEST.getMonth() + 1).padStart(2, '0')}-${String(nowEST.getDate()).padStart(2, '0')}`
    const nowHour = nowEST.getHours()
    const nowMinute = nowEST.getMinutes()

    console.log(`Target: ${targetDate} ${targetTime}, Run date: ${runDateStr}, Now (EST): ${nowDateStr} ${nowHour}:${nowMinute}`)

    // Check if booking window is open:
    // - If today is AFTER run date, window is open
    // - If today IS run date AND current time >= target time, window is open
    const windowIsOpen = (nowDateStr > runDateStr) ||
                         (nowDateStr === runDateStr && (nowHour > hour || (nowHour === hour && nowMinute >= minute)))

    console.log(`Window is open: ${windowIsOpen}`)

    // If booking window is ALREADY OPEN, trigger now
    // Otherwise, create a scheduled issue for the cron to pick up at the right time
    if (windowIsOpen) {
      // Booking window already open - trigger workflow now
      const response = await fetch(
        `https://api.github.com/repos/${githubRepo}/actions/workflows/book-court.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              target_date: targetDate,
              target_time: targetTime,
            },
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('GitHub API error:', response.status, errorText)
        return NextResponse.json(
          { success: false, error: `GitHub API error: ${response.status}` },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        scheduled: false,
        message: `Booking started for ${targetDate} at ${targetTime}`,
      })
    } else {
      // Window not open yet - add to scheduled bookings file
      // Cron will trigger when booking window opens

      // Calculate exact trigger timestamp (booking window time in epoch ms)
      const bookingWindowDate = new Date(year, month - 1, day - 7, hour, minute)
      const triggerAt = bookingWindowDate.getTime()

      // Get current scheduled bookings
      const fileResponse = await fetch(
        `https://api.github.com/repos/${githubRepo}/contents/scheduled-bookings.json`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${githubToken}`,
          },
        }
      )

      let bookings: Array<{ targetDate: string; targetTime: string; triggerAt: number; id: string }> = []
      let fileSha = ''

      if (fileResponse.ok) {
        const fileData = await fileResponse.json()
        fileSha = fileData.sha
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8')
        const parsed = JSON.parse(content)
        bookings = parsed.bookings || []
      }

      // Add new booking
      const bookingId = `${targetDate}-${targetTime}-${Date.now()}`
      bookings.push({
        id: bookingId,
        targetDate,
        targetTime,
        triggerAt,
      })

      // Update file in repo
      const updateResponse = await fetch(
        `https://api.github.com/repos/${githubRepo}/contents/scheduled-bookings.json`,
        {
          method: 'PUT',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Schedule booking for ${targetDate} at ${targetTime}`,
            content: Buffer.from(JSON.stringify({ bookings }, null, 2)).toString('base64'),
            sha: fileSha,
          }),
        }
      )

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        console.error('GitHub API error:', updateResponse.status, errorText)
        return NextResponse.json(
          { success: false, error: `GitHub API error: ${updateResponse.status}` },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        scheduled: true,
        runDate: runDateStr,
        bookingId,
        message: `Scheduled for ${targetDate} at ${targetTime}. Will book on ${runDateStr} at ${targetTime}.`,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
