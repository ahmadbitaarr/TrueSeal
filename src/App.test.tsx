import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(cleanup)

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

  it('presents arbitrary scanned links as unverified, never as verified destinations', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Simulate decoded QR' }))
    expect(screen.getByText('Unverified')).toBeInTheDocument()
    expect(screen.getByTestId('qr-raw-content')).toHaveTextContent('https://unverified.example/path')
    expect(screen.queryByText('Signature verified.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open/ })).not.toBeInTheDocument()
    expect(openSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Scan another' }))
    expect(screen.getByRole('button', { name: 'Simulate decoded QR' })).toBeInTheDocument()
    openSpy.mockRestore()
  })

  it('routes camera fallback to image upload and handles decoded uploads as unverified', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Upload fallback' }))
    expect(screen.getByRole('heading', { name: 'Upload a QR Image' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Simulate upload decode' }))
    expect(screen.getByText('Unverified')).toBeInTheDocument()
    expect(screen.getByTestId('qr-raw-content')).toHaveTextContent('uploaded-qr-value')
  })

  it('preserves the organization placeholder', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /For organizations/ }))
    expect(screen.getByRole('heading', { name: 'Organization access is coming soon' })).toBeInTheDocument()
  })
})
