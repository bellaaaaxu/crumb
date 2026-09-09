# 🥮 Crumb

**Staff credit, with something to collect.**

→ **[Open the live demo](https://bellaaaaxu.github.io/crumb/)**

A Hong Kong-style bakery hands out gift cards — to customers, and to staff at holidays. A $50 card
doesn't spend well on a $3 bun, so staff trade theirs in for a credit they draw down instead. Crumb
is where they check it.

It is also where the benefit becomes visible. Every $50 *received* unlocks a pastry on a shelf that
never empties, no matter how much you spend — so a year of good shifts and holidays is something
you can look at, not just a number that goes up and down.

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

All 39 pastries live in the source as character grids, 12×12 each; the balance digits and the
`CRUMB` wordmark on a 3×5 grid. All of it is in [`assets/sprites.js`](assets/sprites.js) as plain
rows of text:

```js
laopo: { palette: { X: '#5C3A1D', b: '#E0A73C', a: '#F3D488', s: '#8A5A22' }, rows: [
  '....XXXX....',
  '..XXbbbbXX..',
  '.XbbaaaabbX.',
  ...
```

No icon library, no pixel font, no image files, nothing fetched from a CDN. The footer signature is
the same kind of data — plain rectangles on the same grid, derived from a handwritten original — in
[`assets/signature.svg`](assets/signature.svg).

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

Built from an internal tool I designed and shipped for a bakery's staff, in daily use by about
thirty people.

**How it was built.** I wrote the specifications, chose and reviewed what came back, and validated
every release before rollout — including the pixel art, which I directed and selected rather than
placed cell by cell. I don't write the code by hand. That is how I work on every system I own, and
it is worth saying plainly: the judgment on display here is in the data model, the controls and the
decisions about what to show, not in the typing.

The names, staff numbers, balances and history on this page are invented. The reward rule, the
ledger design and the interface are the real thing. Nothing here connects to any employer's data.

---

Designed & built by **Bella Xu** · [github.com/bellaaaaxu](https://github.com/bellaaaaxu)
