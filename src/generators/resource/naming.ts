import path from "path";
import { resolveWithinRoot } from "../../utils/file-utils.js";

/**
 * Naming for `katax add endpoint <path>`.
 *
 *   habits                      -> /api/habits                     src/api/habits/habits.*.ts
 *   admin/users                 -> /api/admin/users                src/api/admin/users/users.*.ts
 *   habits/:habitId/reminders   -> /api/habits/:habitId/reminders  src/api/habits/reminders/reminders.*.ts
 *
 * The LAST segment is the resource (plural). Function and type names come
 * from it only (listUsers, getUser, UserRow...); the prefix only affects the
 * folder and the URL.
 */

const SAFE_SEGMENT = /^[a-z][a-z0-9-]*$/;
const PARAM_SEGMENT = /^:([a-z][a-zA-Z0-9]*)$/;

export interface ParentParam {
  /** URL param name: habitId */
  param: string;
  /** Column name: habit_id */
  column: string;
  /** Table of the parent resource: habits */
  table: string;
  /** Singular PascalCase of the parent: Habit */
  pascal: string;
}

export interface ResourceNaming {
  input: string;
  /** Mount path relative to /api, with params: habits/:habitId/reminders */
  mountPath: string;
  /** Static (non-param) segments: [habits, reminders] */
  folderSegments: string[];
  /** Absolute directory of the resource files */
  dir: string;
  /** File base name (last segment): reminders */
  fileBase: string;
  plural: { kebab: string; camel: string; pascal: string; snake: string; words: string };
  singular: { kebab: string; camel: string; pascal: string; snake: string; words: string };
  /** SQL table name (snake_case plural, overridable with --table) */
  table: string;
  /** Router identifier in api/routes.ts: habitsRemindersRouter */
  routerIdentifier: string;
  parents: ParentParam[];
  /** Relative prefix from the resource dir to src/: "../../" */
  srcRelative: string;
}

const IRREGULAR: Record<string, string> = {
  people: "person",
  children: "child",
  men: "man",
  women: "woman",
  mice: "mouse",
  geese: "goose",
  feet: "foot",
  teeth: "tooth",
};
const UNCOUNTABLE = new Set(["data", "series", "species", "news", "info", "media", "metadata", "feedback"]);

/** English singular of a single lowercase word. */
export function singularizeWord(word: string): string {
  if (UNCOUNTABLE.has(word)) return word;
  if (IRREGULAR[word]) return IRREGULAR[word]!;
  if (/[^aeiou]ies$/.test(word)) return word.slice(0, -3) + "y"; // categories -> category
  if (/(ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2); // addresses -> address, boxes -> box
  if (/(statuse|aliase|bonuse|campuse)s$/.test(word)) return word.slice(0, -2); // statuses -> status
  if (/ves$/.test(word) && !/(moves|curves|valves|olives|drives|archives)$/.test(word)) return word.slice(0, -3) + "f"; // shelves -> shelf
  if (/(ss|us|is)$/.test(word)) return word; // class, status, analysis
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

function cases(words: string[]): ResourceNaming["plural"] {
  const pascal = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
  return {
    kebab: words.join("-"),
    snake: words.join("_"),
    pascal,
    camel: pascal[0]!.toLowerCase() + pascal.slice(1),
    words: words.join(" "),
  };
}

export function toSnake(value: string): string {
  return splitWords(value).join("_");
}

export function toCamel(value: string): string {
  return cases(splitWords(value)).camel;
}

export function toPascal(value: string): string {
  return cases(splitWords(value)).pascal;
}

export function resolveResourceNaming(
  input: string,
  options: { singular?: string; table?: string; cwd?: string } = {},
): ResourceNaming {
  const raw = (input ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!raw) throw new Error("Endpoint path is required (e.g. habits, admin/users, habits/:habitId/reminders)");

  const segments = raw.split("/").map((s) => s.trim());
  const folderSegments: string[] = [];
  const parents: ParentParam[] = [];

  segments.forEach((segment, index) => {
    const param = segment.match(PARAM_SEGMENT);
    if (param) {
      const previous = segments[index - 1];
      if (!previous || PARAM_SEGMENT.test(previous)) {
        throw new Error(`Invalid path "${input}": a param (${segment}) must follow a resource segment (habits/:habitId/...)`);
      }
      const parentWords = splitWords(singularizeWord(splitWords(previous).join("-")));
      parents.push({
        param: param[1]!,
        column: toSnake(param[1]!),
        table: splitWords(previous).join("_"),
        pascal: cases(parentWords).pascal,
      });
      return;
    }
    if (!SAFE_SEGMENT.test(segment)) {
      throw new Error(
        `Invalid path "${input}": segment "${segment}" must be lowercase letters, numbers and "-" (kebab-case), ` +
          `or a param like ":habitId". No "..", spaces or special characters.`,
      );
    }
    folderSegments.push(segment);
  });

  const last = segments[segments.length - 1]!;
  if (PARAM_SEGMENT.test(last)) {
    throw new Error(`Invalid path "${input}": it must end with the resource name, not a param`);
  }

  const pluralWords = splitWords(last);
  const singularWords = options.singular
    ? splitWords(options.singular)
    : [...pluralWords.slice(0, -1), singularizeWord(pluralWords[pluralWords.length - 1]!)];

  // Uncountable words ("news", "settings") keep the same singular: names stay
  // unique anyway because every identifier has a verb prefix (listNews / getNews).
  const plural = cases(pluralWords);
  const singular = cases(singularWords);

  const cwd = options.cwd ?? process.cwd();
  const dir = resolveWithinRoot(path.join(cwd, "src", "api"), ...folderSegments);

  return {
    input,
    mountPath: segments.join("/"),
    folderSegments,
    dir,
    fileBase: last,
    plural,
    singular,
    table: options.table ? toSnake(options.table) : plural.snake,
    routerIdentifier: `${cases(folderSegments.flatMap(splitWords)).camel}Router`,
    parents,
    srcRelative: "../".repeat(folderSegments.length + 1),
  };
}
