'use client'

import { useState, useEffect } from 'react'

interface ScheduleStatus {
  scheduled: boolean
  scheduledTime: string | null
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
    if (!confirm('Run the script now?')) return
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

  function formatScheduledTime(isoString: string) {
    const d = new Date(isoString)
    return {
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    }
  }

  return (
    <div className="container">
      <h1>Tennis Scheduler</h1>

      {status?.scheduled && status.scheduledTime ? (
        <div className="status scheduled">
          <div className="label">Scheduled Run</div>
          <div className="time">{formatScheduledTime(status.scheduledTime).time}</div>
          <div className="date">{formatScheduledTime(status.scheduledTime).date}</div>
        </div>
      ) : (
        <div className="status idle">
          <div className="label">No scheduled run</div>
        </div>
      )}

      <div className="card">
        <h2>Schedule a Run</h2>
        <form onSubmit={handleSchedule}>
          <div className="input-group">
            <label>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label>Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Scheduling...' : 'Schedule'}
          </button>
        </form>

        {status?.scheduled && (
          <button onClick={handleCancel} className="btn-danger" disabled={loading}>
            Cancel Scheduled Run
          </button>
        )}

        <button onClick={handleRunNow} className="btn-secondary" disabled={loading}>
          Run Now
        </button>
      </div>

      {status?.logs && status.logs.length > 0 && (
        <div className="card">
          <h2>Recent Activity</h2>
          <div className="log">
            {status.logs.slice().reverse().map((log, i) => (
              <div key={i} className={`log-entry ${log.type}`}>
                <div>{log.message}</div>
                <div className="timestamp">
                  {new Date(log.time).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
