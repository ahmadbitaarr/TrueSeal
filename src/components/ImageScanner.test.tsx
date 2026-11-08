import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageScanner from './ImageScanner'
import { decodeQRImage } from '../lib/qr'

vi.mock('../lib/qr', () => ({ decodeQRImage: vi.fn() }))
beforeEach(() => vi.mocked(decodeQRImage).mockReset())
afterEach(cleanup)

const file = (name: string) => new File(['fake image bytes'], name, { type: 'image/png' })

function select(name: string) {
  fireEvent.change(screen.getByLabelText('Choose image'), { target: { files: [file(name)] } })
}

describe('CP03 screenshot upload', () => {
  it('returns decoded content without opening it', async () => {
    vi.mocked(decodeQRImage).mockResolvedValue('https://example.edu')
    const onDecoded = vi.fn()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<ImageScanner onDecoded={onDecoded} />)
    select('qr.png')
    await waitFor(() => expect(onDecoded).toHaveBeenCalledWith('https://example.edu'))
    expect(onDecoded).toHaveBeenCalledTimes(1)
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('displays a useful unreadable-image error and allows another selection', async () => {
    vi.mocked(decodeQRImage).mockRejectedValueOnce(new Error('No readable QR code was found in that image.'))
      .mockResolvedValueOnce('second-result')
    const onDecoded = vi.fn()
    render(<ImageScanner onDecoded={onDecoded} />)
    select('bad.png')
    expect(await screen.findByRole('alert')).toHaveTextContent('No readable QR code')
    select('good.png')
    await waitFor(() => expect(onDecoded).toHaveBeenCalledWith('second-result'))
    expect(onDecoded).toHaveBeenCalledTimes(1)
  })

  it('ignores a slow first image after the second succeeds', async () => {
    let resolveFirst!: (value: string) => void
    vi.mocked(decodeQRImage).mockReturnValueOnce(new Promise<string>((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce('second')
    const onDecoded = vi.fn()
    render(<ImageScanner onDecoded={onDecoded} />)
    select('first.png')
    select('second.png')
    await waitFor(() => expect(onDecoded).toHaveBeenCalledWith('second'))
    expect(onDecoded).toHaveBeenCalledTimes(1)
    await act(async () => { resolveFirst('first'); await Promise.resolve() })
    expect(onDecoded).toHaveBeenCalledTimes(1)
  })

  it('ignores upload completion after navigation/unmount', async () => {
    let resolve!: (value: string) => void
    vi.mocked(decodeQRImage).mockReturnValue(new Promise<string>((done) => { resolve = done }))
    const onDecoded = vi.fn()
    const view = render(<ImageScanner onDecoded={onDecoded} />)
    select('first.png')
    view.unmount()
    await act(async () => { resolve('stale'); await Promise.resolve() })
    expect(onDecoded).not.toHaveBeenCalled()
  })
})
