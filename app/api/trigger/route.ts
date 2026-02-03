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

    // If booking window is ALREADY OPEN (past), trigger now
    // Otherwise, create a scheduled issue for the cron to pick up at the right time
    if (msUntilWindow <= 0) {
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
