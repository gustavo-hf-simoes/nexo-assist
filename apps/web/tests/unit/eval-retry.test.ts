import { describe, expect, it } from "vitest";
import { isRateLimited, retryOnRateLimit } from "../../evals/retry";

describe("isRateLimited", () => {
  it("reconhece 429 pelo status ou pela mensagem do provedor", () => {
    expect(isRateLimited(Object.assign(new Error("x"), { statusCode: 429 }))).toBe(true);
    expect(isRateLimited(new Error("Rate limit reached for model on tokens per minute (TPM)"))).toBe(true);
    expect(isRateLimited(new Error("modelo não encontrado"))).toBe(false);
    expect(isRateLimited("texto solto")).toBe(false);
    // Cota diária esgotada não volta em um minuto: não vale esperar.
    expect(isRateLimited(Object.assign(new Error("Rate limit reached on tokens per day (TPD)"), { statusCode: 429 }))).toBe(false);
  });
});

describe("retryOnRateLimit", () => {
  it("espera e tenta de novo depois de um 429, até o limite de tentativas", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await retryOnRateLimit(
      async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error("limite"), { statusCode: 429 });
        return "ok";
      },
      { attempts: 3, waitMs: 60_000, sleep: async (ms) => void waits.push(ms) },
    );
    expect(result).toBe("ok");
    expect(waits).toEqual([60_000, 60_000]);
  });

  it("não repete erro que não é de limite e desiste ao esgotar as tentativas", async () => {
    const sleep = async () => undefined;
    await expect(retryOnRateLimit(async () => Promise.reject(new Error("quebrou")), { attempts: 3, waitMs: 1, sleep })).rejects.toThrow("quebrou");
    let calls = 0;
    await expect(
      retryOnRateLimit(
        async () => {
          calls += 1;
          throw Object.assign(new Error("limite"), { statusCode: 429 });
        },
        { attempts: 2, waitMs: 1, sleep },
      ),
    ).rejects.toThrow("limite");
    expect(calls).toBe(2);
  });
});
