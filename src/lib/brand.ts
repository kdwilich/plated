/** The app's name, in one place.
 *
 *  Every `<title>`, the sign-in wordmark and the export filename read from
 *  here, so renaming the app is one edit rather than sixteen. The four things
 *  it cannot reach are static files that no bundler touches — package.json,
 *  wrangler.toml, static/manifest.webmanifest and src/app.html — and they are
 *  listed in docs/renaming-the-app.md.
 */
export const APP_NAME = 'Plated';

/** Uppercase for the wordmark. Kept here rather than as a CSS
 *  `text-transform` so the rendered text is the real string — screen readers
 *  and the page source both say the name, not a styled lowercase one. */
export const APP_WORDMARK = APP_NAME.toUpperCase();

/** Lowercase, safe in a filename or a storage key. */
export const APP_SLUG = APP_NAME.toLowerCase();
