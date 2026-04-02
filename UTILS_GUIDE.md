# Katax CLI - Utils Documentation

## Overview
Katax CLI now includes advanced utilities for common API tasks:

1. **Stream Utils** - Server-Sent Events (SSE) and streaming responses
2. **Auth Utils** - Password hashing, JWT tokens, and crypto helpers

## Stream Utilities (`stream.utils.ts`)

### Server-Sent Events (SSE)

Perfect for real-time updates, progress tracking, and live data feeds.

#### Basic SSE Usage

```typescript
import { SSEStream } from '../shared/stream.utils.js';

export async function streamEventsHandler(req: Request, res: Response) {
  const stream = new SSEStream(res);
  
  try {
    // Send events
    for (let i = 0; i < 10; i++) {
      stream.send({ count: i, timestamp: Date.now() }, 'update');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    stream.close();
  } catch (error) {
    stream.sendError(error as Error);
    stream.close();
  }
}
```

#### SSE Features

- **Automatic keep-alive** - Prevents connection timeouts
- **Event types** - Name your events for client-side filtering
- **Error handling** - Send errors through the stream
- **Auto-cleanup** - Handles connection close gracefully

### Streaming Responses

#### Stream Database Results

```typescript
import { streamArray } from '../shared/stream.utils.js';

export async function streamUsersHandler(req: Request, res: Response) {
  const users = await db.query('SELECT * FROM users');
  await streamArray(res, users, 50); // Stream in chunks of 50
}
```

#### Stream Async Iterator

```typescript
import { streamAsyncIterator } from '../shared/stream.utils.js';

async function* generateData() {
  for (let i = 0; i < 1000; i++) {
    yield { id: i, data: `Item ${i}` };
  }
}

export async function streamDataHandler(req: Request, res: Response) {
  await streamAsyncIterator(res, generateData(), {
    transform: (item) => ({ ...item, timestamp: Date.now() })
  });
}
```

## Auth Utilities (`auth.utils.ts`)

### Password Hashing

#### Using bcrypt (recommended for most cases)

```typescript
import { hashPassword, verifyPassword } from '../shared/auth.utils.js';

// Registration
const hashedPassword = await hashPassword(req.body.password);
await db.query('INSERT INTO users (email, password) VALUES (?, ?)', 
  [email, hashedPassword]);

// Login
const user = await db.queryOne('SELECT * FROM users WHERE email = ?', [email]);
const isValid = await verifyPassword(req.body.password, user.password);

if (isValid) {
  // Generate token...
}
```

**Install**: `npm install bcrypt @types/bcrypt`

#### Using argon2 (more secure, for high-security apps)

```typescript
import { hashPasswordArgon2, verifyPasswordArgon2 } from '../shared/auth.utils.js';

const hashedPassword = await hashPasswordArgon2(req.body.password);
const isValid = await verifyPasswordArgon2(req.body.password, user.password);
```

**Install**: `npm install argon2`

### JWT Tokens

#### Generate Tokens

```typescript
import { generateToken, generateRefreshToken } from '../shared/auth.utils.js';

// Access token (7 days default)
const token = await generateToken(
  { userId: user.id, email: user.email, role: 'user' },
  process.env.JWT_SECRET
);

// Refresh token (30 days)
const refreshToken = await generateRefreshToken(
  { userId: user.id },
  process.env.JWT_REFRESH_SECRET
);
```

**Install**: `npm install jsonwebtoken @types/jsonwebtoken`

#### Verify Tokens

```typescript
import { verifyToken } from '../shared/auth.utils.js';

const payload = await verifyToken<JWTPayload>(token, process.env.JWT_SECRET);

if (!payload) {
  return res.status(401).json({ error: 'Invalid token' });
}

// Use payload.userId, payload.email, etc.
```

#### Middleware Example

```typescript
import { verifyToken } from '../shared/auth.utils.js';

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const payload = await verifyToken(token, process.env.JWT_SECRET!);
  
  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  (req as any).user = payload;
  next();
}
```

### Crypto Utilities

#### Random Tokens

```typescript
import { generateRandomToken, generateNumericCode } from '../shared/auth.utils.js';

// API key, reset token, etc.
const resetToken = generateRandomToken(32); // 64 hex chars

// OTP, verification code
const code = generateNumericCode(6); // 6-digit code
```

#### Hashing

```typescript
import { sha256, md5 } from '../shared/auth.utils.js';

const hash = sha256('data to hash');
const checksum = md5('file content'); // Use only for checksums, not security
```

#### Encryption

```typescript
import { encrypt, decrypt } from '../shared/auth.utils.js';

const secretKey = process.env.ENCRYPTION_KEY!;

// Encrypt sensitive data
const encrypted = encrypt('sensitive data', secretKey);

// Decrypt
const decrypted = decrypt(encrypted, secretKey);
```

#### Secure Comparison (prevents timing attacks)

```typescript
import { secureCompare } from '../shared/auth.utils.js';

// Compare API keys, tokens, etc.
if (secureCompare(providedKey, storedKey)) {
  // Valid
}
```

## Complete Example: User Authentication

```typescript
import { hashPassword, verifyPassword, generateToken } from '../shared/auth.utils.js';

// Register
export async function registerHandler(req: Request, res: Response) {
  const { email, password } = req.body;
  
  const hashedPassword = await hashPassword(password);
  
  await db.query(
    'INSERT INTO users (email, password) VALUES (?, ?)',
    [email, hashedPassword]
  );
  
  res.status(201).json({ message: 'User created' });
}

// Login
export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body;
  
  const user = await db.queryOne('SELECT * FROM users WHERE email = ?', [email]);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const isValid = await verifyPassword(password, user.password);
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = await generateToken(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
  
  res.json({ token });
}

// Protected Route
export async function profileHandler(req: Request, res: Response) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  const payload = await verifyToken(token!, process.env.JWT_SECRET!);
  
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const user = await db.queryOne('SELECT * FROM users WHERE id = ?', [payload.userId]);
  
  res.json({ user });
}
```

## Complete Example: SSE Progress Tracking

```typescript
import { SSEStream } from '../shared/stream.utils.js';

export async function processJobHandler(req: Request, res: Response) {
  const stream = new SSEStream(res);
  const { jobId } = req.params;
  
  try {
    // Simulate long-running job with progress updates
    for (let progress = 0; progress <= 100; progress += 10) {
      stream.send({
        jobId,
        progress,
        status: progress < 100 ? 'processing' : 'completed'
      }, 'progress');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    stream.send({ jobId, result: 'Job completed!' }, 'result');
    stream.close();
    
  } catch (error) {
    stream.sendError(error as Error);
    stream.close();
  }
}
```

Client-side JavaScript:
```javascript
const eventSource = new EventSource('/api/jobs/123/process');

eventSource.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Progress: ${data.progress}%`);
});

eventSource.addEventListener('result', (e) => {
  const data = JSON.parse(e.data);
  console.log('Result:', data.result);
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  console.error('Error:', JSON.parse(e.data));
  eventSource.close();
});
```

## Dependencies

### Required (always installed)
- None - stream utils use built-in Node.js crypto

### Optional (install as needed)
- `bcrypt` + `@types/bcrypt` - for password hashing (recommended)
- `argon2` - for password hashing (more secure alternative)
- `jsonwebtoken` + `@types/jsonwebtoken` - for JWT tokens

### Installation Commands

```bash
# Basic password + JWT (most common)
npm install bcrypt @types/bcrypt jsonwebtoken @types/jsonwebtoken

# High-security password hashing
npm install argon2

# All auth utilities
npm install bcrypt @types/bcrypt argon2 jsonwebtoken @types/jsonwebtoken
```

## Best Practices

1. **Passwords**: Use bcrypt with 12 rounds for most apps, argon2 for high-security
2. **JWT Secrets**: Use long, random strings (not hardcoded)
3. **Token Expiry**: Short for access tokens (15min-7d), long for refresh tokens (7-30d)
4. **SSE Keep-Alive**: Default 30s, adjust based on your proxy/load balancer
5. **Stream Chunking**: Balance between latency and overhead (50-100 items per chunk)
6. **Encryption**: Use environment variables for encryption keys, never hardcode
