import cron from 'node-cron'
import { store } from './store'
import { runAutomationWithRetry } from './browser'

let schedulerInitialized = false

export function initScheduler() {
  if (schedulerInitialized) return
  schedulerInitialized = true

  console.log('[SCHEDULER] Initialized - checking every minute')
  store.addLog('Scheduler initialized', 'info')

  // Check every minute if we need to run
  cron.schedule('* * * * *', async () => {
    const state = await store.getStateAsync()

    if (!state.scheduledTime) return

    const scheduledDate = new Date(state.scheduledTime)
    const now = new Date()

    // Check if it's time to run (within 1 minute window)
    const diffMs = scheduledDate.getTime() - now.getTime()

    // Run if we're within the window OR if we have pending retries
    const shouldRun = (diffMs <= 0 && diffMs > -60000) || state.retryCount > 0

    if (shouldRun) {
      console.log('[SCHEDULER] Running automation...')

      try {
        const result = await runAutomationWithRetry()

        if (result.success) {
          await store.setLastRun(true, result.message)
        } else if (!result.message.includes('will retry')) {
          // Final failure
          await store.setLastRun(false, result.message)
        }
        // If message includes "will retry", the schedule stays active
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        await store.setLastRun(false, `Scheduler error: ${message}`)
      }
    }
  })
}
