import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import App from './App'

afterEach(cleanup)

describe('TrueSeal foundation homepage', () => {
  it('shows approved heading, description, and actions', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Scan with confidence.' })).toBeInTheDocument()
    expect(screen.getByText('Check who signed a QR code and where it leads.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Scan QR Code/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload QR Image/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /For organizations/ })).toBeInTheDocument()
    expect(screen.getByText('No account required. Links never open automatically.')).toBeInTheDocument()
  })

  it('never presents the camera as operational in CP01', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))
    expect(screen.getByRole('heading', { name: /Camera scanning is coming soon/ })).toBeInTheDocument()
    expect(screen.getByText(/No camera access or QR verification occurs/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to home/ }))
    expect(screen.getByRole('heading', { name: 'Scan with confidence.' })).toBeInTheDocument()
  })

  it('labels upload and organization access as unavailable', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Upload QR Image/ }))
    expect(screen.getByRole('heading', { name: /Image upload is coming soon/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to home/ }))
    fireEvent.click(screen.getByRole('button', { name: /For organizations/ }))
    expect(screen.getByRole('heading', { name: /Organization access is coming soon/ })).toBeInTheDocument()
  })
})
