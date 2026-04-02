/**
 * Authentication utilities template generator
 * Password hashing (bcrypt/argon2), JWT tokens, crypto utilities
 */

import { CodeBuilder } from "../base/code-builder.js";

export function generateAuthUtils(): string {
  const builder = new CodeBuilder();

  builder
    .comment("Authentication Utilities")
    .comment("Password hashing, JWT tokens, and crypto helpers")
    .line()
    .import(["logger"], "./logger.utils.js")
    .line()
    .section("Password Hashing (bcrypt)")
    .line()
    .comment("Hash password with bcrypt (recommended for most use cases)")
    .comment("Install: npm install bcrypt @types/bcrypt")
    .line(
      "export async function hashPassword(password: string, saltRounds: number = 12): Promise<string> {",
    )
    .line("  try {")
    .line("    // @ts-expect-error - bcrypt is an optional peer dependency")
    .line('    const bcrypt = await import("bcrypt");')
    .line("    return await bcrypt.hash(password, saltRounds);")
    .line("  } catch (error) {")
    .line('    if ((error as any).code === "ERR_MODULE_NOT_FOUND") {')
    .line(
      '      throw new Error("bcrypt not installed. Run: npm install bcrypt");',
    )
    .line("    }")
    .line("    throw error;")
    .line("  }")
    .line("}")
    .line()
    .comment("Verify password against bcrypt hash")
    .line(
      "export async function verifyPassword(password: string, hash: string): Promise<boolean> {",
    )
    .line("  try {")
    .line("    // @ts-expect-error - bcrypt is an optional peer dependency")
    .line('    const bcrypt = await import("bcrypt");')
    .line("    return await bcrypt.compare(password, hash);")
    .line("  } catch (error) {")
    .line('    if ((error as any).code === "ERR_MODULE_NOT_FOUND") {')
    .line(
      '      throw new Error("bcrypt not installed. Run: npm install bcrypt");',
    )
    .line("    }")
    .line("    throw error;")
    .line("  }")
    .line("}")
    .line()
    .section("Password Hashing (argon2) - Alternative")
    .line()
    .comment(
      "Hash password with argon2 (more secure, recommended for high-security apps)",
    )
    .comment("Install: npm install argon2")
    .line(
      "export async function hashPasswordArgon2(password: string): Promise<string> {",
    )
    .line("  try {")
    .line("    // @ts-expect-error - argon2 is an optional peer dependency")
    .line('    const argon2 = await import("argon2");')
    .line("    return await argon2.hash(password);")
    .line("  } catch (error) {")
    .line('    if ((error as any).code === "ERR_MODULE_NOT_FOUND") {')
    .line(
      '      throw new Error("argon2 not installed. Run: npm install argon2");',
    )
    .line("    }")
    .line("    throw error;")
    .line("  }")
    .line("}")
    .line()
    .comment("Verify password against argon2 hash")
    .line(
      "export async function verifyPasswordArgon2(password: string, hash: string): Promise<boolean> {",
    )
    .line("  try {")
    .line("    // @ts-expect-error - argon2 is an optional peer dependency")
    .line('    const argon2 = await import("argon2");')
    .line("    return await argon2.verify(hash, password);")
    .line("  } catch (error) {")
    .line('    if ((error as any).code === "ERR_MODULE_NOT_FOUND") {')
    .line(
      '      throw new Error("argon2 not installed. Run: npm install argon2");',
    )
    .line("    }")
    .line("    throw error;")
    .line("  }")
    .line("}")
    .line()
    .section("JWT Token Generation and Verification")
    .line()
    .comment("JWT payload interface")
    .line("export interface JWTPayload {")
    .line("  userId: string | number;")
    .line("  email?: string;")
    .line("  role?: string;")
    .line("  [key: string]: any;")
    .line("}")
    .line()
    .comment("JWT options")
    .line("export interface JWTOptions {")
    .line('  expiresIn?: string | number; // e.g., "7d", "24h", 3600 (seconds)')
    .line("  issuer?: string;")
    .line("  audience?: string;")
    .line("}")
    .line()
    .comment("Generate JWT token")
    .comment("Install: npm install jsonwebtoken @types/jsonwebtoken")
    .line("export async function generateToken(")
    .line("  payload: JWTPayload,")
    .line("  secret: string,")
    .line("  options?: JWTOptions")
    .line("): Promise<string> {")
    .line("  try {")
    .line(
      "    // @ts-expect-error - jsonwebtoken is an optional peer dependency",
    )
    .line('    const jwt = await import("jsonwebtoken");')
    .line("    return jwt.sign(payload, secret, {")
    .line('      expiresIn: options?.expiresIn || "7d",')
    .line("      issuer: options?.issuer,")
    .line("      audience: options?.audience,")
    .line("    });")
    .line("  } catch (error) {")
    .line('    if ((error as any).code === "ERR_MODULE_NOT_FOUND") {')
    .line(
      '      throw new Error("jsonwebtoken not installed. Run: npm install jsonwebtoken");',
    )
    .line("    }")
    .line("    throw error;")
    .line("  }")
    .line("}")
    .line()
    .comment("Verify JWT token")
    .line("export async function verifyToken<T = JWTPayload>(")
    .line("  token: string,")
    .line("  secret: string")
    .line("): Promise<T | null> {")
    .line("  try {")
    .line(
      "    // @ts-expect-error - jsonwebtoken is an optional peer dependency",
    )
    .line('    const jwt = await import("jsonwebtoken");')
    .line("    const decoded = jwt.verify(token, secret);")
    .line("    return decoded as T;")
    .line("  } catch (error) {")
    .line('    if ((error as any).code === "ERR_MODULE_NOT_FOUND") {')
    .line(
      '      throw new Error("jsonwebtoken not installed. Run: npm install jsonwebtoken");',
    )
    .line("    }")
    .line(
      '    logger.warn({ message: "JWT verification failed", err: error });',
    )
    .line("    return null;")
    .line("  }")
    .line("}")
    .line()
    .comment("Decode JWT token without verification (useful for debugging)")
    .line(
      "export async function decodeToken<T = JWTPayload>(token: string): Promise<T | null> {",
    )
    .line("  try {")
    .line(
      "    // @ts-expect-error - jsonwebtoken is an optional peer dependency",
    )
    .line('    const jwt = await import("jsonwebtoken");')
    .line("    const decoded = jwt.decode(token);")
    .line("    return decoded as T;")
    .line("  } catch (error) {")
    .line("    return null;")
    .line("  }")
    .line("}")
    .line()
    .comment("Generate refresh token (longer expiry)")
    .line("export async function generateRefreshToken(")
    .line("  payload: JWTPayload,")
    .line("  secret: string,")
    .line('  expiresIn: string = "30d"')
    .line("): Promise<string> {")
    .line("  return generateToken(payload, secret, { expiresIn });")
    .line("}")
    .line()
    .section("Crypto Utilities")
    .line()
    .import(
      [
        "randomBytes",
        "createHash",
        "createCipheriv",
        "createDecipheriv",
        "scryptSync",
      ],
      "crypto",
    )
    .line()
    .comment("Generate random string (for tokens, codes, etc.)")
    .line("export function generateRandomToken(length: number = 32): string {")
    .line('  return randomBytes(length).toString("hex");')
    .line("}")
    .line()
    .comment("Generate random numeric code (for OTP, verification codes)")
    .line("export function generateNumericCode(digits: number = 6): string {")
    .line("  const max = Math.pow(10, digits);")
    .line("  const code = Math.floor(Math.random() * max);")
    .line('  return code.toString().padStart(digits, "0");')
    .line("}")
    .line()
    .comment("Hash string with SHA-256")
    .line("export function sha256(data: string): string {")
    .line('  return createHash("sha256").update(data).digest("hex");')
    .line("}")
    .line()
    .comment(
      "Hash string with MD5 (not recommended for security, use for checksums only)",
    )
    .line("export function md5(data: string): string {")
    .line('  return createHash("md5").update(data).digest("hex");')
    .line("}")
    .line()
    .comment("Encrypt data with AES-256-GCM")
    .line("export function encrypt(text: string, secretKey: string): string {")
    .line('  const algorithm = "aes-256-gcm";')
    .line('  const key = scryptSync(secretKey, "salt", 32);')
    .line("  const iv = randomBytes(16);")
    .line("  const cipher = createCipheriv(algorithm, key, iv);")
    .line()
    .line('  let encrypted = cipher.update(text, "utf8", "hex");')
    .line('  encrypted += cipher.final("hex");')
    .line()
    .line("  const authTag = cipher.getAuthTag();")
    .line(
      '  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;',
    )
    .line("}")
    .line()
    .comment("Decrypt data encrypted with encrypt()")
    .line(
      "export function decrypt(encryptedData: string, secretKey: string): string {",
    )
    .line('  const algorithm = "aes-256-gcm";')
    .line('  const [ivHex, authTagHex, encrypted] = encryptedData.split(":");')
    .line()
    .line('  const key = scryptSync(secretKey, "salt", 32);')
    .line('  const iv = Buffer.from(ivHex, "hex");')
    .line('  const authTag = Buffer.from(authTagHex, "hex");')
    .line()
    .line("  const decipher = createDecipheriv(algorithm, key, iv);")
    .line("  decipher.setAuthTag(authTag);")
    .line()
    .line('  let decrypted = decipher.update(encrypted, "hex", "utf8");')
    .line('  decrypted += decipher.final("utf8");')
    .line()
    .line("  return decrypted;")
    .line("}")
    .line()
    .comment("Compare two strings in constant time (prevents timing attacks)")
    .line("export function secureCompare(a: string, b: string): boolean {")
    .line("  if (a.length !== b.length) return false;")
    .line()
    .line("  let result = 0;")
    .line("  for (let i = 0; i < a.length; i++) {")
    .line("    result |= a.charCodeAt(i) ^ b.charCodeAt(i);")
    .line("  }")
    .line("  return result === 0;")
    .line("}")
    .line()
    .section("Example Usage")
    .line()
    .comment("Example: User registration")
    .comment("const hashedPassword = await hashPassword(req.body.password);")
    .comment(
      'await db.query("INSERT INTO users (email, password) VALUES (?, ?)", [email, hashedPassword]);',
    )
    .line()
    .comment("Example: User login")
    .comment(
      'const user = await db.queryOne("SELECT * FROM users WHERE email = ?", [email]);',
    )
    .comment(
      "const isValid = await verifyPassword(req.body.password, user.password);",
    )
    .comment("if (isValid) {")
    .comment(
      "  const token = await generateToken({ userId: user.id, email: user.email }, process.env.JWT_SECRET);",
    )
    .comment("  return { token };")
    .comment("}")
    .line()
    .comment("Example: Protected route")
    .comment('const token = req.headers.authorization?.replace("Bearer ", "");')
    .comment(
      "const payload = await verifyToken(token, process.env.JWT_SECRET);",
    )
    .comment("if (!payload) {")
    .comment('  return res.status(401).json({ error: "Invalid token" });')
    .comment("}");

  return builder.toString();
}
