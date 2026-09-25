// Every launch now opens on the language gate, and the app waits there until
// a language is chosen. Suites that test something else choose Arabic up front
// through the boot guard's test hook, so they start where they always did.
//
//   const browser = await chromium.launch();
//   autoChooseLanguage(browser);                  // every context: Arabic
//   await browser.newContext({ languageGate: 'show' })   // this one: the real gate
//
// The hook is a window property set by a Playwright init script; nothing in the
// product sets it.

// The suites written before the 1.0.0 release exercise the whole product —
// accounts, plans, the assistant, teams — so they run with every feature
// switched on. A context created with `{ release: true }` gets the shipped
// nazm.config.js untouched instead: that is what tests/browser/release.test.mjs
// checks.
const FULL_PRODUCT = `
window.NAZM_CONFIG.features = { cloud: true, team: true, billing: true, cloudAi: true };
window.NAZM_CONFIG.auth = { providers: { email: true, apple: true, google: true } };
`;

export async function useFullProduct(context) {
  await context.route('**/nazm.config.js', async (route) => {
    const response = await route.fetch();
    const body = `${await response.text()}\n${FULL_PRODUCT}`;
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
}

export function autoChooseLanguage(browser, lang = 'ar') {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options = {}) => {
    const { languageGate, release, ...rest } = options;
    const context = await newContext(rest);
    if (!release) await useFullProduct(context);
    if (languageGate !== 'show') {
      await context.addInitScript((value) => { window.__NAZM_TEST_LANGUAGE__ = value; }, lang);
    }
    return context;
  };
  // browser.newPage() makes a context of its own; route it through the one
  // above, and close that context with the page as Playwright would.
  browser.newPage = async (options = {}) => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const close = page.close.bind(page);
    page.close = async (closeOptions) => { await close(closeOptions); await context.close(); };
    return page;
  };
  return browser;
}
