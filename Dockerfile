FROM node:14-alpine

RUN apk update && apk upgrade

EXPOSE 3011

WORKDIR /home/node/app
COPY package*.json /home/node/app/
COPY .snyk /home/node/app/

RUN npm config set registry http://registry.npmjs.org/
RUN npm config set strict-ssl false
RUN npm ci --no-cache

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
