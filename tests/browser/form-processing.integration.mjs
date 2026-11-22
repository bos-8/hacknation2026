import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '../../.local/ui-check/node_modules/playwright/index.mjs');
const web = parseEnv(readFileSync('apps/web/.env', 'utf8'));
const dev = parseEnv(readFileSync('infra/local/.env.dev', 'utf8'));
const origin = new URL(web.AUTH_BASE_URL).origin;
const issuer = new URL(web.AUTH_ISSUER).origin;
assert.equal(dev.ENV_MODE, 'dev');
assert.equal(dev.STACK_NAME, 'formiqdev');
assert.equal(new URL(origin).hostname, 'localhost');
assert.equal(new URL(issuer).hostname, 'localhost');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(web.DATABASE_URL).hostname));

const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-proxy-server'],
});
const page = await browser.newPage({ ignoreHTTPSErrors: true });
page.setDefaultTimeout(30_000);
const fixtureIds = [];
const filenames = [];
const title = "Wniosek o wydanie odpisu dokumentu";
const headers = { origin };
try {
  await page.goto(origin + '/en');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#kc-login').waitFor();
  assert.equal(new URL(page.url()).origin, issuer);
  await page.locator('[name=username]').fill('user@formiq.test');
  await page.locator('[name=password]').fill(dev.DEV_SEED_USER_PASSWORD || 'user');
  await page.locator('#kc-login').click();
  await page.waitForURL(url => url.origin === origin && !url.pathname.startsWith('/api/'));
  for (let i = 0; i < 2; i++) {
    const name = "queue-"+randomUUID()+".txt";
    filenames.push(name);
    const upload = await page.request.post(origin + '/api/v1/forms', {
      headers: {...headers, 'content-type':'application/octet-stream','x-file-name':name,
        'x-file-modified':String(Date.now())}, data:Buffer.from('Wniosek\no\nwydanie odpisu dokumentu\n\nImię: Anna\nNazwisko: Nowak\nPawet Wiśniewski.......\n/ imię i nazwisko / Mtynary, ul..Testowa. 18..... / adres /\nNumer PESEL dziecka: 44051401459\nNumer telefonu: …\n'),
    });
    assert.equal(upload.status(),201);
    const {id} = await upload.json();
    fixtureIds.push(id);
  }
  const tickets = [];
  for (const id of fixtureIds) {
    const url = origin + '/api/v1/forms/' + id;
    assert.equal((await page.request.post(url+'/process',{headers})).status(),402);
    assert.equal((await page.request.patch(url,{headers,data:{paid:true}})).status(),200);
    if (id === fixtureIds[0]) {
      const operation = randomUUID();
      const enqueued = await page.request.post(url+'/process?operation='+operation,{headers});
      assert.equal(enqueued.status(),202);
      assert.equal((await enqueued.json()).operation,operation);
      tickets.push(url+'/process?operation='+operation);
    } else {
      await page.goto(origin+'/en/forms?search='+filenames[1]);
      const clicked = page.waitForResponse(r=>r.url().startsWith(url+'/process?') && r.request().method()==='POST');
      await page.getByRole('button',{name:'Send for processing',exact:true}).click();
      const response = await clicked;
      assert.equal(response.status(),202);
      tickets.push(url+'/process?operation='+(await response.json()).operation);
    }
  }
  for (const ticket of tickets) {
    await assert.doesNotReject(async () => {
      const end = Date.now() + 75_000;
      while (Date.now() < end) {
        const response = await page.request.get(ticket);
        const status = await response.json();
        assert.equal(response.status(),200,JSON.stringify(status));
        if (status.state === 'completed') {assert.equal(status.mode,'pipeline'); return;}
        assert.ok(['queued','processing'].includes(status.state));
        await new Promise(resolve => setTimeout(resolve,500));
      }
      throw new Error('Timed out waiting for form job');
    });
  }
  console.log('PASS payment check, enqueue two forms, persistent completion with linked results');
  const id = fixtureIds[0];
  await page.setViewportSize({width:1600,height:900});
  await page.goto(origin+'/en/forms/'+id);
  await page.getByRole('heading',{name:title,exact:true}).waitFor();
  const main = page.getByRole('main').filter({has:page.getByRole('heading',{name:title,exact:true})}).last();
  assert.ok((await main.boundingBox()).width >= 1550);
  await page.getByRole('button',{name:'Open form preview'}).click();
  const fullName = page.getByLabel('Imię i nazwisko',{exact:true});
  assert.equal(await fullName.inputValue(),'Pawet Wiśniewski');
  const first = page.getByLabel('Imię',{exact:true});
  assert.equal(await first.inputValue(),'Anna');
  assert.equal(await page.getByLabel('Nazwisko',{exact:true}).inputValue(),'Nowak');
  const pesel = page.getByLabel('Numer PESEL dziecka',{exact:true});
  assert.equal(await pesel.inputValue(),'44051401459');
  const invalidPesel = page.getByText(/^Invalid PESEL number/);
  await invalidPesel.waitFor();
  assert.equal(await pesel.getAttribute('aria-invalid'),'true');
  assert.match(await pesel.getAttribute('class'),/border-red-/);
  assert.equal(await page.getByRole('button',{name:'Save values'}).isDisabled(),true);
  await pesel.fill('44051401458');
  await invalidPesel.waitFor({state:'hidden'});
  assert.equal(await pesel.getAttribute('aria-invalid'),'false');
  const steps = page.getByRole('navigation').filter({has:page.getByRole('button',{name:'Kontakt i oświadczenia'})});
  const firstStep = await steps.locator('[aria-current="page"]').innerText();
  await steps.getByRole('button',{name:'Kontakt i oświadczenia'}).click();
  assert.equal(await page.getByLabel('Numer telefonu',{exact:true}).inputValue(),'');
  await steps.getByRole('button',{name:'Podsumowanie',exact:true}).click();
  await page.getByText('Sprawdź dane przed wysłaniem formularza.',{exact:true}).waitFor();
  await steps.getByRole('button',{name:firstStep,exact:true}).click();
  await first.fill('Maria');
  await page.getByRole('button',{name:'Show JSON'}).click();
  await page.getByRole('button',{name:'Open form preview'}).click();
  assert.equal(await first.inputValue(),'Maria');
  const saving = page.waitForResponse(r=>r.url().endsWith('/answers') && r.request().postDataJSON()?.save === true);
  await page.getByRole('button',{name:'Save values'}).click();
  assert.equal((await saving).status(),200);
  await page.reload();
  await page.getByRole('button',{name:'Open form preview'}).click();
  assert.equal(await first.inputValue(),'Maria');
  await page.getByRole('button',{name:'Show JSON'}).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link',{name:'Download JSON'}).click();
  const file = await downloaded;
  const json = JSON.parse(readFileSync(await file.path(),'utf8'));
  assert.equal(json.title,title);
  assert.ok(json.tabs.flatMap(t=>t.questions).flatMap(q=>q.field.repeatingSectionGrid)
    .some(q=>q.field.title === 'Imię' && q.field.defaultValue === 'Maria'));
  console.log('PASS full-width details, populated editor, unsaved toggle, validated save, reload and JSON download');
} finally {
  try {
    for (const id of fixtureIds) assert.equal((await page.request.delete(origin+'/api/v1/forms/'+id,{headers})).status(),200);
  } finally {
    await browser.close();
  }
}
