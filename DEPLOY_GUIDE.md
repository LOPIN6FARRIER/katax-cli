# 🚀 Katax Deploy Commands

Complete PM2 deployment workflow for Ubuntu VPS.

## Commands Overview

### `katax deploy init`
**First-time deployment** - Clone repository and setup PM2

**Interactive prompts:**
- Application name for PM2
- Repository connection (HTTPS or SSH)
- Git repository URL
- Branch to deploy
- Installation path (absolute)
- PM2 instances (1, 2, 4, or max)
- Max memory per instance
- Environment variables

**What it does:**
1. Clones repository to specified path
2. Installs dependencies (`npm install`)
3. Builds project (`npm run build`)
4. Generates `ecosystem.config.cjs` for PM2
5. Starts application with PM2
6. Saves PM2 configuration

**Example:**
```bash
$ katax deploy init

# Will prompt for:
# - App name: my-api
# - Repo: https://github.com/user/my-api.git
# - Branch: main
# - Path: /home/ubuntu/apps
# - Instances: max
# - Memory: 512M
# - Env vars: PORT=3000, DB_HOST=localhost, etc.
```

---

### `katax deploy update`
**Update existing deployment** - Pull latest changes and restart

**Options:**
- `-b, --branch <branch>` - Branch to deploy (default: current branch)
- `--hard` - Hard reset (discard all local changes)

**What it does:**
1. Fetches latest code from git
2. Pulls/resets to specified branch
3. Installs dependencies
4. Rebuilds project
5. Restarts PM2 application

**Examples:**
```bash
# Update current branch
$ katax deploy update

# Update specific branch
$ katax deploy update -b develop

# Hard reset and update (discards local changes)
$ katax deploy update --hard
```

**Run from:** Your deployed project directory (e.g., `/home/ubuntu/apps/my-api`)

---

### `katax deploy rollback`
**Rollback to previous version**

**Options:**
- `-c, --commits <number>` - Number of commits to rollback (default: 1)

**What it does:**
1. Resets git to previous commit(s)
2. Reinstalls dependencies
3. Rebuilds project
4. Restarts PM2

**Examples:**
```bash
# Rollback 1 commit
$ katax deploy rollback

# Rollback 3 commits
$ katax deploy rollback -c 3
```

---

### `katax deploy logs`
**View PM2 application logs**

**Options:**
- `-l, --lines <number>` - Number of lines to display
- `-f, --follow` - Follow log output (live tail)

**Examples:**
```bash
# View last logs
$ katax deploy logs

# View last 100 lines
$ katax deploy logs -l 100

# Follow logs (live)
$ katax deploy logs -f
```

---

### `katax deploy status`
**Show PM2 applications status**

Shows all PM2 processes with:
- App name
- Status (online/stopped)
- CPU usage
- Memory usage
- Uptime
- Restarts count

**Example:**
```bash
$ katax deploy status

# Output:
# ┌─────┬──────────┬─────────┬─────────┬─────────┬──────────┐
# │ id  │ name     │ mode    │ ↺       │ status  │ cpu      │
# ├─────┼──────────┼─────────┼─────────┼─────────┼──────────┤
# │ 0   │ my-api   │ cluster │ 0       │ online  │ 0.3%     │
# └─────┴──────────┴─────────┴─────────┴─────────┴──────────┘
```

---

## Complete Deployment Workflow

### 1. First Deployment (from local machine)

```bash
# Step 1: Build and test locally
npm run build
npm start

# Step 2: SSH to your Ubuntu VPS
ssh ubuntu@your-vps-ip

# Step 3: Install PM2 globally
npm install -g pm2

# Step 4: Run initial deployment
npx katax deploy init

# Follow prompts:
# - App name: my-api
# - Repo: https://github.com/yourusername/my-api.git
# - Branch: main
# - Path: /home/ubuntu/apps
# - Instances: max
# - Memory: 512M
# - Add env vars (PORT, DB credentials, JWT secrets, etc.)

# Step 5: Setup PM2 startup script
pm2 startup
# Follow the command it outputs

# Step 6: Verify
pm2 list
pm2 logs my-api
```

### 2. Update Deployment (when you push new code)

```bash
# SSH to VPS
ssh ubuntu@your-vps-ip

# Navigate to project
cd /home/ubuntu/apps/my-api

# Update deployment
katax deploy update

# Or force update (discard local changes)
katax deploy update --hard

# Check logs
katax deploy logs -f
```

### 3. Rollback (if update breaks something)

```bash
cd /home/ubuntu/apps/my-api
katax deploy rollback

# Or rollback multiple commits
katax deploy rollback -c 3
```

---

## Generated PM2 Configuration

The `katax deploy init` command generates `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: 'my-api',
    script: './dist/index.js',
    
    // Cluster mode
    instances: 'max',
    exec_mode: 'cluster',
    
    // Resource limits
    max_memory_restart: '512M',
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Auto restart
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Environment variables
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      DB_HOST: 'localhost',
      // ... your env vars
    }
  }]
};
```

---

## SSH vs HTTPS Repository Access

### HTTPS (Recommended for beginners)
- Use GitHub Personal Access Token
- No SSH key setup required
- Prompted for credentials on clone

**Example URL:**
```
https://github.com/username/my-api.git
```

### SSH (Recommended for production)
- Passwordless deployments
- More secure
- Requires SSH key setup on VPS

**Setup SSH on VPS:**
```bash
# Generate SSH key on VPS
ssh-keygen -t ed25519 -C "your-vps-key"

# Copy public key
cat ~/.ssh/id_ed25519.pub

# Add to GitHub Settings > SSH Keys
```

**Example URL:**
```
git@github.com:username/my-api.git
```

---

## PM2 Useful Commands

```bash
# List all processes
pm2 list

# Restart app
pm2 restart my-api

# Stop app
pm2 stop my-api

# Delete app
pm2 delete my-api

# View logs
pm2 logs my-api
pm2 logs my-api --lines 100

# Monitor resources
pm2 monit

# Reload with zero downtime
pm2 reload my-api

# Save current PM2 state
pm2 save

# Resurrect saved processes
pm2 resurrect
```

---

## Troubleshooting

### PM2 not found
```bash
npm install -g pm2
```

### Port already in use
```bash
# Change PORT in ecosystem.config.cjs
# Or kill existing process:
lsof -ti:3000 | xargs kill -9
```

### Permission denied
```bash
# Use sudo or fix npm global permissions
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

### Build fails
```bash
# Check Node.js version
node --version  # Should be >=18

# Update Node.js on Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Git authentication fails
```bash
# For HTTPS: Use Personal Access Token
git config credential.helper store

# For SSH: Check SSH key
ssh -T git@github.com
```

---

## Environment Variables Best Practices

**Never commit sensitive data!**

1. Use `.env` file locally
2. Add to `.gitignore`
3. Set via `katax deploy init` prompts
4. Or manually edit `ecosystem.config.cjs`

**Example secure deployment:**
```bash
# On VPS, store secrets in ecosystem.config.cjs
env_production: {
  NODE_ENV: 'production',
  PORT: 3000,
  
  // Database
  DB_HOST: 'localhost',
  DB_USER: 'api_user',
  DB_PASSWORD: 'strong_password_here',
  DB_NAME: 'my_api_db',
  
  // JWT
  JWT_SECRET: 'your-super-secret-jwt-key-256-bits',
  JWT_REFRESH_SECRET: 'another-secret-key',
  
  // External APIs
  STRIPE_SECRET: 'sk_live_...',
  SENDGRID_API_KEY: 'SG...'
}
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `katax deploy init` | First-time deployment |
| `katax deploy update` | Update deployment |
| `katax deploy update --hard` | Force update (reset) |
| `katax deploy rollback` | Rollback 1 commit |
| `katax deploy rollback -c 3` | Rollback 3 commits |
| `katax deploy logs -f` | Follow logs |
| `katax deploy status` | Check PM2 status |
| `pm2 list` | List all processes |
| `pm2 monit` | Resource monitor |
| `pm2 restart <app>` | Restart app |
| `pm2 save` | Save PM2 state |

---

**Ready to deploy! 🚀**
