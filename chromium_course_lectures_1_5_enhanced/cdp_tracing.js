
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const client = await page.target().createCDPSession();

  await client.send('Tracing.start', {
    categories: ['devtools.timeline'],
    options: 'sampling-frequency=10000'
  });

  await page.goto('https://example.com');

  await client.send('Tracing.end');

  client.on('Tracing.tracingComplete', async () => {
    console.log('Tracing done');
    await browser.close();
  });
})();
