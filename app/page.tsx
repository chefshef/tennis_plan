'use client'

import { useState, useEffect } from 'react'

interface ScheduleStatus {
  scheduled: boolean
  scheduledTime: string | null  // When script will RUN
  targetReservationTime: string | null  // When user wants to PLAY
  lastRun: {
    time: string
    success: boolean
    message: string
  } | null
  logs: Array<{
    time: string
    message: string
    type: 'info' | 'success' | 'error'
  }>
  retryCount: number
  maxRetries: number
}

export default function Home() {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [status, setStatus] = useState<ScheduleStatus | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  // Set default date to 7 days from now
  useEffect(() => {
    const defaultDate = new Date()
    defaultDate.setDate(defaultDate.getDate() + 7)
    setDate(defaultDate.toISOString().split('T')[0])
  }, [])

  async function fetchStatus() {
    try {
      const res = await fetch('/api/status')
      const data = await res.json()
      setStatus(data)
    } catch (e) {
      console.error('Failed to fetch status', e)
    }
  }

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!date || !time) return

    setLoading(true)
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time }),
      })
      const data = await res.json()
      if (data.success) {
        setDate('')
        setTime('')
        await fetchStatus()
      } else {
        alert(data.error || 'Failed to schedule')
      }
    } catch (e) {
      alert('Failed to schedule')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setLoading(true)
    try {
      await fetch('/api/schedule', { method: 'DELETE' })
      await fetchStatus()
    } catch (e) {
      alert('Failed to cancel')
    } finally {
      setLoading(false)
    }
  }

  async function handleRunNow() {
    if (!status?.targetReservationTime) {
      alert('Schedule a reservation first')
      return
    }
    if (!confirm('Run the booking script now?')) return
    setLoading(true)
    try {
      const res = await fetch('/api/run', { method: 'POST' })
      const data = await res.json()
      await fetchStatus()
      if (!data.success) {
        alert(data.error || 'Run failed')
      }
    } catch (e) {
      alert('Failed to run')
    } finally {
      setLoading(false)
    }
  }

  function formatDateTime(isoString: string) {
    const d = new Date(isoString)
    return {
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      full: d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    }
  }

  function getMinDate() {
    const min = new Date()
    min.setDate(min.getDate() + 7)
    return min.toISOString().split('T')[0]
  }

  return (
    <div className="container">
      <h1>Tennis Court Booker</h1>

      {status?.scheduled && status.targetReservationTime ? (
        <div className="status scheduled">
          <div className="label">Reservation Scheduled</div>
          <div className="reservation-info">
            <div className="main-time">
              <div className="time">{formatDateTime(status.targetReservationTime).time}</div>
              <div className="date">{formatDateTime(status.targetReservationTime).date}</div>
            </div>
            <div className="run-time">
              Script runs: {formatDateTime(status.scheduledTime!).full}
            </div>
            {status.retryCount > 0 && (
              <div className="retry-info">
                Retry {status.retryCount}/{status.maxRetries} in progress...
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="status idle">
          <div className="label">No reservation scheduled</div>
        </div>
      )}

      {status?.lastRun && (
        <div className={`last-run ${status.lastRun.success ? 'success' : 'error'}`}>
          <div className="label">Last Run</div>
          <div className="message">{status.lastRun.message}</div>
          <div className="timestamp">{formatDateTime(status.lastRun.time).full}</div>
        </div>
      )}

      <div className="card">
        <h2>Book Tennis Court</h2>
        <p className="hint">Select when you want to play. The script will automatically run 7 days before to grab the slot when reservations open.</p>
        <form onSubmit={handleSchedule}>
          <div className="input-group">
            <label>Date (7+ days from now)</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={getMinDate()}
              required
            />
          </div>
          <div className="input-group">
            <label>Time</label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            >
              <option value="">Select time...</option>
              <option value="17:30">5:30 PM</option>
              <option value="18:00">6:00 PM</option>
              <option value="18:30">6:30 PM</option>
              <option value="19:00">7:00 PM</option>
              <option value="19:30">7:30 PM</option>
              <option value="20:00">8:00 PM</option>
              <option value="20:30">8:30 PM</option>
              <option value="21:00">9:00 PM</option>
              <option value="21:30">9:30 PM</option>
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Scheduling...' : 'Schedule Booking'}
          </button>
        </form>

        {status?.scheduled && (
          <>
            <button onClick={handleCancel} className="btn-danger" disabled={loading}>
              Cancel Scheduled Booking
            </button>
            <button onClick={handleRunNow} className="btn-secondary" disabled={loading}>
              Run Now (Test)
            </button>
          </>
        )}
      </div>

      {status?.logs && status.logs.length > 0 && (
        <div className="card">
          <h2>Activity Log</h2>
          <div className="log">
            {status.logs.slice().reverse().slice(0, 20).map((log, i) => (
              <div key={i} className={`log-entry ${log.type}`}>
                <div className="log-message">{log.message}</div>
                <div className="timestamp">
                  {new Date(log.time).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
