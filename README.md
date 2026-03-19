# Read and Sign - Aviation Ground Handling

Full-stack document signing and reading compliance application.

## Quick Start

### Local Development
```bash
cd app
docker compose up -d
# Access at http://localhost
```

### Production Deployment (Render)

1. **Set up environment variables on Render:**
   - `DB_PASSWORD` - Strong PostgreSQL password
   - `JWT_SECRET` - Random 32+ char string
   - `SIGNING_SECRET` - Random string
   - `APP_URL` - Your Render app URL (e.g., https://readandsign.onrender.com)
   - `BACKEND_IMAGE` - matuskobozo/readandsign-backend:prod
   - `FRONTEND_IMAGE` - matuskobozo/readandsign-frontend:prod

2. **Deploy:**
   - Connect GitHub repo to Render
   - Create Web Service → Docker Compose
   - Point to `docker-compose.render.yml`
   - Set environment variables
   - Deploy

## Architecture

- **Frontend**: React + TypeScript (Nginx)
- **Backend**: Node.js + Fastify + TypeScript
- **Database**: PostgreSQL 16
- **Signing**: PDF signing with digital certificates
- **Storage**: Local file uploads

## Environment Variables

```env
DB_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret_32_chars_plus
SIGNING_SECRET=your_signing_secret
APP_URL=https://your-app-url.onrender.com
```

## Development

```bash
# Install dependencies
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build

# Run locally
cd .. && docker compose up
```

## Features

- User authentication (JWT + refresh tokens)
- Document versioning and publishing
- Digital signing with audit trail
- Compliance matrix & reporting
- Quiz/reading comprehension
- Organizations & sections management
- File upload & storage
