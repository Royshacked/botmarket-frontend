import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FloorInfo } from './FloorInfo.jsx'

// The Floor's right column (Roy, 2026-10-23): INFO — a placeholder for what is going on in the app, chat and lists.

afterEach(cleanup)

describe('FloorInfo', () => {
    it('is the Info column: its heading, and what it will hold', () => {
        render(<FloorInfo />)
        expect(screen.getByRole('complementary', { name: 'Info' })).toBeTruthy()
        expect(screen.getByRole('heading', { name: 'Info' })).toBeTruthy()
        expect(screen.getByText(/what is going on in the app, the chat and your lists/i)).toBeTruthy()
    })
})
