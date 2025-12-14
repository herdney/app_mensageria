
# Aplicação Web de Mensageria

This is a code bundle for Aplicação Web de Mensageria. The original project is available at https://www.figma.com/design/oQWY9jenXj8hKMxodVx75A/Aplica%C3%A7%C3%A3o-Web-de-Mensageria.

## Running the code

Run `npm i` to install the dependencies.

Run `npm run dev` to start the development server.

## Funcionalidades Implementadas

### 1. Sistema de Chat & Mensagens
*   **Envio de Mensagens:** Envio de mensagens de texto simples para números individuais.
*   **Recebimento em Tempo Real:** As mensagens recebidas aparecem instantaneamente na interface (via WebSocket/Socket.io) sem precisar recarregar a página.
*   **Histórico Persistente:** Todas as mensagens são salvas no banco de dados (PostgreSQL) e carregadas ao abrir a conversa.
*   **Interface Otimista:** A mensagem enviada aparece na hora para o usuário para maior fluidez.

### 2. Gestão de Contatos (Sidebar)
*   **Lista Dinâmica:** Ordenação automática (contatos com mensagens mais recentes ficam no topo).
*   **Novo Chat:** Capacidade de iniciar conversa com um número que não está na agenda.
*   **Busca:** Campo de pesquisa para filtrar contatos pelo nome ou telefone.
*   **Enriquecimento de Dados:** Busca automática de Nome e Foto de Perfil na API do WhatsApp.
*   **Atualização Manual:** Botão de "Refresh" para sincronizar a lista com o banco de dados.

### 3. Tratamento de Erros e Validações
*   **Detecção de Números Inválidos:** Aviso claro ("Este número não possui uma conta") para números inexistentes.
*   **Auto-correção da Lista:** Remoção automática de contatos inválidos da lista lateral.
*   **Feedback Visual:** Notificações (Toasts) de sucesso, erro e conexão.

### 4. Gestão de Instâncias (Conexão)
*   **Conexão QR Code:** Geração de QR Code via Evolution API.
*   **Múltiplas Instâncias:** Suporte para salvar e alternar entre diferentes instâncias.
*   **Configuração Automática:** Webhook configurado automaticamente ao conectar.

### 5. Backend (Server)
*   **Webhook Inteligente:** Processamento normalize de eventos `UPSERT` e `SEND.MESSAGE`.
*   **Persistência SQL:** Banco de dados PostgreSQL (tabelas `messages`, `contacts`, `evolution_hosts`).
*   **Endpoint de Limpeza:** Rota `/database/clear` para resetar o banco.
