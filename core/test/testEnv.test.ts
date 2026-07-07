// Modified by Friday AI Team - Rebranded from Continue
describe("Test environment", () => {
  test("should have FRIDAY_GLOBAL_DIR env var set to .friday-test", () => {
    expect(process.env.FRIDAY_GLOBAL_DIR).toBeDefined();
    expect(process.env.FRIDAY_GLOBAL_DIR)?.toMatch(/\.friday-test$/);
  });
});
