import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testDocumentReview({ page, app, db, sharp, suffix }) {
  const name = `ocr-${suffix}.png`;
  const bytes = await sharp(
    Buffer.from(
      '<svg width="900" height="180"><rect width="100%" height="100%" fill="white"/><text x="45" y="100" font-family="Arial" font-size="56">Jan Kowalski</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  const mainNav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  const olderName = `older-${suffix}.PNG`;
  const jpgName = `other-${suffix}.jpg`;
  for (const [fixture, data] of [
    [olderName, bytes],
    [jpgName, await sharp(bytes).jpeg().toBuffer()],
    [`unsupported-${suffix}.txt`, Buffer.from("OCR catalog fixture")],
  ]) {
    const response = await page.request.post(app + "/api/v1/admin/files/upload", {
      headers: { origin: app, "content-type": "application/octet-stream", "x-file-name": fixture },
      data,
    });
    assert.equal(response.status(), 200);
  }
  await mainNav.getByRole("link", { name: "OCR", exact: true }).click();
  await page.waitForURL(url => url.pathname.endsWith("/admin/files/ocr") && !url.search);
  await mainNav.locator('[aria-current="page"]').filter({ hasText: /^OCR$/ }).waitFor();
  await page.getByRole("button", { name: "Add file", exact: true }).click();
  await page.locator('input[type="file"]:enabled').setInputFiles({ name, mimeType: "image/png", buffer: bytes });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const currentRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name, exact: true }) });
  await currentRow.waitFor();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search the catalog by name" });
  await search.fill(suffix);
  await search.press("Enter");
  const jpg = page.getByRole("cell", { name: jpgName, exact: true });
  await jpg.waitFor();
  async function applyExtension(...extensions) {
    await page.locator("[data-table-filter]").click();
    const filters = page.locator("form[data-table-query]").filter({ has: page.locator("select") });
    await filters.locator("select:not([name])").selectOption("extension");
    for (const label of ["PDF", "JPG", "JPEG", "PNG"]) {
      await filters.getByRole("checkbox", { name: label, exact: true }).setChecked(extensions.includes("." + label.toLowerCase()));
    }
    await filters.locator("button[type=submit]").click();
    await page.waitForURL(url => url.searchParams.get("extension") === (extensions.join(",") || null) && url.searchParams.get("search") === suffix);
  }
  await applyExtension(".jpg");
  await currentRow.waitFor({ state: "detached" });
  await jpg.waitFor();
  await applyExtension(".jpg", ".png");
  await currentRow.waitFor();
  await jpg.waitFor();
  await page.reload();
  await currentRow.waitFor();
  await jpg.waitFor();
  assert.deepEqual(await page.locator('table tbody:not([hidden]) tr').count(), 3);
  await applyExtension();
  await currentRow.waitFor();
  await applyExtension(".png");
  await jpg.waitFor({ state: "detached" });
  const pager = page.getByRole("navigation", { name: "File list pages" });
  await pager.locator('summary').click();
  await pager.getByRole("button", { name: "1", exact: true }).click();
  await pager.getByRole("link", { name: "Next", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("extension"), ".png");
  await page.reload();
  await page.getByRole("cell", { name: olderName, exact: true }).waitFor();
  await pager.getByRole("button", { name: "Next", exact: true, disabled: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/en/admin/files/ocr");
  await pager.getByRole("link", { name: "Previous page", exact: true }).click();
  await currentRow.getByText("OCR not started", { exact: true }).waitFor();
  const inactive = currentRow.getByRole("button", { name: name + " — set status: Inactive" });
  await inactive.click();
  await currentRow.getByRole("cell", { name: "Inactive", exact: true }).waitFor();
  await currentRow.getByRole("button", { name: name + " — set status: Active" }).click();
  await currentRow.getByRole("cell", { name: "Active", exact: true }).waitFor();
  await currentRow.getByRole("button", { name: name + " — permanently delete all versions" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await currentRow.getByRole("button", { name: "Replace file " + name }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await currentRow.getByRole("button", { name: "Additional information — " + name }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await page.keyboard.press("Escape");
  const openFile = currentRow.getByRole("link", { name: "Open file", exact: true });
  assert.equal(await openFile.textContent(), "");
  await openFile.locator('svg[aria-hidden="true"]').waitFor();
  await openFile.hover();
  await page.getByRole("tooltip", { name: "Open file", exact: true }).waitFor();
  await openFile.click();
  const source = await db.file.findFirstOrThrow({
    where: { name },
    select: { uuid: true },
  });
  await page.waitForURL(url => url.pathname.endsWith("/ocr/" + source.uuid) && url.searchParams.get("version") === "1");
  const comparisonUrl = page.url();
  await page.locator("nav li [aria-current='page']").filter({ hasText: /^File$/ }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-compare-pane="source"] img')?.naturalWidth > 0);
  await page.goto(app + "/en/admin/files/ocr?file=" + source.uuid + "&version=1");
  await page.waitForURL(url => url.pathname.endsWith("/ocr/" + source.uuid) && url.searchParams.get("version") === "1");
  console.log("PASS main OCR tab, upload, search with extension filter, reset, filtered pagination, details aside and OCR row action");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const visible = (name) => page.locator("article").first().getByText(name, { exact: true }).first().waitFor({ timeout: 90000 });
  await page.locator("nav li [aria-current='page']").filter({ hasText: /^File$/ }).waitFor();
  await page.getByRole("heading", { level: 1, name: "OCR", exact: true }).waitFor();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-compare-pane="source"] img')?.naturalWidth > 0);
  const pdfControls = page.getByRole("region", { name: "PDF export" });
  for (const variant of ["PDF with original data", "PDF with black masks", "PDF with labels"]) {
    assert.ok(await pdfControls.getByRole("button", { name: variant, exact: true }).isDisabled());
  }
  const catalog = await page.context().newPage();
  await catalog.goto(app + "/en/admin/files/ocr?search=" + name);
  const processing = catalog.getByRole("row").filter({ has: catalog.getByRole("cell", { name, exact: true }) });
  await processing.getByText("OCR not started").waitFor();
  await page.bringToFront();
  await button("Start analysis").click();
  const strip = page.locator("[data-notification-strip]").filter({ hasText: name });
  await strip.getByRole("progressbar", { name: "Reading document" }).waitFor();
  const bell = page.locator("[data-notification-trigger] button");
  await bell.click();
  const row = page.locator("[data-notification-panel] [data-notification-id]").filter({ hasText: name });
  await row.getByRole("progressbar", { name: "Reading document" }).waitFor();
  await row.getByText(/^(Elapsed|Queued for) /).waitFor();
  await row.getByText(/^(About |Estimating time remaining|Estimate available)/).waitFor();
  await page.keyboard.press("Escape");
  const reviewUrl = page.url();
  await mainNav.getByRole("link", { name: "OCR", exact: true }).click();
  await page.waitForURL(url => url.pathname.endsWith("/admin/files/ocr") && !url.search);
  await page.locator("[data-notification-strip]").filter({ hasText: name })
    .getByText("Review text and word positions", { exact: true }).waitFor({ timeout: 90000 });
  await page.goto(reviewUrl);
  await catalog.bringToFront();
  await processing.getByText("OCR complete", { exact: true }).waitFor({ timeout: 45000 });
  assert.equal((await db.documentAnalysis.findFirstOrThrow({ where: { source: { fileUuid: source.uuid }, mode: "manual" } })).ocrProgress, 100);
  assert.ok((await db.documentAnalysis.findFirstOrThrow({ where: { source: { fileUuid: source.uuid }, mode: "manual" } })).ocrMs > 0);
  await catalog.close();
  await page.bringToFront();
  console.log("PASS OCR catalog updates from persisted per-revision progress");
  console.log("PASS OCR progress in the breadcrumb strip and notification panel, with completion after leaving the editor");
  await visible("Review text and word positions");
  await button("Run OCR again on this page").click();
  await visible("Reading document");
  await visible("Review text and word positions");
  const firstWord = tab => tab.locator('[data-compare-pane="ocr"] [data-word="0"]');
  const input = tab => tab.getByRole("textbox", { name: "Text", exact: true });
  assert.equal(await firstWord(page).textContent(), "Jan");
  await page.setViewportSize({ width: 390, height: 844 });
  await firstWord(page).click();
  await button("Edit selected word").click();
  await input(page).fill("Draft");
  await input(page).press("Enter");
  await button("Discard edits").click();
  assert.equal(await firstWord(page).textContent(), "Jan");
  assert.ok(await page.locator("article").first().evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const stale = await page.context().newPage();
  await stale.goto(page.url());
  await firstWord(stale).dblclick();
  await input(stale).fill("Stale");
  await firstWord(page).dblclick();
  await input(page).fill("Adam");
  await input(page).press("Enter");
  await button("Save corrections").click();
  await button("Save corrections").and(page.locator(":disabled")).waitFor();
  await page.reload();
  await stale.getByRole("button", { name: "Save corrections", exact: true }).click();
  await stale.getByRole("alert").filter({ hasText: "revision changed" }).waitFor();
  await stale.close();
  await firstWord(page).getByText("Adam", { exact: true }).waitFor();
  const preview = page.locator('[data-compare-pane="source"] img');
  const previewUrl = await preview.getAttribute("src");
  assert.equal((await page.request.get(app + previewUrl)).status(), 200);
  const beforeDetection = app + previewUrl + "&variant=black";
  assert.equal((await page.request.get(beforeDetection)).status(), 404);
  const anonymous = await page.context().browser().newContext({ ignoreHTTPSErrors: true });
  try {
    assert.equal((await anonymous.request.get(app + previewUrl)).status(), 403);
    assert.equal((await anonymous.request.get(beforeDetection)).status(), 403);
  } finally {
    await anonymous.close();
  }
  await button("Approve OCR and start redaction").click();
  await visible("Review masks on every page");
  await button("Approve redaction for all pages").click();
  await visible("Redaction approved");
  const manual = await db.documentAnalysis.findFirstOrThrow({
    where: { mode: "manual", source: { fileUuid: source.uuid } },
    select: { detector: true, originalPages: true, approvals: { select: { stage: true, pages: true } } },
  });
  assert.deepEqual(manual.approvals.map((a) => a.stage).sort(), ["ocr_review", "review"]);
  assert.equal(manual.originalPages[0].words[0].text, "Jan");
  const approved = manual.approvals.find((a) => a.stage === "review");
  assert.deepEqual(approved.pages[0].words.map((w) => [w.text, w.label]), [
    ["Adam", "IMIĘ"], ["Kowalski", "NAZWISKO"],
  ]);
  assert.ok(["pii-tracer+pl", "pl-rules"].includes(manual.detector));
  console.log("PASS immutable OCR and redaction approvals; detector:", manual.detector);
  const viewer = await page.context().newPage();
  try {
    await viewer.goto(comparisonUrl);
    const pane = id => viewer.locator(`[data-compare-pane="${id}"]`);
    const words = pane("ocr").locator("[data-word]");
    await words.first().waitFor();
    assert.deepEqual(await words.allTextContents(), ["Adam", "Kowalski"]);
    const first = await words.nth(0).boundingBox(), last = await words.nth(1).boundingBox();
    await viewer.mouse.move(first.x + 1, first.y + first.height/2);
    await viewer.mouse.down();
    await viewer.mouse.move(last.x + last.width - 1, last.y + last.height/2, { steps: 8 });
    await viewer.mouse.up();
    for (const id of ["ocr", "source", "redacted"])
      await pane(id).locator('[data-word="1"][data-selected]').waitFor();
    const style = viewer.getByRole("combobox", { name: "Mask style" });
    const preview = pane("redacted").getByRole("img");
    const black = await viewer.request.get(app + await preview.getAttribute("src"));
    assert.equal(black.status(), 200);
    await style.selectOption("labels");
    const labels = await viewer.request.get(app + await preview.getAttribute("src"));
    assert.equal(labels.status(), 200);
    const box = approved.pages[0].words[0].box;
    async function patch(bytes) {
      const image = sharp(bytes);
      const meta = await image.metadata();
      const sx = meta.width / approved.pages[0].width, sy = meta.height / approved.pages[0].height;
      const region = { left: Math.ceil(box[0]*sx), top: Math.ceil(box[1]*sy),
        width: Math.floor((box[2]-box[0])*sx)-1, height: Math.floor((box[3]-box[1])*sy)-1 };
      return image.extract(region).greyscale().raw().toBuffer();
    }
    assert.ok((await patch(await black.body())).every(v => v === 0));
    assert.ok((await patch(await labels.body())).some(v => v > 100));
    const columns = viewer.getByRole("group", { name: "Visible columns" });
    await columns.getByRole("button", { name: "OCR text" }).click();
    assert.equal(await pane("ocr").count(), 0);
    await columns.getByRole("button", { name: "OCR text" }).click();
    await pane("ocr").locator('[data-word="1"][data-selected]').waitFor();
    for (const origin of ["source", "redacted"]) {
      const rect = await pane(origin).getByRole("img").boundingBox();
      const coordinates = approved.pages[0].words.map(({ box: [x, y, r, b] }) => [
        rect.x + (x+r)/2 * rect.width / approved.pages[0].width,
        rect.y + (y+b)/2 * rect.height / approved.pages[0].height,
      ]);
      await viewer.mouse.click(...coordinates[1]);
      await pane("ocr").locator('[data-word="0"][data-selected]').waitFor({ state: "detached" });
      await viewer.mouse.move(...coordinates[1]);
      await viewer.mouse.down();
      await viewer.mouse.move(...coordinates[0], { steps: 6 });
      await viewer.mouse.up();
      for (const id of ["ocr", "source", "redacted"]) await pane(id).locator('[data-word="0"][data-selected]').waitFor();
    }
    await viewer.setViewportSize({ width: 390, height: 844 });
    const sourceRect = await pane("source").boundingBox(), ocrRect = await pane("ocr").boundingBox();
    assert.ok(ocrRect.y >= sourceRect.y + sourceRect.height - 1);
    assert.ok(ocrRect.x >= 0 && ocrRect.x + ocrRect.width <= 391);
    const transcript = pane("ocr").locator("[tabindex]");
    await transcript.focus();
    await viewer.keyboard.press("Home");
    await viewer.keyboard.press("Shift+ArrowRight");
    for (const id of ["source", "ocr", "redacted"]) {
      assert.equal(await pane(id).locator("[data-word][data-selected]").count(), 2);
    }
    console.log("PASS icon actions and tooltips, mobile editor, keyboard and mouse selection, responsive comparison and PDF masks");
  } finally { await viewer.close(); }
  for (const variant of ["PDF with original data", "PDF with black masks", "PDF with labels"]) {
    await button(variant).click();
    const download = page.getByRole("link", {
      name: "Download · " + variant,
      exact: true,
    });
    await download.waitFor({ timeout: 90000 });
    const response = await page.request.get(app + (await download.getAttribute("href")));
    assert.equal(response.status(), 200);
    assert.equal((await response.body()).subarray(0, 5).toString(), "%PDF-");
  }
  const exports = await db.documentExport.findMany({ where: { analysis: { source: { fileUuid: source.uuid } }, stage: "ready" } });
  assert.equal(exports.length, 3);
  assert.ok(exports.every(job => job.progress === 100 && job.durationMs > 0));
  await page.getByLabel("Mode", { exact: true }).selectOption("auto");
  await button("Start analysis").click();
  await visible("Review masks on every page");
  const auto = await db.documentAnalysis.findFirstOrThrow({
    where: { mode: "auto", source: { fileUuid: source.uuid } },
    select: { uuid: true, revision: true },
  });
  // Reproduce an already dispatched ticket missing from pg-boss after an outage.
  await db.documentAnalysis.update({
    where: { uuid: auto.uuid, revision: auto.revision },
    data: { stage: "detect", dispatched: true, ticket: randomUUID(), revision: { increment: 1 } },
  });
  let interruptedRead = false;
  await page.route("**/admin/files/ocr/**", async (route) => {
    const request = route.request();
    if (!interruptedRead && request.method() === "POST" &&
        request.postData() === JSON.stringify([source.uuid, 1, "auto"])) {
      interruptedRead = true;
      await route.fulfill({ status: 504, body: "Gateway Timeout" });
    } else {
      await route.continue();
    }
  });
  await page.reload();
  await page.getByLabel("Mode", { exact: true }).selectOption("auto");
  await visible("Detection failed");
  assert.ok(interruptedRead, "The first automatic status read must receive the simulated 504");
  await button("Retry").click();
  await visible("Review masks on every page");
  console.log(
    "PASS file upload, manual OCR correction/reload, preview, detection, approval, three downloadable PDFs, automatic mode and missing ticket recovery",
  );
}

export async function testDocumentComparisonPdf({ page, app, db, suffix }) {
  const pdfPage = await page.context().newPage();
  try {
    await pdfPage.setContent('<p style="break-after:page">First page</p><p>Second page</p><p style="margin-left:220px;margin-top:120px">Indented</p>');
    const pdf = await pdfPage.pdf();
    const pdfName = `pages-${suffix}.pdf`;
    const response = await page.request.post(app + "/api/v1/admin/files/upload", {
      headers: { origin: app, "content-type": "application/octet-stream", "x-file-name": pdfName }, data: pdf,
    });
    assert.equal(response.status(), 200);
    const { uuid } = await db.file.findFirstOrThrow({ where: { name: pdfName }, select: { uuid: true } });
    const url = app + "/en/admin/files/ocr/" + uuid + "?version=1";
    await pdfPage.goto(url);
    const frame = pdfPage.locator('[data-compare-pane="source"] iframe');
    const original = await pdfPage.request.get(app + await frame.getAttribute("src"));
    assert.equal(original.headers()["content-type"], "application/pdf");
    assert.match(original.headers()["content-disposition"], /^inline/);
    assert.deepEqual(await original.body(), pdf);
    await pdfPage.getByRole("button", { name: "Start analysis" }).click();
    await pdfPage.getByRole("status").filter({ hasText: /^Review text and word positions$/ }).waitFor({ timeout: 90000 });
    const result = await db.documentAnalysis.findFirstOrThrow({ where: { source: { fileUuid: uuid } }, select: { pages: true, ocrProgress: true } });
    assert.equal(result.ocrProgress, 100);
    assert.deepEqual(result.pages.map(p => p.words.map(w => w.text)), [["First", "page"], ["Second", "page", "Indented"]]);
    await pdfPage.goto(url);
    await pdfPage.getByRole("combobox", { name: "Page", exact: true }).selectOption("1");
    const ocrPane = pdfPage.locator('[data-compare-pane="ocr"]');
    const upper = await ocrPane.getByText("Second", { exact: true }).boundingBox();
    const lower = await ocrPane.getByText("Indented", { exact: true }).boundingBox();
    assert.ok(lower.x > upper.x + upper.width && lower.y > upper.y + upper.height);
    await ocrPane.getByText("Indented", { exact: true }).dblclick();
    const inline = pdfPage.getByRole("textbox", { name: "Text", exact: true });
    await inline.fill("Corrected");
    await inline.press("Enter");
    await pdfPage.getByRole("button", { name: "Save corrections", exact: true }).click();
    await ocrPane.getByText("Corrected", { exact: true }).waitFor();
    await pdfPage.reload();
    await pdfPage.getByRole("combobox", { name: "Page", exact: true }).selectOption("1");
    await ocrPane.getByText("Corrected", { exact: true }).waitFor();
    await pdfPage.locator('[data-compare-pane="ocr"]').getByText("Second", { exact: true }).click();
    await pdfPage.locator('[data-compare-pane="source"] [data-word="0"][data-selected]').waitFor();
    assert.match(await pdfPage.locator('[data-compare-pane="source"] img').getAttribute("src"), /\/1\?revision=/);
    await pdfPage.getByRole("button", { name: "Approve OCR and start redaction" }).click();
    await pdfPage.getByRole("button", { name: "Approve redaction for all pages" }).click({ timeout: 90000 });
    await pdfPage.getByRole("status").filter({ hasText: /^Redaction approved$/ }).waitFor();
    await ocrPane.getByText("Corrected", { exact: true }).dblclick();
    await inline.fill("Rechecked");
    await inline.press("Enter");
    await pdfPage.getByText("Saving corrected OCR reopens text review.", { exact: false }).waitFor();
    await pdfPage.getByRole("button", { name: "Save corrections" }).click();
    await pdfPage.getByRole("status").filter({ hasText: /^Review text and word positions$/ }).waitFor();
    const reopened = await db.documentAnalysis.findFirstOrThrow({ where: { source: { fileUuid: uuid } },
      select: { pages: true, approvals: { where: { stage: "review" }, select: { pages: true } } } });
    assert.equal(reopened.pages[1].words.at(-1).text, "Rechecked");
    assert.equal(reopened.approvals[0].pages[1].words.at(-1).text, "Corrected");
    assert.ok(reopened.pages.every(page => page.words.every(word => word.label === "")));
    assert.ok(await pdfPage.getByRole("button", { name: "PDF with black masks" }).isDisabled());
    console.log("PASS original PDF, second-page word layout, inline correction, reload and synchronized selection");
  } finally { await pdfPage.close(); }
}
