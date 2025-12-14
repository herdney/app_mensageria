# App Mensageria 🚀

Uma plataforma centralizada para gestão de múltiplas instâncias do WhatsApp com capacidades avançadas de Agentes de IA. Construído sobre a [Evolution API v2](https://github.com/EvolutionAPI/evolution-api).

![Status](https://img.shields.io/badge/Status-Em_Desenvolvimento-yellow)
![Stack](https://img.shields.io/badge/Stack-React_Start_NodeJS_Postgres-blue)

## 📋 Visão Geral

Este projeto permite conectar e gerenciar múltiplas contas do WhatsApp em uma única interface. Além do chat em tempo real, ele oferece uma funcionalidade poderosa de **Agentes de IA**, permitindo criar assistentes virtuais personalizados (usando OpenAI) que respondem automaticamente aos clientes com base em prompts e contextos definidos.

### ✨ Principais Funcionalidades

*   **Multiatendimento & Multi-instância:** Gerencie várias conexões do WhatsApp simultaneamente.
*   **Chat em Tempo Real:** Interface reativa via Socket.io para envio e recebimento instantâneo de mensagens.
*   **🤖 Agentes de IA:**
    *   Crie agentes com personalidades e funções específicas.
    *   Defina horários de funcionamento.
    *   Configure palavras-chave de ativação.
    *   Contexto de conversa inteligente (memória das últimas mensagens).
*   **Gestão de Contatos:** Sincronização local de contatos e histórico de mensagens.
*   **Interface Moderna:** Construída com React, TailwindCSS e Shadcn/ui para uma experiência premium.

## 🛠️ Tecnologias Utilizadas

### Frontend
*   **React (Vite):** Framework principal.
*   **TypeScript:** Segurança de tipos.
*   **TailwindCSS:** Estilização.
*   **Shadcn/ui:** Componentes de UI reutilizáveis.
*   **Socket.io Client:** Comunicação em tempo real.

### Backend
*   **Node.js & Express:** Servidor API REST.
*   **PostgreSQL:** Banco de dados relacional para persistência (mensagens, contatos, agentes).
*   **Socket.io:** Websocket server.
*   **OpenAI API:** Inteligência dos agentes.

## ⚙️ Pré-requisitos

*   **Node.js** (v18 ou superior)
*   **PostgreSQL** (Banco de dados rodando localmente ou remoto)
*   **Evolution API** (Instância rodando e configurada)
*   **Chave da OpenAI** (Para uso dos Agentes)

## 🚀 Instalação e Configuração

### 1. Configurar o Backend

Navegue até a pasta do servidor:
```bash
cd server
```

Instale as dependências:
```bash
npm install
```

Crie um arquivo `.env` na pasta `server` com as seguintes variáveis:
```env
# Banco de Dados
DB_USER=postgres
DB_PASSWORD=sua_senha
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mensageria

# Servidor
PORT=3001

# Integração IA (Chave Global)
OPENAI_API_KEY=sk-...
```

Inicie o servidor (ele criará as tabelas do banco automaticamente na primeira execução):
```bash
npm start
# ou para desenvolvimento
npm run dev
```

### 2. Configurar o Frontend

Na raiz do projeto:
```bash
npm install
```

Inicie a aplicação:
```bash
npm run dev
```
Acesse `http://localhost:5173` no seu navegador.

## 📖 Como Usar

1.  **Conexão:** Vá até a aba de **Conexão**, insira a URL e API Key da sua Evolution API e crie uma nova instância (QR Code).
2.  **Agentes:** Na aba **Agentes**, configure seu assistente virtual. Ative a "Resposta Automática" para que ele comece a interagir.
3.  **Chat:** Use a tela inicial para ver seus contatos e conversar em tempo real.

## 🤝 Contribuição

Projeto desenvolvido para fins de estudo e implementação de automação com IA. Sinta-se à vontade para abrir issues ou PRs.
