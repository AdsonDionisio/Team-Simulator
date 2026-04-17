# Estágio de construção
FROM node:20-slim AS builder

WORKDIR /app

# Instalar dependências
COPY package*.json ./
RUN npm install

# Copiar código fonte
COPY . .

# Build da aplicação frontend + compilação do server.ts
RUN npm run build

# Estágio de produção
FROM node:20-slim

WORKDIR /app

# Copiar apenas o necessário
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV OLLAMA_URL=http://ollama:11434
ENV OLLAMA_MODEL=llama3.2:3b

EXPOSE 3000

CMD ["npm", "run", "start"]
