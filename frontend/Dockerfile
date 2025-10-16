FROM node:18

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tailwind.config.js postcss.config.js ./
COPY . .

# Disable ESLint blocking during builds
ENV NEXT_DISABLE_ESLINT=1
RUN npm run build

RUN chmod -R 777 /app
EXPOSE 3000
CMD ["npm", "start"]
