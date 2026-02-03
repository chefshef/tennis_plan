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
    const cronJobApiKey = process.env.CRONJOB_API_KEY

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

    // Calculate run date (7 days before target) - handles month boundaries
    const runDateTime = new Date(year, month - 1, day - 7, hour, minute)
    const runDateStr = `${runDateTime.getFullYear()}-${String(runDateTime.getMonth() + 1).padStart(2, '0')}-${String(runDateTime.getDate()).padStart(2, '0')}`

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
      // Window not open yet - schedule via cron-job.org
      if (!cronJobApiKey) {
        return NextResponse.json(
          { success: false, error: 'CRONJOB_API_KEY not configured' },
          { status: 500 }
        )
      }

      // Get the webhook URL (this Vercel deployment)
      const webhookUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/webhook`
        : process.env.WEBHOOK_URL || 'https://tennis-plan.vercel.app/api/webhook'

      // Schedule the cron job for exactly when booking window opens (in UTC)
      // EST is UTC-5, so add 5 hours to convert EST to UTC
      const scheduleHourUTC = (hour + 5) % 24
      const scheduleDayAdjust = (hour + 5) >= 24 ? 1 : 0

      const scheduleDay = day - 7 + scheduleDayAdjust
      const scheduleMonth = month
      const scheduleYear = year

      // Calculate the actual run date (handles month boundaries)
      const runDate = new Date(year, month - 1, day - 7, hour, minute)
      const runDay = runDate.getDate()
      const runMonth = runDate.getMonth() + 1 // 1-indexed for cron-job.org
      const runHour = runDate.getHours()
      const runMinute = runDate.getMinutes()

      console.log(`Scheduling cron for: ${runMonth}/${runDay} at ${runHour}:${String(runMinute).padStart(2, '0')} EST`)

      // Create cron job via cron-job.org API
      const cronResponse = await fetch('https://api.cron-job.org/jobs', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${cronJobApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job: {
            title: `Tennis: ${targetDate} ${targetTime}`,
            url: `${webhookUrl}?date=${targetDate}&time=${targetTime}`,
            enabled: true,
            saveResponses: true,
            schedule: {
              timezone: 'America/New_York',
              hours: [runHour],
              minutes: [runMinute],
              mdays: [runDay],
              months: [runMonth],
              wdays: [-1],
            },
            requestMethod: 1, // GET
          },
        }),
      })

      if (!cronResponse.ok) {
        const errorText = await cronResponse.text()
        console.error('cron-job.org API error:', cronResponse.status, errorText)
        return NextResponse.json(
          { success: false, error: `Scheduling error: ${cronResponse.status} - ${errorText}` },
          { status: 500 }
        )
      }

      const cronResult = await cronResponse.json()
      const jobId = cronResult.jobId

      // Update the job URL to include the jobId so webhook can delete it after running
      if (jobId) {
        await fetch(`https://api.cron-job.org/jobs/${jobId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${cronJobApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            job: {
              url: `${webhookUrl}?date=${targetDate}&time=${targetTime}&jobId=${jobId}`,
            },
          }),
        })
      }

      return NextResponse.json({
        success: true,
        scheduled: true,
        runDate: runDateStr,
        runTime: targetTime,
        cronJobId: jobId,
        message: `Scheduled for ${targetDate} at ${targetTime}. Will book on ${runDateStr} at ${targetTime} EST.`,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
