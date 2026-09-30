FROM node:24.13.1-alpine

WORKDIR /home/node/app

# Install production dependencies only
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source code and scripts (excluding tests and sensitive files via .dockerignore)
COPY --chown=node:node src/ ./src/
COPY --chown=node:node scripts/ ./scripts/

# Switch to unprivileged user
USER node

# Expose backend REST API port
EXPOSE 5000

# Start production server
CMD ["node", "src/server.js"]
