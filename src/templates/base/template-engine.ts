/**
 * Template Engine Interface
 * Provides abstraction for rendering code templates
 */

export interface TemplateContext {
  [key: string]: any;
}

export interface Template {
  name: string;
  render(context: TemplateContext): string;
  validate?(context: TemplateContext): boolean;
}

export interface TemplateEngine {
  render(template: string, context: TemplateContext): string;
}

/**
 * Simple string interpolation template engine
 * Replaces {{variable}} with context values
 */
export class SimpleTemplateEngine implements TemplateEngine {
  render(template: string, context: TemplateContext): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = this.getNestedValue(context, path);
      return value !== undefined ? String(value) : match;
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

/**
 * Code template builder with fluent API
 */
export class CodeTemplate implements Template {
  private lines: string[] = [];
  
  constructor(public name: string) {}

  add(line: string): this {
    this.lines.push(line);
    return this;
  }

  addLines(lines: string[]): this {
    this.lines.push(...lines);
    return this;
  }

  addBlock(block: string): this {
    this.lines.push(...block.split('\n'));
    return this;
  }

  blank(): this {
    this.lines.push('');
    return this;
  }

  section(title: string): this {
    this.lines.push('', `// ==================== ${title} ====================`, '');
    return this;
  }

  render(context: TemplateContext): string {
    const engine = new SimpleTemplateEngine();
    return this.lines.map(line => engine.render(line, context)).join('\n');
  }

  clear(): this {
    this.lines = [];
    return this;
  }
}
