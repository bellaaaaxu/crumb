/* The shop's colours from the first paint. index.html runs this small classic script in its
 * <head>, before the stylesheet and with no defer or async, so the browser runs it before it
 * paints anything. It puts on <html> the shop this browser remembers (crumb_demo_theme, which
 * assets/app.js writes when a shop is chosen), so a page opened on the café is dark from the
 * start instead of flashing light. It knows no list of shops: app.js puts the shop it shows on
 * <html> as soon as it runs (renderTheme), and an id the stylesheet has no colours for is
 * simply light until then. */
(function () {
  'use strict';
  try {
    var remembered = window.localStorage.getItem('crumb_demo_theme');
    // The shape of a theme id: 2 to 32 lowercase letters and digits, starting with a letter.
    if (typeof remembered === 'string' && /^[a-z][a-z0-9]{1,31}$/.test(remembered)) {
      document.documentElement.setAttribute('data-theme', remembered);
    }
  } catch (err) {
    /* Storage blocked or unavailable: the page starts light, and app.js puts the shop on. */
  }
})();
