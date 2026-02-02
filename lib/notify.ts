/**
 * Simple notification system using ntfy.sh
 *
 * To receive notifications:
 * 1. Install ntfy app on your phone (iOS/Android) or use browser at ntfy.sh
 * 2. Subscribe to the topic: tennis-booker-zw
 * 3. You'll get push notifications when bookings succeed or fail
 */

const NTFY_TOPIC = process.env.NTFY_TOPIC || 'tennis-booker-zw'
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`

export async function sendNotification(
  title: string,
  message: string,
  priority: 'low' | 'default' | 'high' = 'default',
  tags: string[] = []
): Promise<boolean> {
  try {
    const response = await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Title': title,
        'Priority': priority === 'high' ? '5' : priority === 'low' ? '2' : '3',
        'Tags': tags.join(','),
      },
      body: message,
    })

    if (response.ok) {
      console.log(`[NOTIFY] Sent: ${title}`)
      return true
    } else {
      console.error(`[NOTIFY] Failed: ${response.status}`)
      return false
    }
  } catch (error) {
    console.error('[NOTIFY] Error:', error)
    return false
  }
}

export async function notifySuccess(courtName: string, time: string): Promise<void> {
  await sendNotification(
    'Tennis Court Booked!',
    `Successfully booked ${courtName} at ${time}`,
    'high',
    ['white_check_mark', 'tennis']
  )
}

export async function notifyFailure(reason: string): Promise<void> {
  await sendNotification(
    'Booking Failed',
    reason,
    'high',
    ['x', 'warning']
  )
}

export async function notifyRetry(attempt: number, maxAttempts: number, reason: string): Promise<void> {
  await sendNotification(
    `Retry ${attempt}/${maxAttempts}`,
    `${reason} - will try again in 1 minute`,
    'default',
    ['hourglass']
  )
}

export async function notifyScheduled(reservationTime: Date, runTime: Date): Promise<void> {
  const reservationStr = reservationTime.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  const runStr = runTime.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })

  await sendNotification(
    'Booking Scheduled',
    `Will book court for ${reservationStr}\nScript runs: ${runStr}`,
    'default',
    ['calendar', 'tennis']
  )
}
