import { describe, expect, it } from "vitest";
import { authoredFailedStep } from "../e2e/accounts/sanitized-reporter";

describe("Privacidad del reporte de navegador", () => {
  it("excluye pasos de Playwright que contienen contraseñas y enlaces", () => {
    const steps = [
      { category: "pw:api", title: 'Fill "private password"', error: { message: "private password" } },
      { category: "pw:api", title: "goto /verify-email#token=private-token", error: { message: "private-token" } },
    ];
    expect(authoredFailedStep(steps)).toBeUndefined();
    expect(authoredFailedStep([...steps, { category: "test.step", title: "explicit confirmation", error: {} }])).toBe("explicit confirmation");
  });
});
