import Redis from 'ioredis'

// Railway auto-injects REDIS_URL when you add a Redis database
// Fallback to Upstash if REDIS_URL isn't available
const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || ''

console.log('[STORE] Redis URL configured:', redisUrl ? `${redisUrl.substring(0, 30)}...` : 'MISSING')

let redis: Redis | null = null
if (redisUrl) {
  redis = new Redis(redisUrl)
}

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
  if (!redis) {
    console.log('[STORE] No Redis connection, using default state')
    return { ...DEFAULT_STATE }
  }

  try {
    const data = await redis.get(STORE_KEY)
    if (data) {
      console.log('[STORE] Loaded state from Redis')
      return { ...DEFAULT_STATE, ...JSON.parse(data) }
    }
  } catch (error) {
    console.error('[STORE] Error loading state from Redis:', error)
  }
  return { ...DEFAULT_STATE }
}

async function saveState(state: AppState): Promise<void> {
  if (!redis) {
    console.log('[STORE] No Redis connection, cannot save')
    return
  }

  try {
    await redis.set(STORE_KEY, JSON.stringify(state))
    console.log('[STORE] Saved state to Redis')
  } catch (error) {
    console.error('[STORE] Error saving state to Redis:', error)
  }
}

// Synchronous wrapper for compatibility - uses cached state
let cachedState: AppState = { ...DEFAULT_STATE }

class Store {
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
