import { describe, it, expect, beforeEach } from "vitest";
import { hasV2Access, _resetForTests, _hydrateForTests } from "./accessGate";

// The property that matters most: this allow-list FAILS CLOSED. blacklist.ts falls open on no-DB
// (safe default: nobody banned); the gate's safe default is nobody in.

describe("hasV2Access — fail-closed allowlist", () => {
  beforeEach(() => _resetForTests());

  it("denies everyone before hydration (no DB → gate stays shut)", () => {
    expect(hasV2Access("0xAbC0000000000000000000000000000000000001", "celo")).toBe(false);
  });

  it("allows a hydrated wallet", () => {
    _hydrateForTests([{ player: "0xAbC0000000000000000000000000000000000001", chain: "celo" }]);
    expect(hasV2Access("0xAbC0000000000000000000000000000000000001", "celo")).toBe(true);
  });

  it("is case-insensitive on the address (checksummed vs lowercased)", () => {
    _hydrateForTests([{ player: "0xABC0000000000000000000000000000000000001", chain: "celo" }]);
    expect(hasV2Access("0xabc0000000000000000000000000000000000001", "celo")).toBe(true);
  });

  it("denies a wallet that never redeemed, even after hydration", () => {
    _hydrateForTests([{ player: "0xAbC0000000000000000000000000000000000001", chain: "celo" }]);
    expect(hasV2Access("0xDef0000000000000000000000000000000000002", "celo")).toBe(false);
  });

  it("scopes access per chain", () => {
    _hydrateForTests([{ player: "0xAbC0000000000000000000000000000000000001", chain: "celo" }]);
    expect(hasV2Access("0xAbC0000000000000000000000000000000000001", "stacks" as never)).toBe(
      false
    );
  });
});
