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
      // Window not open yet - create a scheduled issue
      // Cron will trigger when booking window opens

      const response = await fetch(
        `https://api.github.com/repos/${githubRepo}/issues`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${githubToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: `Scheduled: ${targetDate} at ${targetTime}`,
            body: `Date: ${targetDate}\nTime: ${targetTime}\n\n---\nThis booking will run automatically on ${runDateStr} at ${targetTime} when the reservation window opens.`,
            labels: ['scheduled'],
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

      const issue = await response.json()

      return NextResponse.json({
        success: true,
        scheduled: true,
        runDate: runDateStr,
        issueNumber: issue.number,
        message: `Scheduled for ${targetDate} at ${targetTime}. Will book on ${runDateStr} at ${targetTime}.`,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
