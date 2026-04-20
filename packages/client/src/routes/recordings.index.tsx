import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `/recordings` itself is not a page anymore — each status has its own
 * route (`/recordings/pending`, `/completed`, `/failed`). Landing on the
 * bare path should drop the user into the default status.
 */
export const Route = createFileRoute('/recordings/')({
  beforeLoad: () => {
    throw redirect({ to: '/recordings/pending' })
  }
})
