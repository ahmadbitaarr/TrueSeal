import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CameraScanner from './CameraScanner'

const camera = vi.hoisted(() => ({
  start: vi.fn(), stop: vi.fn(), pause: vi.fn(), destroy: vi.fn(),
  onDecode: null as ((result: { data: string }) => void) | null,
  opts: null as Record<string, unknown> | null,
}))
vi.mock('qr-scanner', () => ({
  default: class FakeScanner {
    constructor(_video: HTMLVideoElement, onDecode: (result: { data: string }) => void, opts: Record<string, unknown>) {
      camera.onDecode = onDecode
      camera.opts = opts
    }
    start() { return camera.start() }
    stop() { camera.stop() }
    pause() { return camera.pause() }
    destroy() { camera.destroy() }
  },
}))

beforeEach(() => {
  camera.start.mockReset().mockResolvedValue(undefined)
  camera.stop.mockReset()
  camera.pause.mockReset().mockResolvedValue(true)
  camera.destroy.mockReset()
  camera.onDecode = null
  camera.opts = null
})
afterEach(cleanup)

describe('CP03 camera lifecycle', () => {
  it('never starts before interaction and requests rear-facing camera', async () => {
    render(<CameraScanner onDecoded={vi.fn()} onUploadFallback={vi.fn()} />)
    expect(camera.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Start Camera/ }))
    await waitFor(() => expect(camera.start).toHaveBeenCalledTimes(1))
    expect(camera.opts).toMatchObject({ preferredCamera: 'environment' })
    expect(await screen.findByText(/Scanning for a QR code/)).toBeInTheDocument()
  })

  it('stops and destroys scanner after first successful decode, suppressing duplicates', async () => {
    const onDecoded = vi.fn()
    render(<CameraScanner onDecoded={onDecoded} onUploadFallback={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Start Camera/ }))
    await screen.findByText(/Scanning for a QR code/)
    act(() => { camera.onDecode?.({ data: 'https://example.edu' }); camera.onDecode?.({ data: 'https://attacker.invalid' }) })
    expect(onDecoded).toHaveBeenCalledTimes(1)
    expect(onDecoded).toHaveBeenCalledWith('https://example.edu')
    expect(camera.stop).toHaveBeenCalled()
    expect(camera.pause).toHaveBeenCalled()
    expect(camera.destroy).toHaveBeenCalled()
  })

  it('cleans up on unmount (including navigation)', async () => {
    const view = render(<CameraScanner onDecoded={vi.fn()} onUploadFallback={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Start Camera/ }))
    await screen.findByText(/Scanning for a QR code/)
    view.unmount()
    expect(camera.stop).toHaveBeenCalled()
    expect(camera.destroy).toHaveBeenCalled()
  })

  it('cancels a pending camera permission request and ignores its late completion', async () => {
    let resolveStart!: () => void
    camera.start.mockReturnValue(new Promise<void>((resolve) => { resolveStart = resolve }))
    const onDecoded = vi.fn()
    render(<CameraScanner onDecoded={onDecoded} onUploadFallback={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Start Camera/ }))
    fireEvent.click(screen.getByRole('button', { name: /Cancel Camera/ }))
    await act(async () => { resolveStart(); await Promise.resolve() })
    expect(screen.getByText(/Camera is off/)).toBeInTheDocument()
    act(() => camera.onDecode?.({ data: 'stale' }))
    expect(onDecoded).not.toHaveBeenCalled()
    expect(camera.destroy).toHaveBeenCalled()
  })

  it('reports permission denial and preserves upload fallback', async () => {
    camera.start.mockRejectedValue(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
    const fallback = vi.fn()
    render(<CameraScanner onDecoded={vi.fn()} onUploadFallback={fallback} />)
    fireEvent.click(screen.getByRole('button', { name: /Start Camera/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission was denied/)
    fireEvent.click(screen.getByRole('button', { name: /Upload an image instead/ }))
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable camera without hiding upload fallback', async () => {
    camera.start.mockRejectedValue(Object.assign(new Error('not found'), { name: 'NotFoundError' }))
    render(<CameraScanner onDecoded={vi.fn()} onUploadFallback={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Start Camera/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/No usable camera/)
    expect(screen.getByRole('button', { name: /Upload an image instead/ })).toBeInTheDocument()
  })

  it('permits repeated start/cancel without allowing stale results', async () => {
    const onDecoded = vi.fn()
    render(<CameraScanner onDecoded={onDecoded} onUploadFallback={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Start Camera/ }))
    await screen.findByText(/Scanning for a QR code/)
    fireEvent.click(screen.getByRole('button', { name: /Cancel Camera/ }))
    fireEvent.click(screen.getByRole('button', { name: /Start Camera/ }))
    await waitFor(() => expect(camera.start).toHaveBeenCalledTimes(2))
    act(() => camera.onDecode?.({ data: 'valid' }))
    expect(onDecoded).toHaveBeenCalledOnce()
  })
})
