import { expect, test } from "@playwright/test";

test("navegación y diseño se mantienen utilizables en tablet y móvil", async ({ page }) => {
  for (const viewport of [{ width: 900, height: 840 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Resumen" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Nuevo reclamo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Expedientes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacidad" })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= body.clientWidth)).toBe(true);
  }
  await page.getByRole("link", { name: "Privacidad" }).click();
  await expect(page.getByRole("heading", { name: "La inferencia no sale del equipo." })).toBeInViewport();
});

test("caso ATM: edición, confirmación e historial local", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cargar caso estrella de cajero" }).click();
  await page.getByRole("button", { name: "Preparar expediente" }).click();
  // Local preparation can take several seconds on integrated GPUs.
  await expect(page.getByText("Retiro debitado sin entrega de efectivo").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Área responsable")).toHaveValue("Operaciones de Cajeros y Disputas");
  await expect(page.getByRole("list").getByText("identificador cajero")).toBeVisible();
  await page.getByLabel("Resumen").fill("Resumen ajustado por revisión humana.");
  await page.getByRole("button", { name: "Confirmar expediente revisado" }).click();
  await expect(page.getByText("Expediente confirmado y guardado solo en la base local.")).toBeVisible();
  await expect(page.locator(".history").getByText("Resumen ajustado por revisión humana.")).toBeVisible();
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByText("No hay expedientes confirmados.")).toBeVisible();
});
