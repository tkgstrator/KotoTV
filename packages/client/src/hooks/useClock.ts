import { useEffect, useState } from 'react'

/**
 * Ticks once per second so components that display a wall clock refresh
 * without each of them running their own `setInterval`. Returns a `Date`
 * snapshot that React treats as stable-for-the-tick.
 */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
