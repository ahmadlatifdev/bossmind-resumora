FROM node:20-slim

# FFmpeg for serverless video assembly.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
