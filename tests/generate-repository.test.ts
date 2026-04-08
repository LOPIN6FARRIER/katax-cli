import { describe, expect, it } from "vitest";
import { __repositoryTestUtils } from "../src/commands/generate-repository.ts";

describe("generate-repository templates", () => {
  it("resolves nested repository naming", () => {
    const resource =
      __repositoryTestUtils.resolveResourceNaming("admin/products");

    expect(resource.segments).toEqual(["admin", "products"]);
    expect(resource.lowerName).toBe("products");
    expect(resource.relativePath).toBe(
      "src/api/admin/products/products.repository.ts",
    );
  });

  it("detects database from package json deps", () => {
    expect(
      __repositoryTestUtils.detectDatabaseFromPackageJson({
        dependencies: { pg: "^8.0.0" },
      }),
    ).toBe("postgresql");

    expect(
      __repositoryTestUtils.detectDatabaseFromPackageJson({
        devDependencies: { mysql2: "^3.0.0" },
      }),
    ).toBe("mysql");

    expect(
      __repositoryTestUtils.detectDatabaseFromPackageJson({
        dependencies: { mongodb: "^6.0.0" },
      }),
    ).toBe("mongodb");
  });

  it("generates postgres and mysql SQL templates with expected placeholders", () => {
    const postgresTemplate =
      __repositoryTestUtils.generateSqlRepositoryTemplate({
        pascalName: "Products",
        idType: "string",
        tableName: "products",
        dbName: "main",
        isPostgres: true,
      });

    const mysqlTemplate = __repositoryTestUtils.generateSqlRepositoryTemplate({
      pascalName: "Products",
      idType: "number",
      tableName: "products",
      dbName: "main",
      isPostgres: false,
    });

    expect(postgresTemplate).toContain("import type { ISqlDatabase }");
    expect(postgresTemplate).toContain("WHERE id = $1");
    expect(postgresTemplate).toContain("RETURNING *");

    expect(mysqlTemplate).toContain("WHERE id = ?");
    expect(mysqlTemplate).toContain("insertId");
    expect(mysqlTemplate).not.toContain("RETURNING *");
  });

  it("generates mongo template with typed mongo database access", () => {
    const mongoTemplate = __repositoryTestUtils.generateMongoRepositoryTemplate(
      {
        pascalName: "Products",
        idType: "string",
        collectionName: "products",
        dbName: "main",
        mongoDatabaseName: "app",
      },
    );

    expect(mongoTemplate).toContain("import type { IMongoDatabase }");
    expect(mongoTemplate).toContain("await db.getClient()");
    expect(mongoTemplate).toContain("collection<ProductsRecord>");
  });
});
