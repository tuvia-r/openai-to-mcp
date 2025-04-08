FROM node:22-slim as builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Copy the entire project to the working directory
COPY . .

# Install the dependencies and devDependencies
RUN npm install

# Build the project
RUN npm run build

# Use a smaller base image for the final image
FROM node:22-alpine AS release

# Set the working directory
WORKDIR /app

# Copy only the necessary files from the builder stage
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

# Install only production dependencies
RUN npm ci --omit=dev

# Define environment variables
ENV NODE_ENV=production


# Command to run the application
CMD ["node", "dist/src/index.js"]
