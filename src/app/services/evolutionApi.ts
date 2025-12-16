// EvolutionApiService.ts

export type InstanceInfoBase = {
  instanceName: string;
  instanceId: string;
  status: string;
};

export type PairingInfo = {
  base64?: string;
  code?: string; // Raw pairing code
  pairingCode?: string;
};

export interface CreateInstanceResponse {
  instance: InstanceInfoBase;
  hash: { apikey: string };
  qrcode?: PairingInfo | string; // às vezes vem string base64 direto
}

export interface ConnectInstanceResponse {
  instance: InstanceInfoBase & {
    ownerJid?: string;
    profilePicUrl?: string;
  };
  // Algumas versões retornam QR/pairing fora de "qrcode"
  base64?: string;
  code?: string;
}

const BASIC_WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "SEND_MESSAGE"] as const;

const FULL_WEBHOOK_EVENTS = [
  "APPLICATION_STARTUP",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "SEND_MESSAGE_UPDATE",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "PRESENCE_UPDATE",
  "CHATS_SET",
  "CHATS_UPSERT",
  "CHATS_UPDATE",
  "CHATS_DELETE",
  "GROUPS_UPSERT",
  "GROUPS_UPDATE",
  "GROUP_PARTICIPANTS_UPDATE",
  "CONNECTION_UPDATE",
  "SEND_MESSAGE",
] as const;

type Json = Record<string, any>;

export class EvolutionApiService {
  private baseUrl: string;
  private globalApiKey: string | null;

  constructor(baseUrl: string, globalApiKey: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.globalApiKey = globalApiKey;
  }

  private getHeaders(apiKey?: string): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const key = apiKey ?? this.globalApiKey;
    if (key) headers["apikey"] = key;

    return headers;
  }

  private async safeJson(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      // fallback para body texto (às vezes API responde text/plain)
      const text = await response.text().catch(() => "");
      return text ? { message: text } : {};
    }
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit & { apiKey?: string } = {},
    opts: { allow404?: boolean; emptyOn404?: any } = {}
  ): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: init.headers ?? this.getHeaders(init.apiKey),
    });

    if (!response.ok) {
      if (opts.allow404 && response.status === 404) {
        return opts.emptyOn404 as T;
      }
      const errorData = await this.safeJson(response);
      throw new Error(errorData?.message || errorData?.error || `HTTP ${response.status}`);
    }

    return (await this.safeJson(response)) as T;
  }

  // ---------- Instances ----------

  async createInstance(
    instanceName: string,
    token: string = "",
    description: string = "",
    webhookUrl: string = ""
  ): Promise<CreateInstanceResponse> {
    const body: Json = {
      instanceName,
      token,
      description,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    };

    if (webhookUrl) {
      // Mantém o payload original do seu createInstance
      body.webhook = {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: [...BASIC_WEBHOOK_EVENTS],
      };
    }

    return this.requestJson<CreateInstanceResponse>(`${this.baseUrl}/instance/create`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
  }

  async connectInstance(instanceName: string, apiKey?: string): Promise<ConnectInstanceResponse> {
    return this.requestJson<ConnectInstanceResponse>(
      `${this.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
      { method: "GET", headers: this.getHeaders(apiKey) }
    );
  }

  async fetchInstances(apiKey?: string): Promise<any[]> {
    const data = await this.requestJson<any>(
      `${this.baseUrl}/instance/fetchInstances`,
      { method: "GET", headers: this.getHeaders(apiKey) }
    );

    return Array.isArray(data) ? data : [];
  }

  async getConnectionState(instanceName: string, apiKey?: string): Promise<any | null> {
    return this.requestJson<any | null>(
      `${this.baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { method: "GET", headers: this.getHeaders(apiKey) },
      { allow404: true, emptyOn404: null }
    );
  }

  async logoutInstance(instanceName: string, apiKey?: string): Promise<any> {
    return this.requestJson<any>(`${this.baseUrl}/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: this.getHeaders(apiKey),
    });
  }

  async deleteInstance(instanceName: string, apiKey?: string): Promise<any> {
    // Mantém regra: ignora 404
    return this.requestJson<any>(
      `${this.baseUrl}/instance/delete/${encodeURIComponent(instanceName)}`,
      { method: "DELETE", headers: this.getHeaders(apiKey) },
      { allow404: true, emptyOn404: {} }
    ).catch((err) => {
      // Se vier algum erro que não seja 404, propaga
      throw err;
    });
  }

  // ---------- Webhook ----------

  async setWebhook(
    instanceName: string,
    webhookUrl: string,
    params: {
      enabled?: boolean;
      events?: string[];
      webhookByEvents?: boolean;
      webhookBase64?: boolean;
      apiKey?: string;
    } = {}
  ): Promise<any> {
    const {
      enabled = true,
      events = [...FULL_WEBHOOK_EVENTS],
      webhookByEvents = true,
      webhookBase64 = true,
      apiKey,
    } = params;

    // Mantém o payload original do seu setWebhook
    const body = {
      enabled,
      url: webhookUrl,
      webhookByEvents,
      webhookBase64,
      events,
    };

    return this.requestJson<any>(`${this.baseUrl}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: this.getHeaders(apiKey),
      body: JSON.stringify(body),
    });
  }

  async findWebhook(instanceName: string, apiKey?: string): Promise<any | null> {
    try {
      return await this.requestJson<any | null>(
        `${this.baseUrl}/webhook/find/${encodeURIComponent(instanceName)}`,
        { method: "GET", headers: this.getHeaders(apiKey) },
        { allow404: true, emptyOn404: null }
      );
    } catch {
      return null; // mantém sua decisão de não quebrar a listagem
    }
  }

  // ---------- Messaging (proxy local) ----------

  async sendTextMessage(
    instanceName: string,
    number: string,
    text: string,
    delay: number = 1200
  ): Promise<any> {
    // Mantém: usa proxy local e sem apikey
    return this.requestJson<any>(
      `/message/sendText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName, number, text, delay }),
      }
    );
  }

  // ---------- Chats / Messages ----------

  async fetchChats(instanceName: string): Promise<any[]> {
    try {
      const data = await this.requestJson<any[]>(
        `${this.baseUrl}/chat/findChats/${encodeURIComponent(instanceName)}`,
        { method: "POST", headers: this.getHeaders() }
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async fetchMessages(instanceName: string, remoteJid: string, limit: number = 50): Promise<any[]> {
    try {
      const data = await this.requestJson<any>(
        `${this.baseUrl}/chat/findMessages/${encodeURIComponent(instanceName)}`,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            where: { key: { remoteJid } },
            options: { limit, sort: { messageTimestamp: "desc" } },
          }),
        },
        { allow404: true, emptyOn404: [] }
      );

      return Array.isArray(data) ? data : (data?.messages || data?.records || []);
    } catch {
      return [];
    }
  }
}
