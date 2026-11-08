import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// Device lifecycle is tested independently; these tests exercise route composition.
vi.mock('./components/CameraScanner', () => ({
  default: ({ onDecoded, onUploadFallback }: { onDecoded: (value: string) => void; onUploadFallback: () => void }) => (
    <div>
      <button onClick={() => onDecoded('https://unverified.example/path')}>Simulate decoded QR</button>
      <button onClick={onUploadFallback}>Upload fallback</button>
    </div>
  ),
}))
vi.mock('./components/ImageScanner', () => ({
  default: ({ onDecoded }: { onDecoded: (value: string) => void }) => (
    <button onClick={() => onDecoded('uploaded-qr-value')}>Simulate upload decode</button>
  ),
}))

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'UNKNOWN', message: 'Not a registered TrueSeal code.' }), { status: 200, headers: { 'content-type': 'application/json' } })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('TrueSeal scanner-first application', () => {
  it('retains the approved homepage branding and actions', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Scan with confidence.' })).toBeInTheDocument()
    expect(screen.getByText('Check who signed a QR code and where it leads.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Scan QR Code/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload QR Image/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /For organizations/ })).toBeInTheDocument()
    expect(screen.getByText('No account required. Links never open automatically.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Generate QR Code/ })).not.toBeInTheDocument()
  })

  it('replaces CP01 scanner placeholder with the scanner interface', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))
    expect(screen.getByRole('heading', { name: 'Scan a QR Code' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to home/ }))
    expect(screen.getByRole('heading', { name: 'Scan with confidence.' })).toBeInTheDocument()
  })

  it('presents arbitrary scanned links as unknown, never as verified destinations', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Simulate decoded QR' }))
    expect(await screen.findByText('Unknown QR')).toBeInTheDocument()
    expect(screen.getByTestId('qr-raw-content')).toHaveTextContent('https://unverified.example/path')
    expect(screen.queryByText('Signature verified.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open/ })).not.toBeInTheDocument()
    expect(openSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Scan another' }))
    expect(screen.getByRole('button', { name: 'Simulate decoded QR' })).toBeInTheDocument()
    openSpy.mockRestore()
  })

  it('routes camera fallback to image upload and checks decoded uploads', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Upload fallback' }))
    expect(screen.getByRole('heading', { name: 'Upload a QR Image' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Simulate upload decode' }))
    expect(await screen.findByText('Unknown QR')).toBeInTheDocument()
    expect(screen.getByTestId('qr-raw-content')).toHaveTextContent('uploaded-qr-value')
  })

  it('provides the protected organization sign-in interface', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /For organizations/ }))
    expect(screen.getByRole('heading', { name: 'Organization access' })).toBeInTheDocument()
  })
})


describe('Direct verification paths', () => {
  it('loads /v/<token> directly and verifies from a fresh page', async () => {
    window.history.replaceState(null, '', '/v/a.b.c')
    const called = vi.fn(async () => new Response(JSON.stringify({ status: 'UNKNOWN', message: 'Unknown code' }), { status: 200 }))
    vi.stubGlobal('fetch', called)
    render(<App />)
    expect(await screen.findByText('Unknown QR')).toBeInTheDocument()
    expect(called).toHaveBeenCalledWith('/api/verify', expect.objectContaining({ method: 'POST' }))
    expect(screen.queryByRole('link', { name: 'Open Destination' })).not.toBeInTheDocument()
  })
  it('shows a verified destination only on server VERIFIED and never opens it automatically', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'VERIFIED', message: 'Signed and registered', destination: 'https://trueseal-431.pages.dev/demo',
      issuer: { id: 'trueseal-demo', displayName: 'TrueSeal Demo Organization', trustTier: 'demo' }, title: 'Demo',
    }), { status: 200 })))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Simulate decoded QR' }))
    const link = await screen.findByRole('link', { name: 'Open Destination' })
    expect(link).toHaveAttribute('href', 'https://trueseal-431.pages.dev/demo')
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })
  it('recognizes the real /demo landing page', () => {
    window.history.replaceState(null, '', '/demo')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'TrueSeal Demo Destination' })).toBeInTheDocument()
  })
})
