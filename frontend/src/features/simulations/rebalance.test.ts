import { describe, expect, it } from 'vitest'
import { rebalance } from './investing-ui'

const keys = ['a', 'b', 'c', 'd']
const total = (m: Record<string, number>) => Object.values(m).reduce((x, y) => x + y, 0)

describe('rebalance', () => {
  it('keeps the mix at 100% for every slider move', () => {
    const start = { a: 40, b: 30, c: 20, d: 10 }
    for (const k of keys) for (let v = 0; v <= 100; v += 5) expect(total(rebalance(start, keys, k, v))).toBe(100)
  })
  it('spreads the change in proportion and in 5% steps', () => {
    const next = rebalance({ a: 40, b: 30, c: 30, d: 0 }, keys, 'a', 60)
    expect(next).toEqual({ a: 60, b: 20, c: 20, d: 0 })
    expect(Object.values(next).every((v) => v % 5 === 0)).toBe(true)
  })
  it('splits evenly when the others hold nothing', () => {
    expect(total(rebalance({ a: 100, b: 0, c: 0, d: 0 }, keys, 'a', 40))).toBe(100)
  })
})
