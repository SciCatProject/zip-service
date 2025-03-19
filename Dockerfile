FROM node:18-alpine

EXPOSE 3011

WORKDIR /home/node/app
COPY package*.json /home/node/app/

RUN npm ci --no-cache

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
