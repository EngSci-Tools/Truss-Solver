FROM node:13

WORKDIR /usr/src/app

COPY . .
RUN rm -rf node_modules/
RUN npm install

RUN yarn build

EXPOSE 80
CMD ["node", "server.mjs"]
