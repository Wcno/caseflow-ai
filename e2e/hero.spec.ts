import { expect, test } from "@playwright/test";

test("caso ATM: edición, confirmación e historial local", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Cargar caso estrella de cajero" }).click();
  await page.getByRole("button", { name: "Preparar expediente" }).click();
  await expect(page.getByText("Retiro debitado sin entrega de efectivo").first()).toBeVisible();
  await expect(page.getByText("Operaciones de Cajeros y Disputas")).toBeVisible();
  await expect(page.getByText("identificador cajero")).toBeVisible();
  await page.getByLabel("Resumen").fill("Resumen ajustado por revisión humana.");
  await page.getByRole("button", { name: "Confirmar expediente revisado" }).click();
  await expect(page.getByText("Expediente confirmado y guardado solo en la base local.")).toBeVisible();
  await expect(page.locator(".history").getByText("Resumen ajustado por revisión humana.")).toBeVisible();
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByText("No hay expedientes confirmados.")).toBeVisible();
});
