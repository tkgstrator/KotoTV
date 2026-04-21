import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BenchmarkHistoryResponse,
  BenchmarkRequest,
  BenchmarkResponse,
  CreateEncodeProfile,
  EncodeProfile,
  UpdateEncodeProfile
} from '@/types/EncodeProfile'

export const ENCODE_PROFILES_KEY = ['encode-profiles'] as const

async function fetchProfiles(): Promise<{ profiles: EncodeProfile[] }> {
  const res = await fetch('/api/encode-profiles')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function createProfile(body: CreateEncodeProfile): Promise<EncodeProfile> {
  const res = await fetch('/api/encode-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function updateProfile(id: string, body: UpdateEncodeProfile): Promise<EncodeProfile> {
  const res = await fetch(`/api/encode-profiles/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
    throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function deleteProfile(id: string): Promise<void> {
  const res = await fetch(`/api/encode-profiles/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
}

export function useEncodeProfiles() {
  return useQuery({
    queryKey: ENCODE_PROFILES_KEY,
    queryFn: fetchProfiles,
    staleTime: 60_000
  })
}

export function useCreateEncodeProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: ENCODE_PROFILES_KEY })
  })
}

export function useUpdateEncodeProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEncodeProfile }) => updateProfile(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENCODE_PROFILES_KEY })
  })
}

export function useDeleteEncodeProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENCODE_PROFILES_KEY })
      qc.invalidateQueries({ queryKey: ['rules'] })
    }
  })
}

export const BENCHMARK_HISTORY_KEY = ['encode-profiles', 'benchmark', 'history'] as const

export function useBenchmarkEncodeProfile() {
  const qc = useQueryClient()
  return useMutation<BenchmarkResponse, Error, BenchmarkRequest>({
    mutationKey: ['encode-profiles', 'benchmark'],
    mutationFn: async (body) => {
      const res = await fetch('/api/encode-profiles/benchmark', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (res.status === 409) {
        throw new Error('他のプロファイルを検証中です。少し待って再試行してください')
      }
      if (!res.ok) throw new Error(`benchmark failed: ${res.status}`)
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BENCHMARK_HISTORY_KEY })
    }
  })
}

export function useBenchmarkHistory() {
  return useQuery<BenchmarkHistoryResponse>({
    queryKey: BENCHMARK_HISTORY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/encode-profiles/benchmark/history')
      if (!res.ok) throw new Error('history fetch failed')
      return res.json()
    },
    staleTime: 10_000
  })
}

export function useDeleteBenchmarkHistory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/encode-profiles/benchmark/history', { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BENCHMARK_HISTORY_KEY })
  })
}
