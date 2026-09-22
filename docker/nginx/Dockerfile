FROM nginx:1.27-alpine

# Remove default configuration
RUN rm -rf /etc/nginx/conf.d/default.conf

# Create directory for static web files and protected challenge downloads
RUN mkdir -p /usr/share/nginx/html /data/challenges/static

# Copy default offline landing/splash page (used until frontend is built)
COPY docker/nginx/index.html /usr/share/nginx/html/index.html

# Default to LAN configuration
COPY docker/nginx/nginx.lan.conf /etc/nginx/nginx.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
