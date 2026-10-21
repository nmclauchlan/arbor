export interface GroupColorPalette {
  name: string
  colors: readonly string[]
  source: string
}

// Palette names are Arbor labels; colors retain their order on Color Hunt.
export const GROUP_COLOR_PALETTES: readonly GroupColorPalette[] = [
  {
    name: 'Coastal Haze',
    colors: ['#f1f0e8', '#eee0c9', '#adc4ce', '#96b6c5'],
    source: 'https://colorhunt.co/palette/f1f0e8eee0c9adc4ce96b6c5'
  },
  {
    name: 'Sage & Linen',
    colors: ['#c1cfa1', '#a5b68d', '#ede8dc', '#e7cccc'],
    source: 'https://colorhunt.co/palette/c1cfa1a5b68dede8dce7cccc'
  },
  {
    name: 'Rosewood',
    colors: ['#a87c7c', '#7e6363', '#503c3c', '#3e3232'],
    source: 'https://colorhunt.co/palette/a87c7c7e6363503c3c3e3232'
  },
  {
    name: 'Lavender Ash',
    colors: ['#faf0e6', '#b9b4c7', '#5c5470', '#352f44'],
    source: 'https://colorhunt.co/palette/faf0e6b9b4c75c5470352f44'
  }
]

export const DEFAULT_GROUP_COLORS: { name: string; value: string }[] = [
  { name: 'Slate', value: '#819bb6' },
  { name: 'Sage', value: '#8fae98' },
  { name: 'Lavender', value: '#a494b8' },
  { name: 'Sand', value: '#baa580' },
  { name: 'Rose', value: '#b58e9c' },
  { name: 'Teal', value: '#7ba8a2' },
  { name: 'Clay', value: '#bf9784' }
]

export function normalizeGroupColor(value: string): string | null {
  if (typeof value !== 'string') return null
  const hex = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.toLowerCase().split('').map((digit) => digit + digit).join('')}`
  }
  return null
}

export function paletteFromColorHuntUrl(value: string): string[] | null {
  if (typeof value !== 'string') return null
  const match = /^([a-zA-Z]+):\/\/([^/?#]+)\/palette\/([0-9a-fA-F]{24})\/?(?:\?[^#\s]*)?(?:#[^\s]*)?$/.exec(value.trim())
  if (!match || match[1].toLowerCase() !== 'https' || !/^(?:www\.)?colorhunt\.co$/i.test(match[2])) return null
  return match[3].toLowerCase().match(/.{6}/g)!.map((hex) => `#${hex}`)
}
