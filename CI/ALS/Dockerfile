FROM node:14-alpine
WORKDIR /home/node/app
COPY . .
EXPOSE 3011
RUN npm ci --no-cache
RUN npm run build
COPY CI/ALS/local.config.json dist/local.config.json
CMD ["node", "dist/index.js"]
