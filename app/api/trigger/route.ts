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
    const target = new Date(`${targetDate}T${targetTime}:00`)
    const bookingWindowOpens = new Date(target)
    bookingWindowOpens.setDate(bookingWindowOpens.getDate() - 7)

    const now = new Date()
    const msUntilWindow = bookingWindowOpens.getTime() - now.getTime()
    const hoursUntilWindow = msUntilWindow / (1000 * 60 * 60)

    // If booking window opens within 1 hour, trigger now (with run_at for precise timing)
    // Otherwise, create a scheduled issue for the cron to pick up
    if (hoursUntilWindow <= 1) {
      // Booking window opens within 1 hour - trigger workflow now with run_at for precise timing
      const runAt = bookingWindowOpens.toISOString()
      const shouldWait = msUntilWindow > 0 // Only wait if window hasn't opened yet

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
              run_at: shouldWait ? runAt : '', // Only set run_at if we need to wait
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

      const message = shouldWait
        ? `Booking triggered! Will execute at ${bookingWindowOpens.toLocaleString()} when window opens.`
        : `Booking started immediately for ${targetDate} at ${targetTime}`

      return NextResponse.json({
        success: true,
        scheduled: false,
        willWait: shouldWait,
        runAt: shouldWait ? runAt : null,
        message,
      })
    } else {
      // More than 7 days away - create a scheduled issue
      // Booking window opens exactly 7 days before at the SAME TIME
      const runDate = new Date(target)
      runDate.setDate(runDate.getDate() - 7)

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
            body: `Date: ${targetDate}\nTime: ${targetTime}\n\n---\nThis booking will run automatically on ${runDate.toLocaleDateString()} when the reservation window opens.`,
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
        runDate: runDate.toISOString(),
        issueNumber: issue.number,
        message: `Scheduled for ${targetDate} at ${targetTime}. Will book on ${runDate.toLocaleDateString()}.`,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
