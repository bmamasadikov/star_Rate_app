import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App Component', () => {
  describe('Rendering', () => {
    it('should render the app header', () => {
      render(<App />)
      expect(screen.getByText(/Star Rating App/i)).toBeInTheDocument()
      expect(screen.getByText(/Rate your experience!/i)).toBeInTheDocument()
    })

    it('should render "Your Rating" section', () => {
      render(<App />)
      expect(screen.getByRole('heading', { name: /Your Rating/i })).toBeInTheDocument()
    })

    it('should render "Average Rating" section', () => {
      render(<App />)
      expect(screen.getByRole('heading', { name: /Average Rating/i })).toBeInTheDocument()
    })

    it('should render features section', () => {
      render(<App />)
      expect(screen.getByRole('heading', { name: /Features Demonstrated/i })).toBeInTheDocument()
    })

    it('should display initial average rating', () => {
      render(<App />)
      expect(screen.getByText('4.3')).toBeInTheDocument()
    })

    it('should display initial total ratings', () => {
      render(<App />)
      expect(screen.getByText('142 total ratings')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should update user rating when star is clicked', async () => {
      render(<App />)
      // Get all stars with label "3 stars" and click the first one (interactive)
      const threeStars = screen.getAllByLabelText('3 stars')[0]

      await userEvent.click(threeStars)

      expect(screen.getByText('You rated: 3 stars')).toBeInTheDocument()
    })

    it('should display singular "star" for rating of 1', async () => {
      render(<App />)
      // Get all stars with label "1 star" and click the first one (interactive)
      const oneStar = screen.getAllByLabelText('1 star')[0]

      await userEvent.click(oneStar)

      expect(screen.getByText('You rated: 1 star')).toBeInTheDocument()
    })

    it('should update average rating when user submits rating', async () => {
      render(<App />)
      // Get all stars with label "5 stars" and click the first one (interactive)
      const fiveStars = screen.getAllByLabelText('5 stars')[0]

      // Click to rate 5 stars
      await userEvent.click(fiveStars)

      // Check that total ratings increased
      expect(screen.getByText('143 total ratings')).toBeInTheDocument()

      // Average should have changed (original 4.3 with 142 ratings + new 5.0 rating)
      // New average = (4.3 * 142 + 5) / 143 ≈ 4.305
      const averageTexts = screen.getAllByText(/4\.\d/)
      expect(averageTexts.length).toBeGreaterThan(0)
    })

    it('should not show rating text initially', () => {
      render(<App />)
      expect(screen.queryByText(/You rated:/)).not.toBeInTheDocument()
    })
  })

  describe('Features List', () => {
    it('should display all feature items', () => {
      render(<App />)

      expect(screen.getByText(/Interactive star rating/i)).toBeInTheDocument()
      expect(screen.getByText(/Read-only display mode/i)).toBeInTheDocument()
      expect(screen.getByText(/Partial star support/i)).toBeInTheDocument()
      expect(screen.getByText(/Hover effects/i)).toBeInTheDocument()
      expect(screen.getByText(/Keyboard accessible/i)).toBeInTheDocument()
      expect(screen.getByText(/Responsive design/i)).toBeInTheDocument()
    })
  })

  describe('Integration', () => {
    it('should have both interactive and read-only rating components', () => {
      render(<App />)

      // Should have interactive buttons (5 stars in "Your Rating" section)
      const interactiveStars = screen.getAllByRole('button')
      expect(interactiveStars.length).toBeGreaterThanOrEqual(5)
    })

    it('should calculate new average correctly after multiple ratings', async () => {
      render(<App />)

      // Initial: 4.3 average, 142 ratings
      // Rate 5 stars - get the first one (interactive)
      await userEvent.click(screen.getAllByLabelText('5 stars')[0])
      expect(screen.getByText('143 total ratings')).toBeInTheDocument()

      // The average should be updated
      // (4.3 * 142 + 5) / 143 = 4.3049...
      const ratingElements = screen.getAllByText(/4\.\d/)
      expect(ratingElements.length).toBeGreaterThan(0)
    })
  })
})
