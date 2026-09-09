# 🥮 Crumb

**Staff credit, with something to collect.**

→ **[Open the live demo](https://bellaaaaxu.github.io/crumb/)**

A Hong Kong-style bakery hands its staff gift cards for good work and for holidays. Crumb is the
page they check the balance on — and the reason they keep checking it. Every $50 of gift cards
*received* adds a hand-drawn pastry to a shelf that never empties, no matter how much you spend.

This repository is an interactive demo of that idea, laid out like a store listing. **It plays
itself** — a scripted tour runs the whole story on load, and one touch anywhere hands you the
controls. No sign-in, no backend, nothing to install.

The tour is not a recording. It presses the same buttons and calls the same functions a person
does, so what plays is the app being driven rather than a re-enactment of it.

---

## What to look at

| | |
|---|---|
| **The collection only grows** | The tray counts gift cards *received*, not money held. Spend the balance to zero and every pastry stays. A card from last spring is still on the shelf. |
| **The threshold is hidden** | The caption names what is coming — never how far away it is. Staff cannot make a gift card arrive faster, so a progress bar would only be noise. Hidden, it reads as a gift rather than an accounting statement. |
| **No two shelves match** | The order is seeded from the staff number, so the same balance looks different on every phone. It became something people compared on shift, which was the point. |
| **Three taps, no menus** | Look at the balance, press one button, confirm an amount. There is no login, no settings page, no navigation. |

The store-listing header borrows the shape of an app page but not its habits: the figures in the
stats row are things that are actually true about the build. There are no invented ratings or
reviews anywhere on this page.

## The art

All 39 pastries are drawn by hand on a 12×12 grid, and the balance digits and the `CRUMB` wordmark
on a 3×5 grid — all of it in [`assets/sprites.js`](assets/sprites.js) as plain character rows:

```js
laopo: { palette: { X: '#5C3A1D', b: '#E0A73C', a: '#F3D488', s: '#8A5A22' }, rows: [
  '....XXXX....',
  '..XXbbbbXX..',
  '.XbbaaaabbX.',
  ...
```

No icon library, no pixel font, no image files, nothing fetched from a CDN. The signature in the
footer is drawn the same way, on the same grid, in [`assets/signature.svg`](assets/signature.svg).

Colour is the only thing a sprite carries; every drawing is centred by measuring its own content
bounds, so a flat one (prawn cracker) and a round one (mooncake) sit level in the same slot.

## Running it

There is no build step and no dependencies. Clone it and open `index.html`, or:

```bash
python3 -m http.server 4173
```

The demo keeps its state in `localStorage`, so a reload remembers where you left off. **Reset the
demo** in the counter panel puts it back.

## How it is put together

```
index.html            markup, ~130 lines
assets/style.css      one light theme, no dark variant — a single warm world on purpose
assets/sprites.js     39 sprites, 3x5 digits and capitals, canvas drawing helpers
assets/app.js         demo state, the ledger, animations
assets/signature.svg  footer signature, same pixel grid as everything else
```

The ledger is append-only, the way the original is: a balance is `sum(amount)` over the entries and
a lifetime total is the sum of only the positive ones. Two different questions answered from one
set of rows — which is what makes "spending never eats your collection" fall out for free rather
than needing a second counter to keep in sync.

## About this demo

Built from an internal tool I designed and shipped for a bakery's staff. The names, staff numbers,
balances and history on this page are invented; the pastries, the reward rule and the interface are
the real thing. Nothing here connects to any employer's data.

---

Designed & built by **Bella Xu** · [github.com/bellaaaaxu](https://github.com/bellaaaaxu)
