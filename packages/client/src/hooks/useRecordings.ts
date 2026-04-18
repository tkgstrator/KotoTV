import type { CreateRecordingSchedule } from '@kototv/server/src/schemas/Recording.dto'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/api/client'

export const RECORDINGS_KEY = ['recordings'] as const

export function useRecordings() {
  return useQuery({
    queryKey: RECORDINGS_KEY,
    queryFn: async () => {
      const res = await api.api.recordings.$get()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 60_000
  })
}

export function useCreateRecording() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateRecordingSchedule) => {
      const res = await api.api.recordings.$post({ json: body })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
        const msg = (err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
        throw new Error(msg)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECORDINGS_KEY })
      toast.success('録画を予約しました')
    },
    onError: (err: Error) => {
      toast.error(`予約失敗: ${err.message}`)
    }
  })
}

export function useDeleteRecording() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const res = await api.api.recordings[':scheduleId'].$delete({ param: { scheduleId } })
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
        const msg = (err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
        throw new Error(msg)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECORDINGS_KEY })
      toast.success('予約を削除しました')
    },
    onError: (err: Error) => {
      toast.error(`削除失敗: ${err.message}`)
    }
  })
}

export function useRecordingEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null
    let destroyed = false

    function connect() {
      if (destroyed) return
      es = new EventSource('/api/recordings/events')

      es.onmessage = () => {
        queryClient.invalidateQueries({ queryKey: RECORDINGS_KEY })
      }

      es.onerror = () => {
        es?.close()
        es = null
        if (!destroyed) {
          retryTimeout = setTimeout(connect, 5_000)
        }
      }
    }

    connect()

    return () => {
      destroyed = true
      if (retryTimeout) clearTimeout(retryTimeout)
      es?.close()
    }
  }, [queryClient])
}
