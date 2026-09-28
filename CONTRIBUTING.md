# Contributing to Crumb

Crumb is a small, interactive staff-credit demo made with HTML, CSS and JavaScript.
Start with the [README](README.md) to run it locally and understand the design.

## Useful contributions

- Reproducible bug reports, especially on mobile browsers.
- Keyboard, screen-reader and reduced-motion improvements.
- Clearer setup instructions and explanations.
- Pixel-art or layout fixes that preserve the existing visual style.

For larger changes, open an issue describing the problem and proposed approach before
building it. Keep the demo dependency-free and runnable without a build step. A production
backend or a framework migration would substantially change the scope of this project.

## Reporting a bug

Include the browser and device, steps to reproduce, expected behaviour and what happened
instead. Say whether you started with **Reset the demo** or previously saved state.
Screenshots help with visual issues. Use invented examples rather than real employee data.

## Making a change

1. Fork the repository and clone your fork.
2. Create a branch for a focused change.
3. Follow the existing style in the files you edit.
4. Run the relevant checks below.
5. Open a pull request explaining the problem, the change and how you checked it.
   Include before-and-after screenshots for visible changes.

## Checks before a pull request

There is currently no automated test suite. For application changes, check the relevant
flows in a browser and report your browser and results in the pull request:

- Reset the demo, watch the guided tour and take control manually.
- Switch between the sample staff members and check their balances and collections.
- Add gift-card credit, then spend some credit. Spending must not remove collected pastries.
- Reload the page to check that state persists, then reset to restore the sample data.
- Check narrow and wide layouts, keyboard operation and reduced-motion behaviour when
  your change affects them. Check the browser console for errors.

If Node.js is installed, these commands check JavaScript syntax; they do not test browser
behaviour:

```bash
node --check assets/app.js
node --check assets/sprites.js
node --check scripts/make-og.mjs
```

The optional social-preview generator uses Node.js built-in modules. If you change the
preview artwork, regenerate the image and inspect it before including it in your change:

```bash
node scripts/make-og.mjs
```

Keep discussion constructive and explain design trade-offs. Small, focused changes are
easier to review.
