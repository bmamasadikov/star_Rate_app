import { useState, KeyboardEvent } from 'react'
import './StarRating.css'

export interface StarRatingProps {
  /** Current rating value (0-5, supports decimals like 4.5) */
  rating: number
  /** Maximum number of stars (default: 5) */
  maxRating?: number
  /** Size of stars in pixels (default: 24) */
  size?: number
  /** Whether the rating is interactive (default: false) */
  interactive?: boolean
  /** Show numeric value next to stars (default: false) */
  showValue?: boolean
  /** Callback when rating changes */
  onRatingChange?: (rating: number) => void
  /** Custom color for filled stars */
  color?: string
  /** Custom color for empty stars */
  emptyColor?: string
  /** CSS class name */
  className?: string
}

const StarRating = ({
  rating,
  maxRating = 5,
  size = 24,
  interactive = false,
  showValue = false,
  onRatingChange,
  color = '#ffc107',
  emptyColor = '#e0e0e0',
  className = '',
}: StarRatingProps) => {
  const [hoverRating, setHoverRating] = useState<number | null>(null)

  // Validate rating bounds
  const validRating = Math.max(0, Math.min(rating, maxRating))
  const displayRating = hoverRating !== null ? hoverRating : validRating

  const handleClick = (starIndex: number) => {
    if (interactive && onRatingChange) {
      onRatingChange(starIndex)
    }
  }

  const handleMouseEnter = (starIndex: number) => {
    if (interactive) {
      setHoverRating(starIndex)
    }
  }

  const handleMouseLeave = () => {
    if (interactive) {
      setHoverRating(null)
    }
  }

  const handleKeyDown = (event: KeyboardEvent, starIndex: number) => {
    if (interactive && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      handleClick(starIndex)
    }
  }

  const getStarFillPercentage = (starIndex: number): number => {
    if (displayRating >= starIndex) {
      return 100
    } else if (displayRating > starIndex - 1) {
      return (displayRating - (starIndex - 1)) * 100
    }
    return 0
  }

  const stars = Array.from({ length: maxRating }, (_, index) => {
    const starIndex = index + 1
    const fillPercentage = getStarFillPercentage(starIndex)

    return (
      <span
        key={starIndex}
        className={`star ${interactive ? 'interactive' : ''}`}
        onClick={() => handleClick(starIndex)}
        onMouseEnter={() => handleMouseEnter(starIndex)}
        onMouseLeave={handleMouseLeave}
        onKeyDown={(e) => handleKeyDown(e, starIndex)}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={`${starIndex} star${starIndex !== 1 ? 's' : ''}`}
        style={{
          fontSize: `${size}px`,
          cursor: interactive ? 'pointer' : 'default',
        }}
      >
        <span className="star-empty" style={{ color: emptyColor }}>
          ★
        </span>
        <span
          className="star-filled"
          style={{
            color: color,
            width: `${fillPercentage}%`,
          }}
        >
          ★
        </span>
      </span>
    )
  })

  return (
    <div
      className={`star-rating ${className}`}
      role="img"
      aria-label={`Rating: ${validRating.toFixed(1)} out of ${maxRating} stars`}
    >
      <div className="stars-container">{stars}</div>
      {showValue && (
        <span className="rating-value" style={{ fontSize: `${size * 0.6}px` }}>
          {validRating.toFixed(1)}
        </span>
      )}
    </div>
  )
}

export default StarRating
