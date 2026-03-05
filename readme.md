# Balatro Poker

A hand comparator PWA for a custom Balatro-inspired poker variant. Built for quick showdown rulings at the table — works fully offline.

## The Game

- **2× 54-card decks** (108 cards total, 4 jokers)
- **Up to 4 players**, 8 cards per hand
- **Jokers are wild** — each counts as any card
- **Play all 8 cards** — compound hands like Two 4-of-a-Kinds are possible

### Flow

1. Deal 8 cards each
2. Post small blind and big blind
3. First round of betting
4. Discard any number of cards and redraw
5. Second round of betting
6. Discard and redraw again
7. Final round of betting
8. Showdown — play all 8 cards

## The App

Tap cards to build two hands and instantly see who wins. Hand rankings are determined by a 500K-deal Monte Carlo simulation that runs on launch — rarer hands beat common ones.

### Features

- **Side-by-side comparison** with instant win/loss display
- **Suit selector** (♦♣♥♠) for flush and rainbow detection — suitless by default for speed
- **Joker support** — auto-optimizes to the strongest possible hand
- **Full rankings list** with rarity tiers and probabilities
- **Offline PWA** — install to home screen and use with no signal

## Hand Types

### Standard Poker Hands (Extended to 8 Cards)
- High Card
- One / Two / Three / Four Pairs
- Three of a Kind
- Straight (5-8 cards)
- Flush (5-8 cards)
- Full House
- Four of a Kind
- Straight Flush (5-8 cards)
- Compound hands (e.g. 4-of-a-Kind + Trips, Two 4-of-a-Kinds, up to 8-of-a-Kind)

### Custom Hands
| Hand | Description |
|------|-------------|
| **Rainbow** | 4-card straight with each card a different suit (♠♥♦♣) |
| **Double Rainbow** | Two separate rainbows in one hand |
| **Twins** | Pair of identical cards (same rank AND suit) |
| **Double Twins** | Two twin pairs at any ranks |
| **Triple Twins** | Three twin pairs at any ranks |
| **Quad Twins** | Four twin pairs — all 8 cards are identical duplicates |
| **Straight Pairs** | 2-4 consecutive pairs (e.g. 2×7 + 2×8 + 2×9) |
| **Full Spectrum** | Exactly 2 cards in each suit across all 8 cards |
| **All Evens** | Every card is 2, 4, 6, 8, 10, or Q |
| **All Odds** | Every card is A, 3, 5, 7, 9, J, or K |

## Tiebreakers

1. Same hand type → compare highest rank in primary group
2. If tied → compare secondary group
3. If still tied → compare kickers highest to lowest
4. Jokers take on the rank they represent
5. Perfect tie → split the pot

## Setup

No build step. Just static files.

```
balatro-poker/
├── index.html      # The entire app
├── manifest.json   # PWA configuration
├── sw.js           # Service worker for offline caching
└── README.md
```

### Deploy

Drag the folder onto [app.netlify.com/drop](https://app.netlify.com/drop) — you'll get a live URL instantly.

### Install on Phone

- **iPhone**: Safari → Share → "Add to Home Screen"
- **Android**: Chrome → Menu → "Install app"

Works fully offline after first load.

## Tech

- Vanilla JS with React 18 (loaded from CDN, cached locally by service worker)
- Monte Carlo simulation (500K deals) for probability calculation
- No build tools, no dependencies, no backend
- Service worker pre-caches all assets for offline use