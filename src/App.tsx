import { useState } from 'react'
import StarRating from './components/StarRating'
import './App.css'

function App() {
  const [rating, setRating] = useState<number>(0)
  const [averageRating, setAverageRating] = useState<number>(4.3)
  const [totalRatings, setTotalRatings] = useState<number>(142)

  const handleRatingChange = (newRating: number) => {
    setRating(newRating)
    // Simulate updating average (in real app, this would come from backend)
    const newTotal = totalRatings + 1
    const newAverage = (averageRating * totalRatings + newRating) / newTotal
    setAverageRating(newAverage)
    setTotalRatings(newTotal)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>⭐ Star Rating App</h1>
        <p>Rate your experience!</p>
      </header>

      <main className="app-main">
        <section className="rating-section">
          <h2>Your Rating</h2>
          <StarRating
            rating={rating}
            onRatingChange={handleRatingChange}
            size={40}
            interactive={true}
          />
          {rating > 0 && (
            <p className="rating-text">You rated: {rating} star{rating !== 1 ? 's' : ''}</p>
          )}
        </section>

        <section className="rating-section">
          <h2>Average Rating</h2>
          <StarRating
            rating={averageRating}
            size={32}
            interactive={false}
            showValue={true}
          />
          <p className="rating-text">{totalRatings} total ratings</p>
        </section>

        <section className="info-section">
          <h2>Features Demonstrated</h2>
          <ul>
            <li>Interactive star rating (click to rate)</li>
            <li>Read-only display mode</li>
            <li>Partial star support (e.g., 4.3 stars)</li>
            <li>Hover effects</li>
            <li>Keyboard accessible (Tab + Enter/Space)</li>
            <li>Responsive design</li>
          </ul>
        </section>
      </main>
    </div>
  )
}

export default App
