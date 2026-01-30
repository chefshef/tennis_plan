// Simple in-memory store (persists across requests in Railway's persistent container)
// For more durability, could swap to SQLite or Railway's Postgres

export interface LogEntry {
  time: string
  message: string
  type: 'info' | 'success' | 'error'
}

export interface AppState {
  // When the script should RUN (7 days before reservation)
  scheduledTime: string | null
  // The actual court reservation time the user wants
  targetReservationTime: string | null
  // Last run result
  lastRun: {
    time: string
    success: boolean
    message: string
  } | null
  // Activity logs
  logs: LogEntry[]
  // Retry state
  retryCount: number
  maxRetries: number
}

const MAX_LOGS = 100

class Store {
  private state: AppState = {
    scheduledTime: null,
    targetReservationTime: null,
    lastRun: null,
    logs: [],
    retryCount: 0,
    maxRetries: 10, // Retry up to 10 times (10 minutes)
  }

  getState(): AppState {
    return { ...this.state }
  }

  setSchedule(runTime: string, reservationTime: string) {
    this.state.scheduledTime = runTime
    this.state.targetReservationTime = reservationTime
    this.state.retryCount = 0
    this.addLog(`Scheduled: Run at ${new Date(runTime).toLocaleString()} to book ${new Date(reservationTime).toLocaleString()}`, 'info')
  }

  cancelSchedule() {
    this.state.scheduledTime = null
    this.state.targetReservationTime = null
    this.state.retryCount = 0
    this.addLog('Cancelled scheduled run', 'info')
  }

  getTargetReservationTime(): Date | null {
    return this.state.targetReservationTime ? new Date(this.state.targetReservationTime) : null
  }

  incrementRetry(): number {
    this.state.retryCount++
    return this.state.retryCount
  }

  shouldRetry(): boolean {
    return this.state.retryCount < this.state.maxRetries
  }

  setLastRun(success: boolean, message: string, clearSchedule: boolean = true) {
    this.state.lastRun = {
      time: new Date().toISOString(),
      success,
      message,
    }
    if (clearSchedule) {
      this.state.scheduledTime = null
      this.state.targetReservationTime = null
      this.state.retryCount = 0
    }
    this.addLog(message, success ? 'success' : 'error')
  }

  addLog(message: string, type: LogEntry['type'] = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`)
    this.state.logs.push({
      time: new Date().toISOString(),
      message,
      type,
    })
    // Keep only last N logs
    if (this.state.logs.length > MAX_LOGS) {
      this.state.logs = this.state.logs.slice(-MAX_LOGS)
    }
  }
}

// Singleton instance
export const store = new Store()
