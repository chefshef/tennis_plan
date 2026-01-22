// Simple in-memory store (persists across requests in Railway's persistent container)
// For more durability, could swap to SQLite or Railway's Postgres

export interface LogEntry {
  time: string
  message: string
  type: 'info' | 'success' | 'error'
}

export interface AppState {
  scheduledTime: string | null
  lastRun: {
    time: string
    success: boolean
    message: string
  } | null
  logs: LogEntry[]
}

const MAX_LOGS = 50

class Store {
  private state: AppState = {
    scheduledTime: null,
    lastRun: null,
    logs: [],
  }

  getState(): AppState {
    return { ...this.state }
  }

  setScheduledTime(time: string | null) {
    this.state.scheduledTime = time
    if (time) {
      this.addLog(`Scheduled run for ${new Date(time).toLocaleString()}`, 'info')
    } else {
      this.addLog('Cancelled scheduled run', 'info')
    }
  }

  setLastRun(success: boolean, message: string) {
    this.state.lastRun = {
      time: new Date().toISOString(),
      success,
      message,
    }
    this.state.scheduledTime = null
    this.addLog(message, success ? 'success' : 'error')
  }

  addLog(message: string, type: LogEntry['type'] = 'info') {
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
