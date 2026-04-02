# Changelog - Katax CLI

## [1.4.2] - 2026-04-02

### ✨ Added
- **Pagination Support**: `ControllerResult` now includes optional pagination fields (`currentPage`, `totalPages`, `totalItems`, `totalCount`, `hasMorePages`)
- **Generic Validation Function**: Added `validateSchema<T>()` utility that automatically handles both sync and async schemas
  - Auto-detects async validators via `schema._def?.async`
  - Standardizes error format across all validators
  - Reduces boilerplate from ~10 lines per validator to 1 line

### 🔧 Changed
- **Validator Generation**: All generated validators now use the reusable `validateSchema()` function
- **API Response Format**: `sendResponse()` automatically includes pagination fields in responses when present

## [1.4.1] - 2026-04-02

### 🐛 Fixed
- **CORS Configuration**: Moved `ALLOWED_ORIGINS` reading inside the `origin` callback to ensure environment variables are loaded correctly (fixes timing issues where `.env` was not yet loaded)

## [1.4.0] - 2026-04-01

### ✨ Added - New Utilities

#### 📡 Stream Utilities (`stream.utils.ts`)
Generated in every new project at `src/shared/stream.utils.ts`

**Features:**
- **Server-Sent Events (SSE)** with `SSEStream` class
  - Automatic keep-alive (prevents connection timeouts)
  - Event types for client-side filtering
  - Error handling through stream
  - Auto-cleanup on connection close
  
- **Streaming Responses**
  - `streamArray()` - Stream large arrays in chunks
  - `streamAsyncIterator()` - Stream data as it becomes available
  - `sendChunked()` - Chunked Transfer-Encoding support

**Use Cases:**
- Real-time progress tracking
- Live data feeds
- Large dataset pagination
- Server-sent notifications

**Example:**
```typescript
import { SSEStream } from '../shared/stream.utils.js';

export async function streamProgressHandler(req: Request, res: Response) {
  const stream = new SSEStream(res);
  
  for (let i = 0; i <= 100; i += 10) {
    stream.send({ progress: i }, 'update');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  stream.close();
}
```

#### 🔒 Auth Utilities (`auth.utils.ts`)
Generated when JWT authentication is selected at `src/shared/auth.utils.ts`

**Features:**
- **Password Hashing**
  - `hashPassword()` / `verifyPassword()` - bcrypt (recommended)
  - `hashPasswordArgon2()` / `verifyPasswordArgon2()` - argon2 (high-security)

- **JWT Tokens**
  - `generateToken()` - Create access tokens
  - `generateRefreshToken()` - Create refresh tokens (30d default)
  - `verifyToken()` - Verify and decode tokens
  - `decodeToken()` - Decode without verification (debugging)

- **Crypto Utilities**
  - `generateRandomToken()` - Random hex strings for API keys, reset tokens
  - `generateNumericCode()` - 6-digit OTP codes
  - `sha256()` / `md5()` - Hashing functions
  - `encrypt()` / `decrypt()` - AES-256-GCM encryption
  - `secureCompare()` - Constant-time string comparison (prevents timing attacks)

**Dependencies (optional peer dependencies):**
```bash
npm install bcrypt @types/bcrypt              # Password hashing
npm install argon2                            # Alternative password hashing
npm install jsonwebtoken @types/jsonwebtoken  # JWT tokens
```

**Example:**
```typescript
import { hashPassword, verifyPassword, generateToken } from '../shared/auth.utils.js';

// Registration
const hashedPassword = await hashPassword(req.body.password);
await db.query('INSERT INTO users (email, password) VALUES (?, ?)', 
  [email, hashedPassword]);

// Login
const user = await db.queryOne('SELECT * FROM users WHERE email = ?', [email]);
const isValid = await verifyPassword(req.body.password, user.password);

if (isValid) {
  const token = await generateToken(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET!
  );
  res.json({ token });
}
```

### 📚 Documentation

- Added `UTILS_GUIDE.md` - Comprehensive guide for all utilities
  - Complete API reference
  - Real-world examples
  - Best practices
  - Installation instructions
  
- Updated `README.md` - Added utilities section

### 🔧 Technical Changes

- Added `stream-utils-template.ts` generator
- Added `auth-utils-template.ts` generator
- Updated `init.ts` command to generate both utilities
- Updated template exports in `templates/index.ts`

### 📦 Generated Files

When running `katax init my-api`, projects now include:

**Always Generated:**
- `src/shared/stream.utils.ts` - SSE and streaming utilities

**Generated with JWT Auth:**
- `src/shared/auth.utils.ts` - Authentication and crypto utilities
- `src/shared/jwt.utils.ts` - (existing) Simplified JWT middleware

### 🎯 Migration Guide

**For Existing Projects:**

1. Copy new utilities from a fresh `katax init` project:
   ```bash
   katax init temp-project
   cp temp-project/src/shared/stream.utils.ts your-project/src/shared/
   cp temp-project/src/shared/auth.utils.ts your-project/src/shared/
   rm -rf temp-project
   ```

2. Install optional dependencies as needed:
   ```bash
   npm install bcrypt @types/bcrypt jsonwebtoken @types/jsonwebtoken
   ```

3. See [UTILS_GUIDE.md](./UTILS_GUIDE.md) for usage examples

### 🚀 Future Enhancements

Planned utilities for future releases:
- Rate limiting utils
- Caching helpers (Redis integration)
- Email sending (with templates)
- File upload/download helpers
- Webhook verification utils
- API client generator (fetch/axios wrappers)

---

## [1.3.3] - Previous Release
(existing changelog continues...)
