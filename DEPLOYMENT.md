# Deployment Guide

## Quick Deploy (5 minutes)

### Prerequisites
- Docker Desktop or Docker Engine
- Docker Compose v1.29+
- 2GB available disk space

### Step 1: Navigate to the app directory
```bash
cd "/sessions/festive-gracious-feynman/mnt/Read and Sign/app"
```

### Step 2: Configure environment (optional)
Copy and customize environment variables:
```bash
cp .env.example .env
```

Edit `.env` to change:
- `JWT_SECRET` - Change in production
- `SIGNING_SECRET` - Change in production
- `SEED=true` - Set to false after first run to skip seeding

### Step 3: Build and start services
```bash
docker compose up --build
```

Initial startup takes 30-60 seconds:
1. PostgreSQL initializes (5-10s)
2. Backend builds and seeds data (15-20s)
3. Frontend builds (30-45s)
4. Services become ready

### Step 4: Access the application
- **Frontend**: http://localhost
- **API Health**: http://localhost:3000/health
- **Login**: admin@demo.com / Admin123!

## Service Details

### PostgreSQL (port 5432)
- Database: readandsign
- User: ras
- Password: ras_secret
- Default volume: pgdata
- Data persists across restarts

### Backend (port 3000)
- Node.js Fastify server
- Auto-initializes database schema
- Auto-seeds demo data (if SEED=true)
- Swagger/OpenAPI: Not included (MVP)
- Health check: GET /health

### Frontend (port 80)
- React SPA built with Vite
- Nginx reverse proxy
- Proxies /api/* to backend:3000
- SPA routing configured (try_files)

## Verification Checklist

After `docker compose up`:

```bash
# Check services are running
docker compose ps

# Should show:
# - db         (postgres:16-alpine) - Up
# - backend    (node:20-alpine)     - Up
# - frontend   (nginx:alpine)       - Up

# Check API is responding
curl http://localhost:3000/health
# Should return: {"status":"ok"}

# Check logs
docker compose logs backend    # View app logs
docker compose logs db         # View database logs
docker compose logs frontend   # View nginx logs

# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}'

# Should return access token and user object
```

## Database Seeding

On first run with `SEED=true`, the following is created:

- 1 Organization: "Demo Aviation GH"
- 2 Sections: "Ramp Operations", "Passenger Services"
- 7 Users:
  - 1 Super Admin
  - 2 Section Admins
  - 4 Regular Users
- 1 Group: "Morning Shift" (2 members)
- 3 Documents: Sample PDFs with metadata
- 6 Assignments: Pre-assigned with partial reading progress

To reseed after changes:
```bash
docker compose down -v  # Remove volume
docker compose up       # Fresh database with new seed
```

## Database Management

### Connect to PostgreSQL
```bash
docker compose exec db psql -U ras -d readandsign
```

### Backup database
```bash
docker compose exec db pg_dump -U ras readandsign > backup.sql
```

### Restore from backup
```bash
docker compose exec db psql -U ras readandsign < backup.sql
```

### View logs
```bash
docker compose logs db --tail 50 --follow
```

## File Storage

### PDF Upload Directory
- Host: `/sessions/festive-gracious-feynman/mnt/Read and Sign/app/uploads`
- Container: `/uploads`
- Persists across restarts (Docker volume: `uploads`)

### Cleanup
```bash
# Remove all uploaded files (keep others)
docker volume rm readandsign_uploads  # Will cause error if not empty
# Or delete specific files from host
rm -rf "/sessions/festive-gracious-feynman/mnt/Read and Sign/app/uploads"/*
```

## Production Deployment

### Before Production
1. Change `JWT_SECRET` and `SIGNING_SECRET` in .env (use 32+ char random strings)
2. Set `SEED=false` to prevent demo data
3. Configure PostgreSQL password (change `ras_secret`)
4. Set `NODE_ENV=production`
5. Configure SSL/TLS certificates
6. Set up automated backups

### Environment Variables for Production
```bash
DATABASE_URL=postgres://ras:YOUR_SECURE_PASSWORD@db:5432/readandsign
JWT_SECRET=your_random_32char_secret_key_here
SIGNING_SECRET=another_random_32char_secret_here
UPLOAD_DIR=/uploads
NODE_ENV=production
SEED=false
```

### Port Configuration
- Change frontend port: Edit `docker-compose.yml` `frontend: ports: ["8080:80"]`
- Change backend port: Edit environment variable `PORT=3001`
- Change database port: Edit `db: ports: ["5433:5432"]`

### SSL/TLS Setup
Add to nginx/nginx.conf:
```nginx
server {
    listen 443 ssl http2;
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    # ... rest of config
}
```

### Scaling
```bash
# Run multiple backend instances
docker compose up --scale backend=3

# Load balance with nginx configuration
```

## Troubleshooting

### Port already in use
```bash
# Change ports in docker-compose.yml
# Or kill existing process
lsof -i :80    # Find process on port 80
kill -9 <PID>
```

### Database won't start
```bash
docker compose down -v    # Remove volume
docker compose up --build # Rebuild from scratch
```

### Backend can't connect to database
```bash
# Check database is healthy
docker compose ps
# Check logs
docker compose logs db
# Wait a bit more (db initialization takes time)
sleep 10 && docker compose logs backend
```

### Frontend showing 502 Bad Gateway
```bash
# Backend may not be ready yet
docker compose logs backend
# Wait for "listening on port 3000" message
```

### Clear all data and start fresh
```bash
docker compose down -v    # Remove all volumes
rm -rf uploads/*          # Clear uploads
docker compose up --build # Fresh start with seed
```

## Monitoring

### Check service health
```bash
# All services running
docker compose ps

# Individual health
curl http://localhost:3000/health           # Backend
curl -I http://localhost/                   # Frontend (should 200 or redirect)
docker compose exec db pg_isready -U ras   # Database
```

### View real-time logs
```bash
docker compose logs -f        # All services
docker compose logs -f backend  # Just backend
docker compose logs -f db     # Just database
```

### Database size
```bash
docker compose exec db psql -U ras readandsign -c \
  "SELECT pg_size_pretty(pg_database_size('readandsign'));"
```

## Maintenance

### Stop services (data persists)
```bash
docker compose stop
```

### Start services (resume from stopped state)
```bash
docker compose start
```

### Full restart
```bash
docker compose restart
```

### Remove everything (WARNING: deletes all data)
```bash
docker compose down -v
```

## Support

Check logs for errors:
```bash
docker compose logs --tail 100 backend | grep -i error
docker compose logs --tail 100 db | grep -i error
```

Common issues:
- "connect ECONNREFUSED" - Backend hasn't started yet, wait 30 seconds
- "relation does not exist" - Database schema didn't initialize, check logs
- "token expired" - Clear browser cookies and login again
- "PDF not found" - Check /uploads directory exists and is writable

