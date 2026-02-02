import fs from 'fs'
import path from 'path'

// Use a file for persistence on Railway
const DATA_FILE = process.env.DATA_FILE || '/tmp/tennis-scheduler-data.json'

export interface LogEntry {
  time: string
  message: string
  type: 'info' | 'success' | 'error'
}

export interface AppState {
  scheduledTime: string | null
  targetReservationTime: string | null
  lastRun: {
    time: string
    success: boolean
    message: string
  } | null
  logs: LogEntry[]
  retryCount: number
  maxRetries: number
}

const MAX_LOGS = 100

const DEFAULT_STATE: AppState = {
  scheduledTime: null,
  targetReservationTime: null,
  lastRun: null,
  logs: [],
  retryCount: 0,
  maxRetries: 10,
}

function loadState(): AppState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(data)
      console.log('[STORE] Loaded state from file:', DATA_FILE)
      return { ...DEFAULT_STATE, ...parsed }
    }
  } catch (error) {
    console.error('[STORE] Error loading state:', error)
  }
  return { ...DEFAULT_STATE }
}

function saveState(state: AppState): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(DATA_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2))
    console.log('[STORE] Saved state to file')
  } catch (error) {
    console.error('[STORE] Error saving state:', error)
  }
}

class Store {
  private state: AppState

  constructor() {
    this.state = loadState()
    if (this.state.logs.length === 0) {
      this.addLog('Scheduler initialized', 'info')
    }
  }

  getState(): AppState {
    // Always reload from disk to ensure consistency
    this.state = loadState()
    return { ...this.state }
  }

  private save() {
    saveState(this.state)
  }

  setSchedule(runTime: string, reservationTime: string) {
    this.state = loadState() // Reload first
    this.state.scheduledTime = runTime
    this.state.targetReservationTime = reservationTime
    this.state.retryCount = 0
    this.addLog(`Scheduled: Run at ${new Date(runTime).toLocaleString()} to book ${new Date(reservationTime).toLocaleString()}`, 'info')
    this.save()
  }

  cancelSchedule() {
    this.state = loadState()
    this.state.scheduledTime = null
    this.state.targetReservationTime = null
    this.state.retryCount = 0
    this.addLog('Cancelled scheduled run', 'info')
    this.save()
  }

  getTargetReservationTime(): Date | null {
    this.state = loadState()
    return this.state.targetReservationTime ? new Date(this.state.targetReservationTime) : null
  }

  incrementRetry(): number {
    this.state = loadState()
    this.state.retryCount++
    this.save()
    return this.state.retryCount
  }

  shouldRetry(): boolean {
    this.state = loadState()
    return this.state.retryCount < this.state.maxRetries
  }

  setLastRun(success: boolean, message: string, clearSchedule: boolean = true) {
    this.state = loadState()
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
    this.save()
  }

  addLog(message: string, type: LogEntry['type'] = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`)
    this.state.logs.push({
      time: new Date().toISOString(),
      message,
      type,
    })
    if (this.state.logs.length > MAX_LOGS) {
      this.state.logs = this.state.logs.slice(-MAX_LOGS)
    }
    // Note: Don't call save() here to avoid recursive saves
    // The caller should call save() when needed
  }
}

// Singleton instance
export const store = new Store()
