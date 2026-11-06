import { describe, it, expect } from "vitest";
import { COLOR_TOKENS } from "./tokens/index";
import { cn } from "./lib/utils";

describe("@campusmesh/ui", () => {
  it("should define dark, light, and high-contrast theme tokens", () => {
    expect(COLOR_TOKENS.dark.background).toBe("#0B0F17");
    expect(COLOR_TOKENS.light.background).toBe("#F8FAFC");
    expect(COLOR_TOKENS.highContrast.background).toBe("#000000");
    expect(COLOR_TOKENS.dark.primary).toBeDefined();
    expect(COLOR_TOKENS.light.primary).toBeDefined();
  });

  it("cn helper should merge tailwind classes properly", () => {
    const merged = cn("px-2 py-1", "px-4", {
      "bg-primary": true,
      "bg-secondary": false,
    });
    expect(merged).toContain("px-4");
    expect(merged).toContain("bg-primary");
    expect(merged).not.toContain("px-2");
  });
});
