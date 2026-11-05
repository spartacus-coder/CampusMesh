import { describe, it, expect } from "vitest";
import { THEME_COLORS } from "./index";

describe("@campusmesh/ui", () => {
  it("should define dark and light theme tokens", () => {
    expect(THEME_COLORS.dark.background).toBe("#0B0F17");
    expect(THEME_COLORS.light.background).toBe("#FFFFFF");
    expect(THEME_COLORS.dark.primary).toBeDefined();
    expect(THEME_COLORS.light.primary).toBeDefined();
  });
});
