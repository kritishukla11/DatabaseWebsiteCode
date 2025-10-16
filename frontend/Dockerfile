FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tailwind.config.js postcss.config.js ./
COPY . .

# Build the static Next.js site
RUN npm run build

# Ensure runtime has write permission (good practice for OpenShift)
RUN chmod -R 777 /app

EXPOSE 3000
CMD ["npm", "start"]
