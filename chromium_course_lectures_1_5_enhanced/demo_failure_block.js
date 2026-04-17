
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();

  await page.goto('https://example.com');

  // Failure injection: block main thread
  await page.evaluate(() => {
    const start = Date.now();
    while (Date.now() - start < 5000) {}
  });

  console.log("Main thread blocked for 5s");

  await browser.close();
})();
