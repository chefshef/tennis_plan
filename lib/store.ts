import { Redis } from '@upstash/redis'

// Initialize Upstash Redis client
// Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Railway env vars
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || ''
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || ''

console.log('[STORE] Redis URL configured:', redisUrl ? `${redisUrl.substring(0, 30)}...` : 'MISSING')
console.log('[STORE] Redis Token configured:', redisToken ? 'SET' : 'MISSING')

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
})

const STORE_KEY = 'tennis-scheduler-state'

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

async function loadState(): Promise<AppState> {
  try {
    const data = await redis.get<AppState>(STORE_KEY)
    if (data) {
      console.log('[STORE] Loaded state from Redis')
      return { ...DEFAULT_STATE, ...data }
    }
  } catch (error) {
    console.error('[STORE] Error loading state from Redis:', error)
  }
  return { ...DEFAULT_STATE }
}

async function saveState(state: AppState): Promise<void> {
  try {
    await redis.set(STORE_KEY, state)
    console.log('[STORE] Saved state to Redis')
  } catch (error) {
    console.error('[STORE] Error saving state to Redis:', error)
  }
}

// Synchronous wrapper for compatibility - uses cached state
let cachedState: AppState = { ...DEFAULT_STATE }
let stateLoaded = false

class Store {
  async init(): Promise<void> {
    if (!stateLoaded) {
      cachedState = await loadState()
      stateLoaded = true
      if (cachedState.logs.length === 0) {
        cachedState.logs.push({
          time: new Date().toISOString(),
          message: 'Scheduler initialized',
          type: 'info',
        })
        await saveState(cachedState)
      }
    }
  }

  getState(): AppState {
    return { ...cachedState }
  }

  async getStateAsync(): Promise<AppState> {
    cachedState = await loadState()
    return { ...cachedState }
  }

  async setSchedule(runTime: string, reservationTime: string): Promise<void> {
    cachedState = await loadState()
    cachedState.scheduledTime = runTime
    cachedState.targetReservationTime = reservationTime
    cachedState.retryCount = 0
    this.addLogInternal(`Scheduled: Run at ${new Date(runTime).toLocaleString()} to book ${new Date(reservationTime).toLocaleString()}`, 'info')
    await saveState(cachedState)
  }

  async cancelSchedule(): Promise<void> {
    cachedState = await loadState()
    cachedState.scheduledTime = null
    cachedState.targetReservationTime = null
    cachedState.retryCount = 0
    this.addLogInternal('Cancelled scheduled run', 'info')
    await saveState(cachedState)
  }

  async getTargetReservationTime(): Promise<Date | null> {
    cachedState = await loadState()
    return cachedState.targetReservationTime ? new Date(cachedState.targetReservationTime) : null
  }

  async incrementRetry(): Promise<number> {
    cachedState = await loadState()
    cachedState.retryCount++
    await saveState(cachedState)
    return cachedState.retryCount
  }

  async shouldRetry(): Promise<boolean> {
    cachedState = await loadState()
    return cachedState.retryCount < cachedState.maxRetries
  }

  async setLastRun(success: boolean, message: string, clearSchedule: boolean = true): Promise<void> {
    cachedState = await loadState()
    cachedState.lastRun = {
      time: new Date().toISOString(),
      success,
      message,
    }
    if (clearSchedule) {
      cachedState.scheduledTime = null
      cachedState.targetReservationTime = null
      cachedState.retryCount = 0
    }
    this.addLogInternal(message, success ? 'success' : 'error')
    await saveState(cachedState)
  }

  addLog(message: string, type: LogEntry['type'] = 'info'): void {
    this.addLogInternal(message, type)
    // Fire and forget save
    saveState(cachedState).catch(console.error)
  }

  private addLogInternal(message: string, type: LogEntry['type'] = 'info'): void {
    console.log(`[${type.toUpperCase()}] ${message}`)
    cachedState.logs.push({
      time: new Date().toISOString(),
      message,
      type,
    })
    if (cachedState.logs.length > MAX_LOGS) {
      cachedState.logs = cachedState.logs.slice(-MAX_LOGS)
    }
  }
}

// Singleton instance
export const store = new Store()
