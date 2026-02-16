FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache git

COPY deployer/package.json ./package.json
COPY deployer/package-lock.json ./package-lock.json
RUN npm install

RUN git clone --depth=1 https://github.com/safe-global/safe-smart-account.git /app/vendor/safe-smart-account

COPY deployer/hardhat.config.js ./hardhat.config.js
COPY deployer/src ./src
COPY deployer/contracts ./contracts

CMD ["node", "--import", "tsx", "/app/src/deploy.ts"]
