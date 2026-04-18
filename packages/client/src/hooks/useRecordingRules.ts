// TODO(types): switch to hc<AppType> once backend recording-rules endpoints land
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { CreateRecordingRule, RecordingRule, RecordingRulePreviewResult } from '@/types/RecordingRule'

export const RULES_KEY = ['rules'] as const

async function fetchRules(): Promise<{ rules: RecordingRule[] }> {
  const res = await fetch('/api/recording-rules')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchRule(id: string): Promise<RecordingRule> {
  const res = await fetch(`/api/recording-rules/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function createRule(body: CreateRecordingRule): Promise<RecordingRule> {
  const res = await fetch('/api/recording-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
    const msg = (err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return res.json()
}

async function updateRule(id: string, body: Partial<CreateRecordingRule>): Promise<RecordingRule> {
  const res = await fetch(`/api/recording-rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
    const msg = (err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return res.json()
}

async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`/api/recording-rules/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) {
    throw new Error(`HTTP ${res.status}`)
  }
}

async function previewRule(body: CreateRecordingRule): Promise<RecordingRulePreviewResult> {
  const res = await fetch('/api/recording-rules/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useRecordingRules() {
  return useQuery({
    queryKey: RULES_KEY,
    queryFn: fetchRules,
    staleTime: 30_000
  })
}

export function useRecordingRule(id: string) {
  return useQuery({
    queryKey: ['rules', id] as const,
    queryFn: () => fetchRule(id),
    staleTime: 30_000,
    enabled: !!id
  })
}

export function useCreateRecordingRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY })
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
    }
  })
}

export function useUpdateRecordingRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateRecordingRule> }) => updateRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY })
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
    }
  })
}

export function useDeleteRecordingRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY })
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
    }
  })
}

export function useRecordingRulePreview(rule: CreateRecordingRule | null) {
  const [debouncedRule, setDebouncedRule] = useState<CreateRecordingRule | null>(rule)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedRule(rule)
    }, 500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [rule])

  return useQuery({
    queryKey: ['rules', 'preview', debouncedRule] as const,
    queryFn: () => previewRule(debouncedRule as CreateRecordingRule),
    enabled: debouncedRule !== null,
    staleTime: 0,
    gcTime: 30_000
  })
}
