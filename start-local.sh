#!/usr/bin/env bash
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  CRM Blackmoon — Inicio Local${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# ── 1. pnpm ──────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  echo -e "${YELLOW}pnpm no encontrado. Instalando...${NC}"
  npm install -g pnpm
fi
echo -e "${GREEN}✓ pnpm$(pnpm --version)${NC}"

# ── 2. .env ──────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${YELLOW}⚠  .env creado desde .env.example${NC}"
  echo -e "${YELLOW}   Edita .env con tus credenciales antes de continuar.${NC}"
  echo ""
  echo -e "   Mínimo requerido:"
  echo -e "   ${CYAN}SESSION_SECRET${NC}  — string aleatorio (genera con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"
  echo -e "   ${CYAN}MONGO_URI${NC}       — por defecto usa 127.0.0.1:27017 (o mongodb-memory-server si no hay MongoDB)"
  echo ""
  read -rp "¿Continuar con los valores por defecto? [s/N] " confirm
  [[ "$confirm" =~ ^[sS]$ ]] || { echo "Abortado. Edita .env y vuelve a ejecutar."; exit 1; }
fi

# Inyectar NODE_ENV=development si no está seteado
grep -q "^NODE_ENV=" .env || echo "NODE_ENV=development" >> .env
sed -i.bak 's/^NODE_ENV=production/NODE_ENV=development/' .env && rm -f .env.bak
echo -e "${GREEN}✓ .env listo (NODE_ENV=development)${NC}"

# ── 3. Dependencias ──────────────────────────────────────────────────────────
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo -e "${CYAN}Instalando dependencias...${NC}"
  pnpm install
fi
echo -e "${GREEN}✓ Dependencias OK${NC}"

# ── 4. MongoDB (aviso) ───────────────────────────────────────────────────────
if command -v mongod &>/dev/null; then
  if ! pgrep -x mongod &>/dev/null; then
    echo -e "${YELLOW}⚠  mongod no está corriendo. Iniciando...${NC}"
    mongod --fork --logpath /tmp/mongod.log --dbpath /tmp/mongodb-data 2>/dev/null || \
      echo -e "${YELLOW}   No se pudo iniciar mongod. El servidor usará mongodb-memory-server como fallback.${NC}"
  else
    echo -e "${GREEN}✓ MongoDB corriendo${NC}"
  fi
else
  echo -e "${YELLOW}ℹ  mongod no instalado — se usará mongodb-memory-server (datos en memoria, se pierden al reiniciar)${NC}"
fi

# ── 5. Arrancar servicios ────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}Iniciando servicios...${NC}"
echo -e "  Backend  → ${GREEN}http://localhost:3001${NC}"
echo -e "  Frontend → ${GREEN}http://localhost:5173${NC}"
echo ""
echo -e "${YELLOW}Ctrl+C para detener ambos servicios${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

pnpm dev:full
