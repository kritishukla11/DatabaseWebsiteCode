FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tailwind.config.js postcss.config.js ./
# Copy environment file
COPY .env .env
COPY . .


# --- Environment configuration (must come BEFORE build) ---
ENV NEXT_DISABLE_ESLINT=1
ENV NEXT_SKIP_BUILD_STATIC_GENERATION=true


# --- Build ---
RUN npm run build

# --- Runtime fixes ---
RUN chmod -R 777 /app

EXPOSE 3000
CMD ["npm", "start"]

