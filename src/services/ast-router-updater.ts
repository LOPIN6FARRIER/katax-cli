/**
 * AST-based router updater using TypeScript Compiler API
 * Safely modifies route files without string manipulation
 */

import ts from 'typescript';
import path from 'path';
import fs from 'fs/promises';

export interface RouteUpdate {
  routerName: string;
  importPath: string;
  routePath: string;
}

export class ASTRouterUpdater {
  /**
   * Add a new router import and registration to routes.ts
   */
  async addRoute(routesFilePath: string, update: RouteUpdate): Promise<void> {
    const sourceText = await fs.readFile(routesFilePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      routesFilePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    const importToAdd = this.createImportDeclaration(update.routerName, update.importPath);
    const routeToAdd = this.createRouteRegistration(update.routerName, update.routePath);

    const updatedStatements = this.insertImportAndRoute(
      sourceFile.statements,
      importToAdd,
      routeToAdd
    );

    const updatedSourceFile = ts.factory.updateSourceFile(sourceFile, updatedStatements);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const result = printer.printFile(updatedSourceFile);

    await fs.writeFile(routesFilePath, result, 'utf-8');
  }

  /**
   * Create an import declaration AST node
   */
  private createImportDeclaration(routerName: string, importPath: string): ts.ImportDeclaration {
    return ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        ts.factory.createIdentifier(routerName),
        undefined
      ),
      ts.factory.createStringLiteral(importPath),
      undefined
    );
  }

  /**
   * Create a route registration statement (router.use(...))
   */
  private createRouteRegistration(routerName: string, routePath: string): ts.ExpressionStatement {
    return ts.factory.createExpressionStatement(
      ts.factory.createCallExpression(
        ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier('router'),
          ts.factory.createIdentifier('use')
        ),
        undefined,
        [
          ts.factory.createStringLiteral(routePath),
          ts.factory.createIdentifier(routerName)
        ]
      )
    );
  }

  /**
   * Insert import and route in the correct positions
   */
  private insertImportAndRoute(
    statements: ts.NodeArray<ts.Statement>,
    importToAdd: ts.ImportDeclaration,
    routeToAdd: ts.ExpressionStatement
  ): ts.Statement[] {
    const result: ts.Statement[] = [];
    let importInserted = false;
    let routeInserted = false;

    // Find last import position
    let lastImportIndex = -1;
    for (let i = 0; i < statements.length; i++) {
      if (ts.isImportDeclaration(statements[i])) {
        lastImportIndex = i;
      }
    }

    // Find export default position
    let exportDefaultIndex = -1;
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (ts.isExportAssignment(statement)) {
        exportDefaultIndex = i;
        break;
      }
      // Check for 'export default' statement
      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause === undefined
      ) {
        exportDefaultIndex = i;
        break;
      }
    }

    // Insert statements
    for (let i = 0; i < statements.length; i++) {
      result.push(statements[i]);

      // Insert import after last import
      if (i === lastImportIndex && !importInserted) {
        result.push(importToAdd);
        importInserted = true;
      }

      // Insert route before export default
      if (exportDefaultIndex !== -1 && i === exportDefaultIndex - 1 && !routeInserted) {
        result.push(routeToAdd);
        routeInserted = true;
      }
    }

    // If no exports found, add route at the end
    if (!routeInserted) {
      result.push(routeToAdd);
    }

    // If no imports found, add import at the beginning
    if (!importInserted) {
      result.unshift(importToAdd);
    }

    return result;
  }

  /**
   * Check if import already exists
   */
  async importExists(routesFilePath: string, routerName: string): Promise<boolean> {
    const sourceText = await fs.readFile(routesFilePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      routesFilePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const importClause = statement.importClause;
        if (importClause?.name?.text === routerName) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if route registration already exists
   */
  async routeExists(routesFilePath: string, routePath: string): Promise<boolean> {
    const sourceText = await fs.readFile(routesFilePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      routesFilePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    for (const statement of sourceFile.statements) {
      if (ts.isExpressionStatement(statement)) {
        const expression = statement.expression;
        if (
          ts.isCallExpression(expression) &&
          ts.isPropertyAccessExpression(expression.expression) &&
          expression.expression.name.text === 'use'
        ) {
          const args = expression.arguments;
          if (args.length > 0 && ts.isStringLiteral(args[0])) {
            if (args[0].text === routePath) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Remove a route registration
   */
  async removeRoute(routesFilePath: string, routerName: string): Promise<void> {
    const sourceText = await fs.readFile(routesFilePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      routesFilePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    const updatedStatements = sourceFile.statements.filter(statement => {
      // Remove import
      if (ts.isImportDeclaration(statement)) {
        const importClause = statement.importClause;
        if (importClause?.name?.text === routerName) {
          return false;
        }
      }

      // Remove route registration
      if (ts.isExpressionStatement(statement)) {
        const expression = statement.expression;
        if (
          ts.isCallExpression(expression) &&
          ts.isPropertyAccessExpression(expression.expression)
        ) {
          const args = expression.arguments;
          if (args.length > 1 && ts.isIdentifier(args[1])) {
            if (args[1].text === routerName) {
              return false;
            }
          }
        }
      }

      return true;
    });

    const updatedSourceFile = ts.factory.updateSourceFile(sourceFile, updatedStatements);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const result = printer.printFile(updatedSourceFile);

    await fs.writeFile(routesFilePath, result, 'utf-8');
  }
}

/**
 * Export singleton instance
 */
export const astRouterUpdater = new ASTRouterUpdater();
