/**
 * Code builder utilities for generating TypeScript code
 */

export class CodeBuilder {
  private lines: string[] = [];
  private indentLevel: number = 0;
  private indentSize: number = 2;

  constructor(indentSize: number = 2) {
    this.indentSize = indentSize;
  }

  /**
   * Add a line with current indentation
   */
  line(text: string = ''): this {
    if (text) {
      this.lines.push(this.indent() + text);
    } else {
      this.lines.push('');
    }
    return this;
  }

  /**
   * Add raw text without indentation
   */
  raw(text: string): this {
    this.lines.push(text);
    return this;
  }

  /**
   * Add multiple lines
   */
  addLines(...texts: string[]): this {
    texts.forEach(text => this.line(text));
    return this;
  }

  /**
   * Add a block of code
   */
  block(code: string): this {
    const blockLines = code.split('\n');
    blockLines.forEach(line => this.line(line));
    return this;
  }

  /**
   * Add import statement
   */
  import(imports: string | string[], from: string): this {
    const importList = Array.isArray(imports) ? imports.join(', ') : imports;
    this.line(`import { ${importList} } from '${from}';`);
    return this;
  }

  /**
   * Add default import
   */
  importDefault(name: string, from: string): this {
    this.line(`import ${name} from '${from}';`);
    return this;
  }

  /**
   * Add export statement
   */
  export(name: string, type: 'const' | 'function' | 'interface' | 'type' | 'class' = 'const'): this {
    this.line(`export ${type} ${name}`);
    return this;
  }

  /**
   * Add JSDoc comment
   */
  comment(text: string): this {
    this.line(`/**`);
    this.line(` * ${text}`);
    this.line(` */`);
    return this;
  }

  /**
   * Add section separator
   */
  section(title: string): this {
    this.line();
    this.line(`// ==================== ${title.toUpperCase()} ====================`);
    this.line();
    return this;
  }

  /**
   * Start a code block with opening brace
   */
  openBlock(prefix: string = ''): this {
    if (prefix) {
      this.line(`${prefix} {`);
    } else {
      this.line('{');
    }
    this.indentLevel++;
    return this;
  }

  /**
   * Close a code block
   */
  closeBlock(suffix: string = ''): this {
    this.indentLevel--;
    if (suffix) {
      this.line(`}${suffix}`);
    } else {
      this.line('}');
    }
    return this;
  }

  /**
   * Add a function
   */
  function(name: string, params: string[], returnType?: string, isAsync: boolean = false): this {
    const asyncPrefix = isAsync ? 'async ' : '';
    const returnSuffix = returnType ? `: ${returnType}` : '';
    this.line(`${asyncPrefix}function ${name}(${params.join(', ')})${returnSuffix} {`);
    this.indentLevel++;
    return this;
  }

  /**
   * Add an arrow function
   */
  arrowFunction(params: string[], returnType?: string, isAsync: boolean = false): this {
    const asyncPrefix = isAsync ? 'async ' : '';
    const returnSuffix = returnType ? `: ${returnType}` : '';
    const paramList = params.length === 1 ? params[0] : `(${params.join(', ')})`;
    this.line(`${asyncPrefix}${paramList}${returnSuffix} => {`);
    this.indentLevel++;
    return this;
  }

  /**
   * Close a function
   */
  endFunction(): this {
    return this.closeBlock();
  }

  /**
   * Add an interface
   */
  interface(name: string, extended?: string): this {
    const ext = extended ? ` extends ${extended}` : '';
    this.line(`interface ${name}${ext} {`);
    this.indentLevel++;
    return this;
  }

  /**
   * Close an interface
   */
  endInterface(): this {
    return this.closeBlock();
  }

  /**
   * Add a class
   */
  class(name: string, extended?: string, implemented?: string[]): this {
    let declaration = `class ${name}`;
    if (extended) declaration += ` extends ${extended}`;
    if (implemented && implemented.length > 0) {
      declaration += ` implements ${implemented.join(', ')}`;
    }
    declaration += ' {';
    this.line(declaration);
    this.indentLevel++;
    return this;
  }

  /**
   * Close a class
   */
  endClass(): this {
    return this.closeBlock();
  }

  /**
   * Add a try-catch block
   */
  try(): this {
    this.line('try {');
    this.indentLevel++;
    return this;
  }

  catch(errorVar: string = 'error'): this {
    this.indentLevel--;
    this.line(`} catch (${errorVar}) {`);
    this.indentLevel++;
    return this;
  }

  endTryCatch(): this {
    return this.closeBlock();
  }

  /**
   * Increase indentation
   */
  increaseIndent(): this {
    this.indentLevel++;
    return this;
  }

  /**
   * Decrease indentation
   */
  decreaseIndent(): this {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
    return this;
  }

  /**
   * Get current indentation string
   */
  private indent(): string {
    return ' '.repeat(this.indentLevel * this.indentSize);
  }

  /**
   * Build the final code string
   */
  build(): string {
    return this.lines.join('\n');
  }

  /**
   * Clear all content
   */
  clear(): this {
    this.lines = [];
    this.indentLevel = 0;
    return this;
  }

  /**
   * Get line count
   */
  length(): number {
    return this.lines.length;
  }
}
