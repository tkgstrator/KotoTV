import { describe, expect, test } from 'bun:test'
import { normalizeTitleForDedup } from './title-normalize'

// ---------------------------------------------------------------------------
// Helper: assert two titles normalize to the same string
// ---------------------------------------------------------------------------

function same(a: string, b: string) {
  expect(normalizeTitleForDedup(a)).toBe(normalizeTitleForDedup(b))
}

function different(a: string, b: string) {
  expect(normalizeTitleForDedup(a)).not.toBe(normalizeTitleForDedup(b))
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

describe('normalizeTitleForDedup: baseline', () => {
  test('identical titles are equal', () => {
    same('アニメA #01', 'アニメA #01')
  })
})

// ---------------------------------------------------------------------------
// Rerun marker variants
// ---------------------------------------------------------------------------

describe('normalizeTitleForDedup: rerun markers — suffix', () => {
  test('[リピート] suffix is stripped', () => {
    same('アニメA #01', 'アニメA #01 [リピート]')
  })

  test('（再） suffix is stripped', () => {
    same('アニメA #01', 'アニメA #01（再）')
  })

  test('[再] suffix is stripped', () => {
    same('アニメA #01', 'アニメA #01 [再]')
  })

  test('(再) suffix is stripped', () => {
    same('アニメA #01', 'アニメA #01 (再)')
  })

  test('【再】 suffix is stripped', () => {
    same('アニメA #01', 'アニメA #01 【再】')
  })

  test('[repeat] suffix is stripped (lowercase)', () => {
    same('アニメA #01', 'アニメA #01 [repeat]')
  })

  test('[REPEAT] suffix is stripped (uppercase)', () => {
    same('アニメA #01', 'アニメA #01 [REPEAT]')
  })

  test('再放送 bare suffix is stripped', () => {
    same('アニメA #01', 'アニメA #01 再放送')
  })
})

describe('normalizeTitleForDedup: rerun markers — prefix', () => {
  test('【再放送】 prefix is stripped', () => {
    same('アニメA #01', '【再放送】アニメA #01')
  })

  test('[再放送] prefix is stripped', () => {
    same('アニメA #01', '[再放送]アニメA #01')
  })
})

describe('normalizeTitleForDedup: rerun markers — multiple', () => {
  test('multiple markers are both stripped', () => {
    same('アニメA #01', '[再] [リピート] アニメA #01')
  })
})

// ---------------------------------------------------------------------------
// Fullwidth normalization
// ---------------------------------------------------------------------------

describe('normalizeTitleForDedup: fullwidth digits', () => {
  test('fullwidth digits equal halfwidth', () => {
    same('アニメA #01', 'アニメA #０１')
  })
})

describe('normalizeTitleForDedup: fullwidth letters', () => {
  test('fullwidth ASCII letters equal halfwidth', () => {
    same('アニメA #01', 'アニメＡ #01')
  })
})

describe('normalizeTitleForDedup: fullwidth space', () => {
  test('fullwidth space equals halfwidth space', () => {
    same('アニメA #01', 'アニメA　#01')
  })
})

// ---------------------------------------------------------------------------
// Titles that must remain distinct
// ---------------------------------------------------------------------------

describe('normalizeTitleForDedup: distinct titles', () => {
  test('different episode numbers are not equal', () => {
    different('アニメA #01', 'アニメA #02')
  })

  test('different series titles are not equal', () => {
    different('アニメA #01', 'アニメB #01')
  })
})
