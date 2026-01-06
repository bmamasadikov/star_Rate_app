# ⭐ Star Rating App

A modern, accessible, and fully-tested star rating component built with React, TypeScript, and Vite.

## Features

- ✅ **Interactive star rating** - Click to rate from 1-5 stars
- ✅ **Read-only display mode** - Show average ratings without interaction
- ✅ **Partial star support** - Display ratings like 4.3 stars with precision
- ✅ **Keyboard accessible** - Full keyboard navigation (Tab + Enter/Space)
- ✅ **Screen reader friendly** - Proper ARIA labels and roles
- ✅ **Responsive design** - Works on mobile, tablet, and desktop
- ✅ **Customizable** - Configure size, colors, and max rating
- ✅ **TypeScript** - Full type safety
- ✅ **95%+ test coverage** - Comprehensive unit and integration tests

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
```

## Test Coverage

**Current Coverage: 95.12%** (44 tests, all passing ✅)

- StarRating component: **100% coverage**
- App component: **100% coverage**

See [TEST_COVERAGE_ANALYSIS.md](./TEST_COVERAGE_ANALYSIS.md) for detailed coverage report and improvement recommendations.

## Usage

### Basic Interactive Rating

```tsx
import StarRating from './components/StarRating'

function App() {
  const [rating, setRating] = useState(0)

  return (
    <StarRating
      rating={rating}
      onRatingChange={setRating}
      interactive={true}
    />
  )
}
```

### Display Average Rating

```tsx
<StarRating
  rating={4.3}
  interactive={false}
  showValue={true}
/>
```

## Component API

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rating` | `number` | **required** | Current rating (0-maxRating) |
| `maxRating` | `number` | `5` | Maximum number of stars |
| `size` | `number` | `24` | Star size in pixels |
| `interactive` | `boolean` | `false` | Enable click interactions |
| `showValue` | `boolean` | `false` | Show numeric value |
| `onRatingChange` | `(rating: number) => void` | - | Callback when rating changes |
| `color` | `string` | `#ffc107` | Filled star color |
| `emptyColor` | `string` | `#e0e0e0` | Empty star color |
| `className` | `string` | `''` | Custom CSS class |

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Vitest** - Unit testing framework
- **React Testing Library** - Component testing
- **jsdom** - DOM implementation for testing

## Project Structure

```
star_Rate_app/
├── src/
│   ├── components/
│   │   ├── StarRating.tsx         # Main component
│   │   ├── StarRating.css         # Component styles
│   │   └── StarRating.test.tsx    # Component tests (31 tests)
│   ├── test/
│   │   └── setup.ts               # Test configuration
│   ├── App.tsx                    # Demo application
│   ├── App.test.tsx               # App tests (13 tests)
│   ├── App.css                    # App styles
│   ├── main.tsx                   # Entry point
│   └── index.css                  # Global styles
├── TEST_COVERAGE_ANALYSIS.md      # Coverage analysis & recommendations
├── vite.config.ts                 # Vite configuration
├── tsconfig.json                  # TypeScript configuration
└── package.json                   # Dependencies
```

## Testing

The project has comprehensive test coverage including:

- ✅ Rendering tests (default props, custom configurations)
- ✅ Interaction tests (click, hover, keyboard navigation)
- ✅ Accessibility tests (ARIA labels, keyboard support)
- ✅ Edge case tests (negative ratings, decimals, boundaries)
- ✅ Integration tests (App + StarRating)
- ✅ State management tests

### Run Tests

```bash
# Run all tests
npm run test

# Watch mode (development)
npm run test -- --watch

# Coverage report (HTML + terminal)
npm run test:coverage

# Visual test UI
npm run test:ui
```

Coverage reports are generated in `coverage/` directory.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility

This component follows WCAG 2.1 Level AA guidelines:

- ✅ Keyboard navigation support
- ✅ Screen reader announcements
- ✅ Focus indicators
- ✅ ARIA labels and roles
- ✅ Sufficient color contrast

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm run test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## License

MIT License - feel free to use this in your projects!

## Future Enhancements

See [TEST_COVERAGE_ANALYSIS.md](./TEST_COVERAGE_ANALYSIS.md) for planned improvements:

- E2E testing with Playwright
- Visual regression testing
- Backend API integration
- Additional accessibility audits
- Performance optimizations

---

Built with ❤️ using React + TypeScript + Vite 
