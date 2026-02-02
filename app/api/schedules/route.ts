import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const githubToken = process.env.GITHUB_TOKEN
    const githubRepo = process.env.GITHUB_REPO || 'chefshef/tennis_plan'

    if (!githubToken) {
      return NextResponse.json(
        { success: false, error: 'GITHUB_TOKEN not configured' },
        { status: 500 }
      )
    }

    // Fetch open issues with 'scheduled' label
    const response = await fetch(
      `https://api.github.com/repos/${githubRepo}/issues?labels=scheduled&state=open`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${githubToken}`,
        },
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `GitHub API error: ${response.status}` },
        { status: 500 }
      )
    }

    const issues = await response.json()

    const schedules = issues.map((issue: any) => {
      // Parse date and time from body
      const dateMatch = issue.body?.match(/Date: (\d{4}-\d{2}-\d{2})/)
      const timeMatch = issue.body?.match(/Time: (\d{2}:\d{2})/)

      const targetDate = dateMatch?.[1] || null
      const targetTime = timeMatch?.[1] || null

      // Booking window opens exactly 7 days before at the SAME TIME
      let runDate = null
      let runTime = null
      if (targetDate && targetTime) {
        const target = new Date(`${targetDate}T${targetTime}:00`)
        target.setDate(target.getDate() - 7)
        runDate = target.toISOString().split('T')[0]
        runTime = targetTime // Same time as target
      }

      // Check if already triggered
      const isTriggered = issue.labels?.some((l: any) => l.name === 'triggered')

      return {
        id: issue.number,
        targetDate,
        targetTime,
        runDate,
        runTime,
        isTriggered,
        createdAt: issue.created_at,
        url: issue.html_url,
      }
    })

    return NextResponse.json({ success: true, schedules })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const issueNumber = searchParams.get('id')

    if (!issueNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing issue ID' },
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

    // Close the issue to cancel the scheduled booking
    const response = await fetch(
      `https://api.github.com/repos/${githubRepo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: 'closed' }),
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `GitHub API error: ${response.status}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: 'Booking cancelled' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
