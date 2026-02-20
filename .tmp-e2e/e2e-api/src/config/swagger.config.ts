import swaggerUi from "swagger-ui-express";
import { Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Setup Swagger UI documentation
 */
export function setupSwagger(app: Express): void {
  try {
    const swaggerPath = path.join(__dirname, "../openapi.json");

    if (!fs.existsSync(swaggerPath)) {
      console.warn("⚠️  OpenAPI spec not found. Run: katax generate docs");
      return;
    }

    const swaggerDocument = JSON.parse(fs.readFileSync(swaggerPath, "utf-8"));

    // Swagger UI options
    const options = {
      explorer: true,
      customCss: ".swagger-ui .topbar { display: none }",
      customSiteTitle: "API Documentation",
    };

    // Setup Swagger UI
    app.use(
      "/docs",
      swaggerUi.serve,
      swaggerUi.setup(swaggerDocument, options),
    );
    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(swaggerDocument, options),
    );

    // JSON endpoint
    app.get("/openapi.json", (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.send(swaggerDocument);
    });

    const configuredServer = swaggerDocument?.servers?.[0]?.url as
      | string
      | undefined;
    const configuredPortMatch = configuredServer?.match(/localhost:(\d+)/);
    const port = process.env.PORT || configuredPortMatch?.[1] || "3107";
    console.log(
      `📖 API Documentation available at: http://localhost:${port}/docs`,
    );
  } catch (error) {
    console.error("Failed to setup Swagger:", error);
  }
}
