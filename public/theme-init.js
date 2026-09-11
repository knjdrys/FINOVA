/* PALDO theme init — runs before first paint to avoid a light flash.
 * External file (not inline) so the production Content-Security-Policy
 * `script-src 'self'` allows it. No dependencies, no DOM writes beyond the
 * root class toggle. */
(function () {
  try {
    var m = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (m && m.matches) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
