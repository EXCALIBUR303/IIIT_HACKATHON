import { describe, expect, it } from 'vitest'
import { en } from './en'
import { hi } from './hi'
import { translate } from './index'
import { te } from './te'

describe('i18n', () => {
  it('interpolates variables', () => {
    expect(translate('en', 'dashboard.greeting', { name: 'Meera' })).toBe('Namaste, Meera')
    expect(translate('hi', 'dashboard.greeting', { name: 'Meera' })).toBe('नमस्ते, Meera')
  })
  it('falls back to English for untranslated keys', () => {
    expect(hi['landing.subtitle']).toBeUndefined()
    expect(translate('hi', 'landing.subtitle')).toBe(en['landing.subtitle'])
  })
  it('only contains keys that exist in English', () => {
    for (const dict of [hi, te]) for (const key of Object.keys(dict)) expect(en).toHaveProperty(key)
  })
  it('translates navigation in every language', () => {
    for (const dict of [hi, te]) expect(dict['nav.home']).toBeTruthy()
  })
})
