import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { SignJWT } from "jose";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.UI_AUDIT_BASE_URL ?? "http://127.0.0.1:33200";
const stage = process.env.UI_AUDIT_STAGE ?? "after";
const appId = process.env.APP_ID ?? "coachora-ui-audit";
const jwtSecret = process.env.JWT_SECRET ?? "coachora-ui-audit-only-7Qx9!kV2#mR8@tN4";
const outputDirectory = path.resolve("docs/ui-audit-evidence", stage);
const widths = [320, 360, 390, 430, 768];
const defaultHeight = 844;

const accounts = {
  client: { openId: "ui-client", name: "Cam Client" },
  coach: { openId: "ui-coach", name: "Chloe Coach" },
  admin: { openId: "ui-admin", name: "Avery Admin" },
};

const screens = {
  signedOut: [{ name: "sign-in", route: "/" }],
  client: [
    { name: "home", route: "/" },
    { name: "book", route: "/book" },
    { name: "schedule", route: "/schedule" },
    { name: "history", route: "/history" },
    { name: "health-progress", route: "/progress" },
    { name: "profile", route: "/profile" },
    { name: "notifications", route: "/notifications" },
  ],
  coach: [
    { name: "today", route: "/" },
    { name: "schedule", route: "/schedule" },
    { name: "clients", route: "/progress" },
    { name: "availability", route: "/availability" },
    { name: "profile", route: "/profile" },
  ],
  admin: [
    { name: "overview", route: "/" },
    { name: "rooms", route: "/rooms" },
    { name: "coaches", route: "/admin" },
    { name: "reports", route: "/reports" },
    { name: "availability-oversight", route: "/availability" },
    { name: "booking-calendar", route: "/book" },
  ],
};

async function sessionToken(account) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ openId: account.openId, appId, name: account.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setIssuer(`coachora:${appId}`)
    .setAudience(appId)
    .setExpirationTime(now + 60 * 60)
    .sign(new TextEncoder().encode(jwtSecret));
}

function slug(value) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0);
    const interactiveSelector = "button, a, input, select, textarea, [role='button'], [role='tab']";
    const describe = (element) => {
      const text = (element.getAttribute("aria-label") || element.textContent || element.getAttribute("placeholder") || element.tagName).replace(/\s+/g, " ").trim();
      return text.slice(0, 100);
    };
    const touchTargets = [...document.querySelectorAll(interactiveSelector)].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") return [];
      if (rect.width >= 43.5 && rect.height >= 43.5) return [];
      return [{ label: describe(element), width: Math.round(rect.width), height: Math.round(rect.height) }];
    });
    const overflowingElements = [...document.querySelectorAll("body *")].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.position === "fixed" || style.position === "absolute") return [];
      if (rect.width === 0 || rect.height === 0) return [];
      if (rect.left >= -1 && rect.right <= viewportWidth + 1) return [];
      return [{ label: describe(element), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }];
    }).slice(0, 25);
    const unlabeledControls = [...document.querySelectorAll(interactiveSelector)].flatMap((element) => {
      const text = (element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.textContent || element.getAttribute("placeholder") || "").trim();
      return text ? [] : [{ tag: element.tagName.toLowerCase(), role: element.getAttribute("role") }];
    });
    return {
      title: document.title,
      viewportWidth,
      viewportHeight,
      documentWidth,
      horizontalOverflow: documentWidth > viewportWidth + 1,
      touchTargets,
      overflowingElements,
      unlabeledControls,
    };
  });
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch();
const report = {
  generatedAt: new Date().toISOString(),
  stage,
  baseUrl,
  browser: await browser.version(),
  widths,
  results: [],
};

try {
  for (const [role, roleScreens] of Object.entries(screens)) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: defaultHeight },
        colorScheme: "dark",
        reducedMotion: "reduce",
        locale: "en-US",
      });
      if (role !== "signedOut") {
        await context.addCookies([{ name: "app_session_id", value: await sessionToken(accounts[role]), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
      }
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} · ${request.failure()?.errorText ?? "failed"}`));
      page.on("response", (response) => {
        if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      });

      for (const screen of roleScreens) {
        await page.goto(`${baseUrl}${screen.route}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(250);
        const inspection = await inspectPage(page);
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const key = `${role}-${screen.name}-${width}`;
        if (width === 390 || (role === "signedOut" && screen.name === "sign-in")) {
          await page.screenshot({ path: path.join(outputDirectory, `${slug(key)}.png`), fullPage: true });
        }
        report.results.push({
          role,
          screen: screen.name,
          route: screen.route,
          width,
          ...inspection,
          axeViolations: axe.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.length,
            targets: violation.nodes.map((node) => ({
              target: node.target,
              failureSummary: node.failureSummary,
            })),
          })),
          consoleErrors: [...new Set(consoleErrors)],
          pageErrors: [...new Set(pageErrors)],
          failedRequests: [...new Set(failedRequests)],
        });
        consoleErrors.length = 0;
        pageErrors.length = 0;
        failedRequests.length = 0;
      }
      await context.close();
    }
  }

  const landscapeContext = await browser.newContext({ viewport: { width: 844, height: 390 }, colorScheme: "dark", reducedMotion: "reduce" });
  await landscapeContext.addCookies([{ name: "app_session_id", value: await sessionToken(accounts.client), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  const landscapePage = await landscapeContext.newPage();
  await landscapePage.goto(`${baseUrl}/book`, { waitUntil: "networkidle" });
  report.landscape = await inspectPage(landscapePage);
  await landscapePage.screenshot({ path: path.join(outputDirectory, "client-book-landscape-844x390.png"), fullPage: true });
  await landscapeContext.close();

  if (stage === "after") {
    report.stateChecks = {};
    const slowContext = await browser.newContext({ viewport: { width: 390, height: defaultHeight }, colorScheme: "dark", reducedMotion: "reduce" });
    await slowContext.addCookies([{ name: "app_session_id", value: await sessionToken(accounts.coach), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
    const slowPage = await slowContext.newPage();
    await slowPage.route("**/api/trpc/coach.clients*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.continue();
    });
    await slowPage.goto(`${baseUrl}/progress`, { waitUntil: "domcontentloaded" });
    const loadingVisible = await slowPage.getByText(/Loading Clients/i).waitFor({ timeout: 2_000 }).then(() => true).catch(() => false);
    await slowPage.screenshot({ path: path.join(outputDirectory, "coach-clients-slow-network-390.png"), fullPage: true });
    await slowPage.getByText("Cam Client", { exact: true }).waitFor({ timeout: 10_000 });
    report.stateChecks.slowNetwork = { loadingVisible, recovered: true };
    await slowContext.close();

    const interruptedContext = await browser.newContext({ viewport: { width: 390, height: defaultHeight }, colorScheme: "dark", reducedMotion: "reduce" });
    await interruptedContext.addCookies([{ name: "app_session_id", value: await sessionToken(accounts.coach), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
    const interruptedPage = await interruptedContext.newPage();
    await interruptedPage.route("**/api/trpc/coach.clients*", (route) => route.abort("internetdisconnected"));
    await interruptedPage.goto(`${baseUrl}/progress`, { waitUntil: "domcontentloaded" });
    await interruptedPage.getByText("Clients unavailable", { exact: true }).waitFor({ timeout: 12_000 });
    await interruptedPage.screenshot({ path: path.join(outputDirectory, "coach-clients-interrupted-request-390.png"), fullPage: true });
    await interruptedPage.unroute("**/api/trpc/coach.clients*");
    await interruptedPage.getByRole("button", { name: "Try again" }).click();
    await interruptedPage.getByText("Cam Client", { exact: true }).waitFor({ timeout: 10_000 });
    report.stateChecks.interruptedRequest = { errorVisible: true, retryRecovered: true };
    await interruptedContext.close();

    const offlineContext = await browser.newContext({ viewport: { width: 390, height: defaultHeight }, colorScheme: "dark", reducedMotion: "reduce" });
    await offlineContext.addCookies([{ name: "app_session_id", value: await sessionToken(accounts.client), url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
    const offlinePage = await offlineContext.newPage();
    await offlinePage.goto(baseUrl, { waitUntil: "networkidle" });
    await offlineContext.setOffline(true);
    await offlinePage.evaluate(() => window.dispatchEvent(new Event("offline")));
    await offlinePage.waitForTimeout(250);
    const offlineCopyVisible = await offlinePage.getByText(/offline/i).first().isVisible().catch(() => false);
    await offlinePage.screenshot({ path: path.join(outputDirectory, "client-home-offline-390.png"), fullPage: true });
    report.stateChecks.offline = { offlineCopyVisible, renderedFromLoadedApp: true };
    await offlineContext.setOffline(false);
    await offlineContext.close();
  }
} finally {
  await browser.close();
}

const summary = {
  pages: report.results.length,
  overflowPages: report.results.filter((result) => result.horizontalOverflow).length,
  pagesWithSmallTargets: report.results.filter((result) => result.touchTargets.length).length,
  smallTargetInstances: report.results.reduce((total, result) => total + result.touchTargets.length, 0),
  pagesWithAxeViolations: report.results.filter((result) => result.axeViolations.length).length,
  axeViolationInstances: report.results.reduce((total, result) => total + result.axeViolations.length, 0),
  consoleErrorPages: report.results.filter((result) => result.consoleErrors.length || result.pageErrors.length).length,
  failedNetworkPages: report.results.filter((result) => result.failedRequests.length).length,
};
report.summary = summary;
await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
