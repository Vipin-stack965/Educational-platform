FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_SERVER_URL
ARG VITE_FIREBASE_APIKEY
ENV VITE_SERVER_URL=$VITE_SERVER_URL
ENV VITE_FIREBASE_APIKEY=$VITE_FIREBASE_APIKEY

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
