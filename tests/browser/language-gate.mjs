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

export function autoChooseLanguage(browser, lang = 'ar') {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options = {}) => {
    const { languageGate, ...rest } = options;
    const context = await newContext(rest);
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
