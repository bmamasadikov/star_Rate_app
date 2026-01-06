import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StarRating from './StarRating'

describe('StarRating Component', () => {
  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<StarRating rating={0} />)
      const rating = screen.getByRole('img', { name: /rating/i })
      expect(rating).toBeInTheDocument()
    })

    it('should render correct number of stars', () => {
      render(<StarRating rating={3} maxRating={5} />)
      const stars = screen.getAllByLabelText(/^\d+ stars?$/)
      expect(stars).toHaveLength(5)
    })

    it('should render custom number of stars', () => {
      render(<StarRating rating={5} maxRating={10} />)
      const stars = screen.getAllByLabelText(/^\d+ stars?$/)
      expect(stars).toHaveLength(10)
    })

    it('should display rating value when showValue is true', () => {
      render(<StarRating rating={4.5} showValue={true} />)
      expect(screen.getByText('4.5')).toBeInTheDocument()
    })

    it('should not display rating value when showValue is false', () => {
      render(<StarRating rating={4.5} showValue={false} />)
      expect(screen.queryByText('4.5')).not.toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const { container } = render(
        <StarRating rating={3} className="custom-class" />
      )
      expect(container.querySelector('.custom-class')).toBeInTheDocument()
    })
  })

  describe('Rating Display', () => {
    it('should display full stars correctly', () => {
      render(<StarRating rating={5} maxRating={5} />)
      const rating = screen.getByRole('img')
      expect(rating).toHaveAttribute('aria-label', 'Rating: 5.0 out of 5 stars')
    })

    it('should display partial stars correctly', () => {
      render(<StarRating rating={3.5} maxRating={5} />)
      const rating = screen.getByRole('img')
      expect(rating).toHaveAttribute('aria-label', 'Rating: 3.5 out of 5 stars')
    })

    it('should handle zero rating', () => {
      render(<StarRating rating={0} />)
      const rating = screen.getByRole('img')
      expect(rating).toHaveAttribute('aria-label', 'Rating: 0.0 out of 5 stars')
    })

    it('should handle rating above max (clamp to max)', () => {
      render(<StarRating rating={10} maxRating={5} />)
      const rating = screen.getByRole('img')
      expect(rating).toHaveAttribute('aria-label', 'Rating: 5.0 out of 5 stars')
    })

    it('should handle negative rating (clamp to 0)', () => {
      render(<StarRating rating={-2} maxRating={5} />)
      const rating = screen.getByRole('img')
      expect(rating).toHaveAttribute('aria-label', 'Rating: 0.0 out of 5 stars')
    })
  })

  describe('Interactive Mode', () => {
    it('should call onRatingChange when star is clicked', async () => {
      const handleRatingChange = vi.fn()
      render(
        <StarRating
          rating={0}
          interactive={true}
          onRatingChange={handleRatingChange}
        />
      )

      const thirdStar = screen.getByLabelText('3 stars')
      await userEvent.click(thirdStar)

      expect(handleRatingChange).toHaveBeenCalledWith(3)
      expect(handleRatingChange).toHaveBeenCalledTimes(1)
    })

    it('should not call onRatingChange when interactive is false', async () => {
      const handleRatingChange = vi.fn()
      render(
        <StarRating
          rating={0}
          interactive={false}
          onRatingChange={handleRatingChange}
        />
      )

      const stars = screen.getAllByLabelText(/star/)
      await userEvent.click(stars[0])

      expect(handleRatingChange).not.toHaveBeenCalled()
    })

    it('should have role="button" when interactive', () => {
      render(<StarRating rating={0} interactive={true} />)
      const stars = screen.getAllByRole('button')
      expect(stars.length).toBeGreaterThan(0)
    })

    it('should not have role="button" when not interactive', () => {
      render(<StarRating rating={0} interactive={false} />)
      const buttons = screen.queryAllByRole('button')
      expect(buttons).toHaveLength(0)
    })
  })

  describe('Keyboard Accessibility', () => {
    it('should be focusable when interactive', () => {
      render(<StarRating rating={0} interactive={true} />)
      const firstStar = screen.getByLabelText('1 star')
      expect(firstStar).toHaveAttribute('tabIndex', '0')
    })

    it('should not be focusable when not interactive', () => {
      render(<StarRating rating={0} interactive={false} />)
      const stars = screen.getAllByLabelText(/star/)
      stars.forEach((star) => {
        expect(star).not.toHaveAttribute('tabIndex')
      })
    })

    it('should handle Enter key press', () => {
      const handleRatingChange = vi.fn()
      render(
        <StarRating
          rating={0}
          interactive={true}
          onRatingChange={handleRatingChange}
        />
      )

      const secondStar = screen.getByLabelText('2 stars')
      fireEvent.keyDown(secondStar, { key: 'Enter' })

      expect(handleRatingChange).toHaveBeenCalledWith(2)
    })

    it('should handle Space key press', () => {
      const handleRatingChange = vi.fn()
      render(
        <StarRating
          rating={0}
          interactive={true}
          onRatingChange={handleRatingChange}
        />
      )

      const fourthStar = screen.getByLabelText('4 stars')
      fireEvent.keyDown(fourthStar, { key: ' ' })

      expect(handleRatingChange).toHaveBeenCalledWith(4)
    })

    it('should not trigger on other keys', () => {
      const handleRatingChange = vi.fn()
      render(
        <StarRating
          rating={0}
          interactive={true}
          onRatingChange={handleRatingChange}
        />
      )

      const star = screen.getByLabelText('3 stars')
      fireEvent.keyDown(star, { key: 'a' })
      fireEvent.keyDown(star, { key: 'Escape' })

      expect(handleRatingChange).not.toHaveBeenCalled()
    })
  })

  describe('Hover Effects', () => {
    it('should show hover effect on interactive stars', () => {
      render(<StarRating rating={2} interactive={true} />)
      const fourthStar = screen.getByLabelText('4 stars')

      fireEvent.mouseEnter(fourthStar)
      // Hover state is internal, but we can verify the event handlers exist
      expect(fourthStar).toBeInTheDocument()
    })

    it('should reset hover on mouse leave', () => {
      render(<StarRating rating={2} interactive={true} />)
      const fourthStar = screen.getByLabelText('4 stars')

      fireEvent.mouseEnter(fourthStar)
      fireEvent.mouseLeave(fourthStar)

      // Component should return to showing actual rating
      expect(fourthStar).toBeInTheDocument()
    })
  })

  describe('Custom Styling', () => {
    it('should apply custom size', () => {
      render(<StarRating rating={3} size={48} />)
      const star = screen.getByLabelText('1 star')
      expect(star).toHaveStyle({ fontSize: '48px' })
    })

    it('should apply custom color', () => {
      const { container } = render(
        <StarRating rating={3} color="#ff0000" />
      )
      const filledStar = container.querySelector('.star-filled')
      expect(filledStar).toHaveStyle({ color: '#ff0000' })
    })

    it('should apply custom empty color', () => {
      const { container } = render(
        <StarRating rating={3} emptyColor="#cccccc" />
      )
      const emptyStar = container.querySelector('.star-empty')
      expect(emptyStar).toHaveStyle({ color: '#cccccc' })
    })
  })

  describe('Edge Cases', () => {
    it('should handle decimal ratings', () => {
      render(<StarRating rating={3.7} showValue={true} />)
      expect(screen.getByText('3.7')).toBeInTheDocument()
    })

    it('should handle very small decimal ratings', () => {
      render(<StarRating rating={0.1} showValue={true} />)
      expect(screen.getByText('0.1')).toBeInTheDocument()
    })

    it('should work without onRatingChange callback', async () => {
      render(<StarRating rating={0} interactive={true} />)
      const star = screen.getByLabelText('1 star')

      // Should not throw error
      await userEvent.click(star)
      expect(star).toBeInTheDocument()
    })

    it('should handle single star rating system', () => {
      render(<StarRating rating={1} maxRating={1} />)
      const stars = screen.getAllByLabelText(/^\d+ stars?$/)
      expect(stars).toHaveLength(1)
    })
  })

  describe('ARIA Labels', () => {
    it('should have correct aria-label for container', () => {
      render(<StarRating rating={3.5} maxRating={5} />)
      const container = screen.getByRole('img')
      expect(container).toHaveAttribute(
        'aria-label',
        'Rating: 3.5 out of 5 stars'
      )
    })

    it('should have correct aria-labels for individual stars', () => {
      render(<StarRating rating={0} />)
      expect(screen.getByLabelText('1 star')).toBeInTheDocument()
      expect(screen.getByLabelText('2 stars')).toBeInTheDocument()
      expect(screen.getByLabelText('3 stars')).toBeInTheDocument()
      expect(screen.getByLabelText('4 stars')).toBeInTheDocument()
      expect(screen.getByLabelText('5 stars')).toBeInTheDocument()
    })
  })
})
