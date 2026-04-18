# Mock: Recording Rules

## Goal

Allow users to create and manage rule-based auto-recording: define keyword / channel / day-of-week / time-range conditions, immediately see which EPG programs match (live preview), and save the rule to trigger automatic `RecordingSchedule` generation.

Secondary goal: update `/recordings` to a 3-tab layout (録画待ち / 完了 / 失敗) and surface the source of each schedule (RULE chip → link vs MANUAL chip).

## Constraints / inputs

- Data model: `RecordingRule` — `id, name, enabled, keyword, keywordMode (literal|regex), keywordTarget (title|title_description), excludeKeyword, channelIds: string[], genres: string[], dayOfWeek: number[], timeStartMinutes, timeEndMinutes, priority, avoidDuplicates`
- Preview: `POST /api/recording-rules/preview` — body = draft rule + `windowHours` (default 24), response = `{ matchCount, programs: [{ id, title, startAt, endAt, channelId, channelName }] }`
- Frontend debounce: 500ms on any form field change
- Channel picker must expose `[GR すべて] [BS すべて] [CS すべて]` bulk actions; GR/BS/CS are UI helpers that expand to real `serviceId` arrays client-side
- `dayOfWeek` 0–6 is Sun–Sat in JS; UI display uses Mon–Sun ordering (JST fixed)
- `timeStartMinutes > timeEndMinutes` = overnight span (22:00–04:00 style); matcher handles this server-side
- Shadcn vocabulary: `Card`, `Input`, `Button`, `Switch`, `Checkbox`, `RadioGroup`, `Badge` (StatusChip), `ScrollArea`, `Separator`, `Tabs`, `AlertDialog` for delete confirm
- Tech theme: monospace, square chips (radius 3px), diagnostic-dense empty states, no pure black/white

## Variants

### v1 — Dense data-table list + fixed side-by-side editor

- Layout idea: `/recordings/rules` shows a classic dense table (sortable columns: name, keyword, channel, day/time, 24h-hit-count, enabled toggle, actions). Editor is 55% form / 45% preview, always visible side by side.
- Trade-off: Maximum information density on desktop; rule comparison easy; poor on mobile (table must collapse to cards); no collapsible sections means the form is long but fully visible.

### v2 — Card list + bottom collapsible preview drawer + preset time chips

- Layout idea: Rule list shows diagnostic-dense cards (hit count displayed as a large number badge top-right of card). Editor uses a 3-column grid on desktop. Preview is a `<details>`-based bottom drawer that expands below the form, showing a table with keyword-highlight columns. Time input offers preset chips (早朝/昼/夕方/夜/深夜/終日) in addition to raw HH:MM inputs. Channel picker is a chip-bag: bulk buttons dump all GR/BS/CS ids as removable pills, then individual chips.
- Trade-off: Preset time chips are friendlier for common patterns; bottom drawer means the form-change → preview feedback loop requires the user to scroll down; chip-bag is compact but becomes cluttered with many channels.

### v3 — Mobile-first minimal list + on-demand preview toggle + tree channel picker

- Layout idea: Rule list is the most minimal — one-line rows (name left, hit-count right), no table headers, enabled toggle as inline column. Editor is single-column mobile-native with collapsible sections (`<details>`). Channel picker uses a tree/accordion structure (GR/BS/CS group headers with indeterminate checkboxes; expand to individual channel checkboxes). Preview is an on-demand `<details>` trigger button rather than always-visible — tapping "▶ プレビューを確認" expands it inline. Desktop layout stays 50/50 side-by-side but with the tree picker and a large `2rem` match-count display with a breakdown row (keyword hits vs genre hits).
- Trade-off: Best mobile UX — the form-first approach prevents the small screen from being split uncomfortably; tree picker scales well to many channels (CS has 30+); the on-demand preview is a deliberate UX choice for "quick input" philosophy. On desktop the always-visible right pane preserves the key feedback loop. Trade-off: on mobile the user must tap to see preview, which adds a tap.

## Chosen variant

**v1 — dense data-table list + fixed 55/45 side-by-side editor** (confirmed by user 2026-04-18).

Implementation should layer two improvements from the other variants on top of v1:

- **Preset time chips** from v2: add `[早朝] [昼] [夕方] [夜] [深夜] [終日]` buttons above the HH:MM inputs so common patterns are one-click. HH:MM inputs remain for custom ranges.
- **Tree / accordion channel picker** from v3: GR / BS / CS group headers with indeterminate checkboxes (parent reflects "some children selected"). Falls back to v1's flat grid inside each group when expanded. Scales better when CS has 30+ channels.

Mobile (< md) collapses the 55/45 split vertically: form on top, preview inline below. The preview stays visible (no on-demand toggle as in v3) — the feedback loop is too important to hide, and this app's "パッと入力" philosophy means you want to see hits as you type.

## Recommendation

**v1** — because:

1. The **always-visible side-by-side preview is the core innovation** of this surface; hiding it on-demand (v3 mobile) or below a drawer (v2) weakens the main value proposition.
2. The data-table rule list provides the most efficient at-a-glance rule management when users have 5–20 rules. v2's card list and v3's minimal rows both lose the ability to scan columns (hit count, day/time, channel) in parallel.
3. The 55/45 split is already proven in EPG-style tools (EPGStation, Chinachu). The mobile stack (form above, preview below) is straightforward to implement from the same component.
4. v1's channel picker (GR すべて bulk button + checkbox grid) is the simplest model that directly matches the spec (`channelIds`, GR/BS/CS as UI helpers). The chip-bag in v2 becomes cluttered; the tree in v3 adds indeterminate-checkbox complexity.

If the user wants the tree picker from v3, it can be layered onto v1's form without changing the overall layout. The preset time chips from v2 are also worth adding as an optional shortcut alongside the HH:MM inputs.

## Handoff notes for `frontend`

### Shadcn primitives per form field

| Field | Primitive |
|-------|-----------|
| ルール名 | `Input` |
| 有効 / 重複回避 | `Switch` (label via `FormLabel`) |
| キーワード | `Input` + `ToggleGroup` (literal/regex, title/title+desc) |
| 除外キーワード | `Input` |
| チャンネル bulk | `Button` variant ghost |
| チャンネル個別 | `Checkbox` + `Label` in a CSS grid |
| ジャンル | multi-select via `Badge`-styled `ToggleGroup` items |
| 曜日 | `ToggleGroup` type="multiple", 7 items |
| 時間帯 | two `Input` type="time" (or parse HH:MM manually) |
| 優先度 | `Input` type="number" |
| 保存 / キャンセル | `Button` primary / ghost |
| 削除 | `Button` destructive inside `AlertDialog` |
| ルール一覧 enabled toggle | `Switch` with `onClick` preventDefault |
| Tabs (録画待ち/完了/失敗/ルール) | `Tabs` + `TabsList` + `TabsTrigger` |

### React hooks needed

```ts
// packages/client/src/hooks/useRecordingRules.ts
useRecordingRules()                       // GET /api/recording-rules
useRecordingRule(id: string)              // GET /api/recording-rules/:id
useCreateRecordingRule()                  // POST /api/recording-rules (mutation)
useUpdateRecordingRule(id: string)        // PATCH /api/recording-rules/:id (mutation)
useDeleteRecordingRule(id: string)        // DELETE /api/recording-rules/:id (mutation)
useRecordingRulePreview(draft: DraftRule) // POST /api/recording-rules/preview
                                          // — debounce 500ms via useDebounce + useQuery
                                          // — key: ['recording-rules', 'preview', stableStringify(draft)]
                                          // — enabled: !!draft.keyword || draft.channelIds.length > 0
```

### Preview pane debounce + states

- Debounce: 500ms on any form field change. Use `useDebounce(formValues, 500)` then feed to the query key.
- Loading: show skeleton rows (3–4 rows with shimmer). Query key changes → `isFetching` → show shimmer overlay on existing results (don't blank out).
- Empty: `$ no matches — loosen keyword or channels` in monospace; diagnostic-dense, no illustration.
- Regex error: server returns 400 with `{ error: 'invalid_regex', message }` → show `chip-err` inline above preview with the error message.
- Scroll: `ScrollArea` on the preview list; sticky header with match count + chip.

### Channel picker bulk-select

```ts
// Client-side expansion (no server roundtrip)
const GR_CHANNEL_IDS = channels.filter(c => c.channelType === 'GR').map(c => c.id)
const BS_CHANNEL_IDS = channels.filter(c => c.channelType === 'BS').map(c => c.id)
const CS_CHANNEL_IDS = channels.filter(c => c.channelType === 'CS').map(c => c.id)

function handleBulkGR() {
  setValue('channelIds', Array.from(new Set([...getValues('channelIds'), ...GR_CHANNEL_IDS])))
}
```

- `channels` list comes from the existing `useChannels()` hook (Phase 1).
- After GR bulk-add, the user can uncheck individual channels — this is just set subtraction on `channelIds`.
- The checkbox grid groups by `channelType` with a section header, mirroring the tree picker in v3.

### Day-of-week timezone note

- `RecordingRule.dayOfWeek` stores 0–6 where 0 = Sunday (JS `Date.getDay()` convention).
- UI chip order is 月火水木金土日 = indices [1,2,3,4,5,6,0].
- The server evaluates `program.startAt` in `Asia/Tokyo` timezone for day-of-week matching. The UI does not need to do any TZ conversion — just store the indices as-is.

### `/recordings` 3-tab layout

- Use `?tab=pending|completed|failed` as URL search param (TanStack Router search schema with Zod `z.enum`).
- Each schedule row needs a `source` column:
  - `ruleId !== null` → `<StatusChip variant="rule">RULE {ruleName}</StatusChip>` that links to `/recordings/rules/{ruleId}`
  - `ruleId === null` → `<StatusChip variant="muted">MANUAL</StatusChip>`
- 失敗 tab: show `failureReason` as a second line with left-border destructive accent. Map enum to Japanese:
  - `tuner_conflict` → チューナー不足でスキップされました
  - `ffmpeg_exit` → FFmpeg 異常終了
  - `mirakc_unreachable` → Mirakc 接続エラー
  - `disk_full` → ディスク容量不足
  - `other` → 不明なエラー

### SSE invalidation

- On `rule-matched` event → invalidate `['recording-rules']` and `['schedules', 'pending']`
- On `epg-synced` event → if preview pane is open, re-fire the preview query (the match count may have changed)

### Open questions

- Should the channel picker show channel logos (if available from Mirakc)? Not blocked for Phase 4, can add later.
- Priority input: should there be a UI tooltip explaining the tuner-conflict resolution? The mock shows a parenthetical hint; a Shadcn `Tooltip` on the `?` icon would be cleaner in production.
- `windowHours` control: spec defaults to 24h. Should users be able to extend to 48h or 168h (1 week) in the UI? Not mocked — add a `Select` next to the match count if needed.
