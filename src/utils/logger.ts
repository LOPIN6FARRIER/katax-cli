import chalk from 'chalk';

let verboseMode = false;
let colorMode = true;

export function setVerbose(enabled: boolean): void {
  verboseMode = enabled;
}

export function setColorMode(enabled: boolean): void {
  colorMode = enabled;
}

function applyColor(color: (text: string) => string, text: string): string {
  return colorMode ? color(text) : text;
}

export function success(message: string): void {
  console.log(applyColor(chalk.green, `✅ ${message}`));
}

export function error(message: string): void {
  console.log(applyColor(chalk.red, `❌ ${message}`));
}

export function warning(message: string): void {
  console.log(applyColor(chalk.yellow, `⚠️  ${message}`));
}

export function info(message: string): void {
  console.log(applyColor(chalk.blue, `ℹ️  ${message}`));
}

export function verbose(message: string): void {
  if (verboseMode) {
    console.log(applyColor(chalk.gray, `[VERBOSE] ${message}`));
  }
}

export function gray(message: string): void {
  console.log(applyColor(chalk.gray, message));
}

export function title(message: string): void {
  console.log(applyColor(chalk.bold.cyan, `\n${message}\n`));
}

export function code(message: string): void {
  console.log(applyColor(chalk.bgBlack.white, ` ${message} `));
}
