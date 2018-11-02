FROM node:8
WORKDIR /home/node/app
COPY package.json package-lock.json ./
RUN npm install --no-cache
COPY . .
CMD ["npm", "start"]
