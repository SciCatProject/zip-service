FROM node:14-alpine
WORKDIR /home/node/app
COPY . .
RUN npm install --no-cache
CMD ["node", "dist/index.js"]
