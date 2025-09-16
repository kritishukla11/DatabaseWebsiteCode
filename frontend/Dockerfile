FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# For production you’d swap to:
# RUN npm run build
# CMD ["npm", "start"]