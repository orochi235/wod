import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SliceElement } from '../slice/types'
import { SliceElements } from './SliceElements'

function draw(elements: SliceElement[]) {
  const { container } = render(
    <svg role="img" aria-label="wedge">
      <SliceElements elements={elements} arc={{ start: 0, end: 0.25 }} radius={200} id="seg1" />
    </svg>,
  )
  return container
}

describe('SliceElements', () => {
  it('renders radial text rotated to the arc midpoint', () => {
    const container = draw([
      { kind: 'text', text: 'Mike Truk', along: 'radial', anchor: 0.62, size: 16 },
    ])
    const text = container.querySelector('text')
    expect(text?.textContent).toBe('Mike Truk')
    expect(text?.getAttribute('transform')).toContain('rotate(45)')
  })

  it('runs radial text outward rather than flipping it by position', () => {
    const container = draw([
      { kind: 'text', text: 'Dwigt Rortugal', along: 'radial', anchor: 0.62, size: 16 },
    ])
    const transform = container.querySelector('text')?.getAttribute('transform') ?? ''
    expect(transform).toContain('rotate(-90)')
    expect(transform).not.toContain('rotate(180)')
  })

  it('renders curved text against a path it also emits', () => {
    const container = draw([{ kind: 'curvedText', text: 'Dwigt Rortugal', anchor: 0.78, size: 14 }])
    const path = container.querySelector('path')
    const textPath = container.querySelector('textPath')
    expect(path?.id).toBeTruthy()
    expect(textPath?.getAttribute('href')).toBe(`#${path?.id}`)
  })

  it('wraps a level element in a counter-rotating group', () => {
    const container = draw([
      { kind: 'text', text: 'Ana', along: 'tangential', anchor: 0.66, size: 14, frame: 'level' },
    ])
    const level = container.querySelector('.wheel__level')
    expect(level?.getAttribute('transform')).toBe('rotate(-45)')
  })

  it('renders an image element', () => {
    const container = draw([{ kind: 'image', href: 'photo.png', anchor: 0.6, size: 40 }])
    expect(container.querySelector('image')?.getAttribute('href')).toBe('photo.png')
  })

  it('mounts a raw node as given', () => {
    const container = draw([{ kind: 'raw', node: <circle data-testid="raw" r={5} /> }])
    expect(container.querySelector('[data-testid="raw"]')).not.toBeNull()
  })

  it('renders one text element per glyph, transformed where the solve put it', () => {
    const container = draw([
      {
        kind: 'glyphRun',
        glyphs: [
          { char: 'A', x: 10, y: -180, size: 24, rotate: 45, scale: [1.5, 1] },
          { char: 'B', x: 8, y: -150, size: 20, rotate: 45, scale: [1, 1] },
        ],
      },
    ])
    const texts = [...container.querySelectorAll('text')]
    expect(texts.map((text) => text.textContent)).toEqual(['A', 'B'])
    expect(texts[0].getAttribute('transform')).toBe('translate(10 -180) rotate(45) scale(1.5 1)')
    expect(texts[0].getAttribute('font-size')).toBe('24')
  })

  it('renders nothing for an empty glyph run', () => {
    const container = draw([{ kind: 'glyphRun', glyphs: [] }])
    expect(container.querySelector('text')).toBeNull()
  })
})
