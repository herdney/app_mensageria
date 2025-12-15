# ==========================================
# Production Server (Single Stage)
# ==========================================
FROM node:20-slim

WORKDIR /app/server

# Copy backend package files
COPY server/package*.json ./

# Install backend dependencies (production only)
RUN npm install --only=production

# Copy backend source code
COPY server/ .

# Create public directory
RUN mkdir -p public

# Copy locally built frontend assets (dist must exist locally)
COPY dist/ ./public

# Expose port
EXPOSE 3001

# Environment variables
ENV PORT=3001
ENV NODE_ENV=production

# Start application
CMD ["node", "index.js"]
