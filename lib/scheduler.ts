import cron from 'node-cron'
import { store } from './store'
import { runAutomation } from './browser'

let schedulerInitialized = false

export function initScheduler() {
  if (schedulerInitialized) return
  schedulerInitialized = true

  console.log('Initializing scheduler - checking every minute')
  store.addLog('Scheduler initialized', 'info')

  // Check every minute if we need to run
  cron.schedule('* * * * *', async () => {
    const state = store.getState()

    if (!state.scheduledTime) return

    const scheduledDate = new Date(state.scheduledTime)
    const now = new Date()

    // Check if it's time to run (within 1 minute window)
    const diffMs = scheduledDate.getTime() - now.getTime()

    if (diffMs <= 0 && diffMs > -60000) {
      console.log('Scheduled time reached, running automation...')
      store.addLog('Scheduled time reached, starting run...', 'info')

      try {
        const result = await runAutomation()
        store.setLastRun(result.success, result.message)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        store.setLastRun(false, `Scheduler error: ${message}`)
      }
    }
  })
}
