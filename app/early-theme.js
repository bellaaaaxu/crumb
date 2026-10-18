/* The team's colours from the first paint. index.html runs this small classic script in its
 * <head>, before the stylesheet and with no defer or async, so the browser runs it before it
 * paints anything. It puts on <html> the team's theme id this device remembers (crumb.theme,
 * which main.js's applyTheme writes each time the page learns the session), so a team with
 * colours of its own (Café is dark) never flashes light while the page loads; main.js corrects
 * it as soon as the session arrives. It knows no list of themes: an id the stylesheet has no
 * colours for is simply light. It leaves the browser bar alone; applyTheme sets that. */
try {
  const remembered = window.localStorage.getItem('crumb.theme');
  // The shape of a theme id, as in main.js: 2 to 32 lowercase letters and digits, starting with a letter.
  if (typeof remembered === 'string' && /^[a-z][a-z0-9]{1,31}$/.test(remembered)) {
    document.documentElement.setAttribute('data-theme', remembered);
  }
} catch {
  // Storage blocked or unavailable: the page starts light, and main.js puts the theme on.
}
