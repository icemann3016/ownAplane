// Which payment provider is connected. Only "test" exists so far: every checkout, renewal and
// change works, but no money moves (BILLING_PROVIDER; a real provider is a driver next to it).
export function billingProvider(): string {
  return process.env.BILLING_PROVIDER?.trim() || "test";
}

export const isTestMode = () => billingProvider() === "test";
