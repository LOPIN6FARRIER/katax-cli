import { describe, expect, it } from "vitest";
import { generateValidator } from "../src/generators/validator-generator.ts";

describe("validator-generator", () => {
  it("uses validateSchema helper for main and id validation", () => {
    const content = generateValidator({
      name: "users",
      method: "GET",
      path: "/api/users",
      addValidation: true,
      fields: [{ name: "email", type: "email", required: true, rules: [] }],
      addAsyncValidators: false,
    });

    expect(content).toContain("import { validateSchema }");
    expect(content).toContain("return validateSchema(usersSchema, data);");
    expect(content).toContain("return validateSchema(usersIdSchema, id);");
    expect(content).not.toContain("const result = usersSchema.safeParse");
  });

  it("keeps async refinement wiring when addAsyncValidators is enabled", () => {
    const content = generateValidator({
      name: "users",
      method: "POST",
      path: "/api/users",
      addValidation: true,
      addAsyncValidators: true,
      fields: [
        {
          name: "email",
          type: "string",
          required: true,
          rules: [],
          asyncValidator: {
            type: "unique",
            table: "users",
            column: "email",
            message: "Email already exists",
          },
        },
      ],
    });

    expect(content).toContain("return validateSchema(usersSchema, data);");
    expect(content).toContain(".asyncRefine(emailUniqueValidator)");
  });
});
