
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { generateQRCode, decodeQRImage } from './lib/qr'

vi.mock('./lib/qr', () => ({
  generateQRCode: vi.fn(),
  decodeQRImage: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TrueSeal CP03 QR functionality', () => {
  it('shows the homepage and QR actions', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Scan with confidence.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Scan QR Code/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload QR Image/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Generate QR Code/ })).toBeInTheDocument()
  })

  it('generates and displays a QR code', async () => {
    vi.mocked(generateQRCode).mockResolvedValue('data:image/png;base64,test')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Generate QR Code/ }))
    fireEvent.change(screen.getByLabelText('Text or URL'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    expect(await screen.findByAltText('Generated QR code')).toHaveAttribute(
      'src',
      'data:image/png;base64,test',
    )
  })

  it('displays an error when QR generation fails', async () => {
    vi.mocked(generateQRCode).mockRejectedValue(new Error('Enter text or a URL first.'))

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Generate QR Code/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter text or a URL first.',
    )
  })

  it('decodes an uploaded QR image', async () => {
    vi.mocked(decodeQRImage).mockResolvedValue('https://example.com')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Upload QR Image/ }))

    const file = new File(['image'], 'qr.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Choose image'), {
      target: { files: [file] },
    })

    expect(await screen.findByText('https://example.com')).toBeInTheDocument()
    expect(screen.getByText(/TrueSeal has not verified it/)).toBeInTheDocument()
  })

  it('shows an error when an image cannot be decoded', async () => {
    vi.mocked(decodeQRImage).mockRejectedValue(new Error('No QR code'))

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Upload QR Image/ }))

    const file = new File(['image'], 'invalid.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Choose image'), {
      target: { files: [file] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No readable QR code was found',
    )
  })

  it('provides camera scanning controls', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))

    expect(screen.getByRole('heading', { name: 'Scan a QR Code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start Camera/ })).toBeInTheDocument()
  })

  it('keeps organization access unavailable', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /For organizations/ }))

    expect(
      screen.getByRole('heading', { name: /Organization access is coming soon/ }),
    ).toBeInTheDocument()
  })
})
