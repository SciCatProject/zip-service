FROM node:10.16.1-alpine
ENV http_proxy "http://172.18.12.30:8123"
ENV https_proxy $http_proxy
RUN npm config set proxy  $http_proxy
RUN npm config set https-proxy  $http_proxy
RUN npm config set registry http://registry.npmjs.org/
RUN npm config set strict-ssl false
WORKDIR /files
WORKDIR /home/node/app
COPY . .
RUN npm install --no-cache
CMD ["npm", "start"]
