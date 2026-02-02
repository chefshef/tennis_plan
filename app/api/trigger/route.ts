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

    // Trigger the GitHub Actions workflow
    const response = await fetch(
      `https://api.github.com/repos/${githubRepo}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'book-court',
          client_payload: {
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
      message: `Booking workflow triggered for ${targetDate} at ${targetTime}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
