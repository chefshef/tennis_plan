import { NextRequest, NextResponse } from 'next/server'

// This webhook is called by cron-job.org at the scheduled time
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const targetDate = searchParams.get('date')
  const targetTime = searchParams.get('time')
  const jobId = searchParams.get('jobId')

  if (!targetDate || !targetTime) {
    return NextResponse.json(
      { success: false, error: 'Missing date or time parameter' },
      { status: 400 }
    )
  }

  const githubToken = process.env.GITHUB_TOKEN
  const githubRepo = process.env.GITHUB_REPO || 'chefshef/tennis_plan'
  const cronJobApiKey = process.env.CRONJOB_API_KEY

  if (!githubToken) {
    return NextResponse.json(
      { success: false, error: 'GITHUB_TOKEN not configured' },
      { status: 500 }
    )
  }

  console.log(`Webhook triggered for ${targetDate} at ${targetTime}`)

  // Delete the cron job so it doesn't run again next year
  if (jobId && cronJobApiKey) {
    try {
      await fetch(`https://api.cron-job.org/jobs/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${cronJobApiKey}`,
        },
      })
      console.log(`Deleted cron job ${jobId}`)
    } catch (e) {
      console.error('Failed to delete cron job:', e)
    }
  }

  // Trigger the GitHub workflow
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
    message: `Booking triggered for ${targetDate} at ${targetTime}`,
  })
}
