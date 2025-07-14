# Use a lightweight Node image
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files & install deps
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Use nodemon in dev (override with Compose)
CMD ["npm", "run", "start"]
