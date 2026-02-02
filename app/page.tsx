'use client'

import { useState, useEffect } from 'react'

export default function Home() {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Set default date to 7 days from now
  useEffect(() => {
    const defaultDate = new Date()
    defaultDate.setDate(defaultDate.getDate() + 7)
    setDate(defaultDate.toISOString().split('T')[0])
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date || !time) return

    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate: date, targetTime: time }),
      })
      const data = await res.json()

      if (data.success) {
        setMessage({ type: 'success', text: `Booking triggered for ${date} at ${formatTime(time)}. Check your notifications!` })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to trigger booking' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to connect to server' })
    } finally {
      setLoading(false)
    }
  }

  function formatTime(time24: string) {
    const [hours, minutes] = time24.split(':').map(Number)
    const isPM = hours >= 12
    const displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours)
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
  }

  function getMinDate() {
    const min = new Date()
    min.setDate(min.getDate() + 1)
    return min.toISOString().split('T')[0]
  }

  return (
    <div className="container">
      <h1>Tennis Court Booker</h1>

      <div className="card">
        <h2>Book a Court</h2>
        <p className="hint">
          Select when you want to play. The booking script will run immediately via GitHub Actions.
        </p>

        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Date</label>
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
              <option value="07:00">7:00 AM</option>
              <option value="07:30">7:30 AM</option>
              <option value="08:00">8:00 AM</option>
              <option value="08:30">8:30 AM</option>
              <option value="09:00">9:00 AM</option>
              <option value="09:30">9:30 AM</option>
              <option value="10:00">10:00 AM</option>
              <option value="10:30">10:30 AM</option>
              <option value="11:00">11:00 AM</option>
              <option value="11:30">11:30 AM</option>
              <option value="12:00">12:00 PM</option>
              <option value="12:30">12:30 PM</option>
              <option value="13:00">1:00 PM</option>
              <option value="13:30">1:30 PM</option>
              <option value="14:00">2:00 PM</option>
              <option value="14:30">2:30 PM</option>
              <option value="15:00">3:00 PM</option>
              <option value="15:30">3:30 PM</option>
              <option value="16:00">4:00 PM</option>
              <option value="16:30">4:30 PM</option>
              <option value="17:00">5:00 PM</option>
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
            {loading ? 'Triggering...' : 'Book Now'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>How it works</h2>
        <ol className="how-it-works">
          <li>Select your desired date and time</li>
          <li>Click "Book Now" to trigger the booking script</li>
          <li>GitHub Actions runs Playwright to book the court</li>
          <li>You'll get a push notification with the result</li>
        </ol>
        <p className="hint">
          Prefers Court 2 if both are open. Books 60-min slot with 1 guest.
        </p>
      </div>
    </div>
  )
}
