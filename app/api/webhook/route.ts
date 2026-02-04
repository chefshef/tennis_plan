import { NextRequest, NextResponse } from 'next/server'

// Handle the webhook logic
async function handleWebhook(request: NextRequest) {
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

  // Calculate when this should actually run (7 days before target)
  const [year, month, day] = targetDate.split('-').map(Number)
  const [hour, minute] = targetTime.split(':').map(Number)
  const scheduledRunTime = new Date(year, month - 1, day - 7, hour, minute)

  // Get current time in EST
  const nowEST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))

  // Only proceed if we're within 10 minutes of scheduled time
  const diffMinutes = Math.abs(nowEST.getTime() - scheduledRunTime.getTime()) / (1000 * 60)

  if (diffMinutes > 10) {
    console.log(`Webhook called too early. Scheduled: ${scheduledRunTime.toISOString()}, Now: ${nowEST.toISOString()}, Diff: ${diffMinutes} mins`)
    return NextResponse.json({
      success: false,
      error: 'Not time yet',
      scheduledFor: scheduledRunTime.toISOString(),
      currentTime: nowEST.toISOString(),
    })
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

  console.log(`Webhook triggered for ${targetDate} at ${targetTime} - proceeding with booking`)

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

// Support both GET and POST (cron-job.org might use either)
export async function GET(request: NextRequest) {
  return handleWebhook(request)
}

export async function POST(request: NextRequest) {
  return handleWebhook(request)
}
