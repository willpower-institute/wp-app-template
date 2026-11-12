# Google Cloud Run (ปุ่ม Run on Google Cloud) หรือ Docker ทั่วไป
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY wp.config.js ./
COPY server ./server
COPY contract ./contract
COPY deploy ./deploy
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "deploy/node.js"]
