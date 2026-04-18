const FAILURE_REASON_LABELS: Record<string, string> = {
  tuner_conflict: 'チューナー不足',
  ffmpeg_exit: 'エンコード失敗',
  mirakc_unreachable: 'Mirakc 接続失敗',
  disk_full: 'ディスク容量不足',
  other: '不明なエラー'
}

export function failureReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '—'
  // Match known prefixes like ffmpeg_exit_<code>
  for (const key of Object.keys(FAILURE_REASON_LABELS)) {
    if (reason === key || reason.startsWith(`${key}_`)) return FAILURE_REASON_LABELS[key] as string
  }
  return reason
}
