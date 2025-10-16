FROM node:18

WORKDIR /app

# Copy package files and install deps
COPY package*.json ./
RUN npm install

# Copy Tailwind + PostCSS config files explicitly
COPY tailwind.config.js postcss.config.js ./

# Copy the rest of your frontend source
COPY . .

# Give write permissions to all users for the build folder
RUN mkdir -p /app/.next && chmod -R 777 /app


EXPOSE 3000

CMD ["npm", "run", "dev"]

# For production you’d use:
# RUN npm run build
# CMD ["npm", "start"]
