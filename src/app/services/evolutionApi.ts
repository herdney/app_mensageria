export interface CreateInstanceResponse {
    instance: {
        instanceName: string;
        instanceId: string;
        status: string;
    };
    hash: {
        apikey: string;
    };
    qrcode?: {
        base64: string;
        code?: string; // Raw pairing code
        pairingCode?: string;
    } | string; // Sometimes returns just the base64 string directly
}

export interface ConnectInstanceResponse {
    instance: {
        instanceName: string;
        instanceId: string;
        status: string;
        ownerJid?: string;
        profilePicUrl?: string;
    };
    base64?: string;
    code?: string; // Raw pairing code
}

export class EvolutionApiService {
    private baseUrl: string;
    private globalApiKey: string | null;

    constructor(baseUrl: string, globalApiKey: string | null = null) {
        this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
        this.globalApiKey = globalApiKey;
    }

    private getHeaders(apiKey?: string): HeadersInit {
        const headers: HeadersInit = {
            "Content-Type": "application/json",
        };

        if (this.globalApiKey) {
            headers["apikey"] = this.globalApiKey;
        }

        if (apiKey) {
            headers["apikey"] = apiKey;
        }

        return headers;
    }

    async createInstance(
        instanceName: string,
        token: string = "",
        description: string = "",
        webhookUrl: string = ""
    ): Promise<CreateInstanceResponse> {
        try {
            const body: any = {
                instanceName,
                token,
                description,
                qrcode: true, // Auto-generate QR on create
                integration: "WHATSAPP-BAILEYS",
            };

            if (webhookUrl) {
                body.webhook = {
                    url: webhookUrl,
                    byEvents: false,
                    base64: true,
                    events: ["MESSAGES_UPSERT", "SEND_MESSAGE"]
                };
            }

            const response = await fetch(`${this.baseUrl}/instance/create`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to create instance");
            }

            return await response.json();
        } catch (error) {
            console.error("Error creating instance:", error);
            throw error;
        }
    }

    async connectInstance(instanceName: string, apiKey?: string): Promise<ConnectInstanceResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/instance/connect/${instanceName}`, {
                method: "GET",
                headers: this.getHeaders(apiKey),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to connect instance");
            }

            return await response.json();
        } catch (error) {
            console.error("Error connecting instance:", error);
            throw error;
        }
    }

    async fetchInstances(apiKey?: string): Promise<any[]> {
        try {
            const response = await fetch(`${this.baseUrl}/instance/fetchInstances`, {
                method: "GET",
                headers: this.getHeaders(apiKey),
            });

            if (!response.ok) {
                throw new Error("Failed to fetch instances");
            }

            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error("Error fetching instances:", error);
            throw error;
        }
    }

    async getConnectionState(instanceName: string, apiKey?: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/instance/connectionState/${instanceName}`, {
                method: "GET",
                headers: this.getHeaders(apiKey),
            });

            if (!response.ok) {
                // validating 404 or other errors
                if (response.status === 404) {
                    return null; // Instance not found
                }
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || "Failed to get connection state");
            }

            return await response.json();
        } catch (error) {
            console.error("Error getting connection state:", error);
            throw error;
        }
    }
    async logoutInstance(instanceName: string, apiKey?: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/instance/logout/${instanceName}`, {
                method: "DELETE",
                headers: this.getHeaders(apiKey),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || "Failed to logout instance");
            }

            return await response.json();
        } catch (error) {
            console.error("Error logging out instance:", error);
            throw error;
        }
    }

    async deleteInstance(instanceName: string, apiKey?: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/instance/delete/${instanceName}`, {
                method: "DELETE",
                headers: this.getHeaders(apiKey),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                // Ignore 404 on delete
                if (response.status !== 404) {
                    throw new Error(errorData.message || "Failed to delete instance");
                }
            }

            return await response.json().catch(() => ({}));
        } catch (error) {
            console.error("Error deleting instance:", error);
            throw error;
        }
    }
    async setWebhook(instanceName: string, webhookUrl: string, enabled: boolean = true): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/webhook/set/${instanceName}`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    enabled,
                    url: webhookUrl,
                    webhookByEvents: true,
                    webhookBase64: true,
                    events: [
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
                        "SEND_MESSAGE"
                    ]
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to set webhook");
            }

            return await response.json();
        } catch (error) {
            console.error("Error setting webhook:", error);
            throw error;
        }
    }

    async findWebhook(instanceName: string, apiKey?: string): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/webhook/find/${instanceName}`, {
                method: "GET",
                headers: this.getHeaders(apiKey),
            });

            if (!response.ok) {
                if (response.status === 404) return null;
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || "Failed to find webhook");
            }

            return await response.json();
        } catch (error) {
            console.error("Error finding webhook:", error);
            return null; // Return null on error to avoid breaking list fetch
        }
    }

    async sendTextMessage(instanceName: string, number: string, text: string, delay: number = 1200): Promise<any> {
        try {
            // Use local proxy to ensure persistence and correct error handling
            const body = {
                instanceName, // Required for proxy lookup
                number,
                text,
                delay
            };

            const response = await fetch(`/message/sendText`, {
                method: "POST",
                headers: { "Content-Type": "application/json" }, // No API key needed for local proxy
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(err => ({ rawError: err.message }));
                throw new Error(errorData.error || errorData.message || JSON.stringify(errorData));
            }

            return await response.json();
        } catch (error) {
            console.error("Error sending message:", error);
            throw error;
        }
    }
    async fetchChats(instanceName: string): Promise<any[]> {
        try {
            const response = await fetch(`${this.baseUrl}/chat/findChats/${instanceName}`, {
                method: "POST",
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                throw new Error("Failed to fetch chats");
            }

            return await response.json();
        } catch (error) {
            console.error("Error fetching chats:", error);
            return [];
        }
    }

    async fetchMessages(instanceName: string, remoteJid: string, limit: number = 50): Promise<any[]> {
        try {
            const response = await fetch(`${this.baseUrl}/chat/findMessages/${instanceName}`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    where: {
                        key: {
                            remoteJid
                        }
                    },
                    options: {
                        limit,
                        sort: {
                            messageTimestamp: "desc"
                        }
                    }
                })
            });

            if (!response.ok) {
                // If 404/others, return empty array to not break UI
                return [];
            }

            const data = await response.json();
            // Ensure we return an array. Evolution API might return { messages: [...] } or [...] or { records: [...] }
            return Array.isArray(data) ? data : (data.messages || data.records || []);
        } catch (error) {
            console.error("Error fetching messages:", error);
            return [];
        }
    }
}
