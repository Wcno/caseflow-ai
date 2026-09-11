import { expect, test } from "@playwright/test";

function syntheticWav() {
  const sampleRate = 8_000;
  const samples = sampleRate / 4;
  const dataSize = samples * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(dataSize, 40);
  return wav;
}

test.beforeEach(async ({ request }) => {
  await request.post("/api/demo/reset");
});

test("las seis áreas principales navegan como vistas independientes en móvil y escritorio", async ({ page }) => {
  for (const viewport of [{ width: 1180, height: 840 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    for (const name of ["Inicio", "Nuevo reclamo", "Expedientes", "Procedimientos", "Seguimiento", "Privacidad"]) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth)).toBe(true);
  }
  await page.getByRole("link", { name: "Privacidad", exact: true }).click();
  await expect(page.getByRole("heading", { name: "La inferencia no sale del equipo" })).toBeVisible();
  await page.getByRole("link", { name: "Procedimientos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Biblioteca de procedimientos" })).toBeVisible();
  await expect(page.getByText("Retiro debitado sin entrega de efectivo")).toBeVisible();
  await page.getByRole("button", { name: "Probar caso sintético" }).first().click();
  await expect(page.getByLabel("Texto del reclamo")).toHaveValue(/Mi cuenta fue debitada/);
});

test("recepción, preparación, confirmación y asignación forman un solo recorrido", async ({ page }) => {
  await page.goto("/#new");
  await page.getByLabel("Nombre completo").fill("Zulema Recorrido");
  await page.getByLabel("Cédula").fill("8-000-0123");
  await page.getByLabel("Número de cliente").fill("CLI-10023");
  await page.getByRole("button", { name: "Cargar caso estrella de cajero" }).click();
  await page.getByRole("button", { name: "Registrar y preparar" }).click();
  await expect(page.getByText(/CF-\d{4}-\d{6}/)).toBeVisible();
  await expect(page.getByText("Retiro debitado sin entrega de efectivo").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirmar expediente revisado" }).click();
  await expect(page.getByText("Pendiente de asignación")).toBeVisible();
  await page.getByRole("link", { name: "Expedientes", exact: true }).click();
  await page.getByPlaceholder("Buscar por seguimiento o cliente").fill("Zulema Recorrido");
  await page.getByRole("button", { name: /Abrir CF-/ }).click();
  await page.getByLabel("Especialista").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Asignar expediente" }).click();
  await expect(page.getByText("Asignado").first()).toBeVisible();
});

test("el audio cargado muestra un estado evidente y luego su transcripción local", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/#new");
  await page.getByLabel("Nombre completo").fill("Cliente Audio");
  await page.getByLabel("Cédula").fill("8-000-0456");
  await page.getByLabel("Número de cliente").fill("CLI-10456");
  await page.getByLabel("Cargar audio").setInputFiles({
    name: "reclamo.wav",
    mimeType: "audio/wav",
    buffer: syntheticWav()
  });

  await expect(page.getByRole("status")).toContainText("Audio listo para transcribir");
  await expect(page.getByRole("status")).toContainText("reclamo.wav");
  await page.getByRole("button", { name: "Registrar y preparar" }).click();
  await expect(page.getByText("Transcripción local completada")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".transcript-banner p")).toHaveText(/\S+/);
});

test("un relato aleatorio se explica como no aplicable y no como error del sistema", async ({ page }) => {
  const transcript = "El hermano del gobierno no me gusta, es una porquería.";
  await page.route(/\/api\/runs(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ runId: "ui-disposition" }) });
  });
  await page.route(/\/api\/runs\/ui-disposition$/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "ui-disposition",
        status: "not_applicable",
        elapsedMs: 8,
        transcript,
        disposition: { kind: "not_applicable", guidance: "El relato no describe un reclamo bancario cubierto por el catálogo local.", transcript }
      })
    });
  });
  await page.goto("/#new");
  await page.getByLabel("Nombre completo").fill("Cliente Sintético");
  await page.getByLabel("Cédula").fill("8-000-0999");
  await page.getByLabel("Texto del reclamo").fill(transcript);
  await page.getByRole("button", { name: "Registrar y preparar" }).click();

  await expect(page.getByRole("heading", { name: "Este relato no corresponde a un reclamo aplicable" })).toBeVisible();
  await expect(page.getByText("¿Qué puedes hacer?")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revisión manual requerida" })).toHaveCount(0);
});

test("un expediente pendiente de aclaración se puede retomar sin duplicar ticket", async ({ page }) => {
  const caseId = "case-needs-clarification";
  const trackingNumber = "CF-2026-009999";
  await page.route("**/api/cases", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([{
        id: caseId,
        trackingNumber,
        customer: { fullName: "Cliente Aclaración", nationalId: "8-000-0999", customerNumber: "CLI-10999", intakeChannel: "phone", preferredContact: "phone" },
        narrative: "Necesito reclamar algo de mi banco pero no expliqué la operación.",
        receivedAt: "2026-09-10T14:00:00.000Z",
        status: "waiting_customer",
        lastUpdatedAt: "2026-09-10T14:01:00.000Z",
        archived: false,
        history: []
      }])
    });
  });

  await page.goto("/#cases");
  await page.getByRole("button", { name: `Abrir ${trackingNumber}` }).click();
  await page.getByRole("button", { name: "Completar aclaración" }).click();

  await expect(page.getByText(trackingNumber)).toBeVisible();
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Cliente Aclaración");
  await expect(page.getByLabel("Texto del reclamo")).toHaveValue(/no expliqué la operación/);
});

test("el cliente consulta un caso cerrado sin ver información interna", async ({ page }) => {
  await page.goto("/#tracking");
  await page.getByRole("button", { name: "Usar ejemplo cerrado" }).click();
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(page.getByText("Cerrado").first()).toBeVisible();
  await expect(page.getByText("Su reclamo sintético fue resuelto")).toBeVisible();
  await expect(page.getByText("EVIDENCIA-DEMO")).toHaveCount(0);
});

test("el especialista completa investigación, resolución y entrega simulada", async ({ page }) => {
  await page.goto("/#cases");
  await page.getByPlaceholder("Buscar por seguimiento o cliente").fill("CF-2026-000105");
  await page.getByRole("button", { name: "Abrir CF-2026-000105" }).click();
  await page.getByRole("button", { name: "Investigación", exact: true }).click();
  const checks = page.locator(".checklist input[type=checkbox]");
  for (let index = 0; index < await checks.count(); index += 1) {
    await checks.nth(index).check();
    await page.getByLabel(`Resultado ${index + 1}`).fill("Paso completado con evidencia sintética.");
  }
  await page.getByLabel("Resumen de investigación").fill("La revisión sintética confirmó los movimientos del caso.");
  await page.getByLabel("Resolución", { exact: true }).fill("Procede una resolución favorable dentro de la demostración.");
  await page.getByLabel("Respuesta final al cliente").fill("Su reclamo sintético fue resuelto favorablemente.");
  await page.getByLabel("Referencia de evidencia sintética").fill("EVIDENCIA-E2E-001");
  await page.getByRole("button", { name: "Confirmar resolución" }).click();
  await expect(page.getByText("Resuelto").first()).toBeVisible();
  await page.getByRole("button", { name: "Comunicación", exact: true }).click();
  await page.getByRole("button", { name: "Registrar entrega y cerrar" }).click();
  await expect(page.getByText("Cerrado").first()).toBeVisible();
});
