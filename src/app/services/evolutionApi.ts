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
        description: string = ""
    ): Promise<CreateInstanceResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/instance/create`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    instanceName,
                    token,
                    description,
                    qrcode: true, // Auto-generate QR on create
                    integration: "WHATSAPP-BAILEYS",
                }),
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
}
