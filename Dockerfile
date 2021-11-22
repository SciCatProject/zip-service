FROM node:16-alpine

ENV NODE_ENV="production"
ENV PORT=3012
EXPOSE 3012

# ENV http_proxy "http://172.18.12.30:8123"
# ENV https_proxy $http_proxy
RUN apk update && apk upgrade

WORKDIR /home/node/app
COPY package*.json /home/node/app/
COPY .snyk /home/node/app/

# RUN npm config set proxy  $http_proxy
# RUN npm config set https-proxy  $http_proxy
# RUN npm config set registry http://registry.npmjs.org/
# RUN npm config set strict-ssl false
RUN npm ci

COPY . .
COPY CI/ESS/local.config.json src/

RUN npm run build

CMD ["node", "dist/index.js"]