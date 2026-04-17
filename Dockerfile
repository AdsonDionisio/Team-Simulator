# Estágio de construção
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm install

# Copiar código fonte
COPY . .

# Variável de ambiente durante a construção (Vite precisa disso para o 'define')
# Se for usar build-args para passar a chave:
# ARG GEMINI_API_KEY
# ENV GEMINI_API_KEY=$GEMINI_API_KEY

RUN npm run build

# Estágio de produção
FROM nginx:stable-alpine

# Copiar build do estágio anterior
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuração customizada do Nginx para suportar roteamento SPA (se necessário)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
