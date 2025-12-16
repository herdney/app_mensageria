import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { RefreshCw, CheckCircle2, AlertCircle, Trash2, Eye, Save } from "lucide-react";
import { EvolutionApiService } from "../services/evolutionApi";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

// Helper to generate random suffix like the N8N workflow
const generateRandomSuffix = () => Math.random().toString(36).substring(2, 8).toUpperCase();

type ConnectionViewProps = {
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  instances: any[];
  onRefreshInstances: () => void;
  savedInstances: any[];
  onRefreshSavedInstances: () => void;
}

export function ConnectionView({
  baseUrl,
  setBaseUrl,
  apiKey,
  setApiKey,
  instances,
  onRefreshInstances,
  savedInstances,
  onRefreshSavedInstances
}: ConnectionViewProps) {
  const [instanceName, setInstanceName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState(""); // Webhook State
  // Local state for UI only
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<any>(null);

  // NOTE: LocalStorage sync is now handled in App.tsx
  // NOTE: Fetching instances is now handled in App.tsx (received via props)
  // NOTE: Saved Hosts fetching is now handled in App.tsx (received via props)

  const [showSavedHosts, setShowSavedHosts] = useState(false);
  const saveHostToBackend = async (appName: string, appUrl: string, appKey: string, status?: string, ownerJid?: string, profilePicUrl?: string, appWebhookUrl?: string) => {
    console.log("Top-level saveHostToBackend:", { appName, appUrl, appKey, status, appWebhookUrl });
    if (!appName || !appUrl || !appKey) {
      toast.error("Dados incompletos ou vazios.");
      return;
    }

    // Check if exists to Update (PUT) instead of Create (POST)
    const existing = savedInstances.find(s => s.name === appName);
    const method = existing ? 'PUT' : 'POST';
    const url = existing ? `/hosts/${existing.id}` : '/hosts';

    const body: any = {
      name: appName,
      base_url: appUrl,
      api_key: appKey,
      status: status || 'unknown',
      owner_jid: ownerJid || '',
      profile_pic_url: profilePicUrl || ''
    };

    // Only include webhook_url if provided, or if creating new (default to empty)
    if (appWebhookUrl !== undefined) {
      body.webhook_url = appWebhookUrl;
    } else if (!existing) {
      body.webhook_url = '';
    }
    // If updating and appWebhookUrl is undefined, we omit it from body so backend COALESCE keeps existing value.

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(existing ? "Conexão atualizada!" : "Conexão salva no banco!");
        onRefreshSavedInstances();
      } else {
        const err = await res.json();
        toast.error(`Erro ao salvar: ${err.error}`);
        console.error(err);
      }
    } catch (e: any) {
      console.error("Auto-save failed", e);
      toast.error(`Erro de conexão: ${e.message}`);
    }
  };

  const handleSaveHost = async () => {
    if (!baseUrl || !apiKey) {
      toast.error("Preencha URL e API Key para salvar.");
      return;
    }
    const name = prompt("Nome para esta conexão (ex: Servidor Produção):");
    if (!name) return;

    await saveHostToBackend(name, baseUrl, apiKey, undefined, undefined, undefined, webhookUrl);
  };

  const handleLoadHost = (host: any) => {
    setBaseUrl(host.base_url);
    setApiKey(host.api_key);
    setWebhookUrl(host.webhook_url || ""); // Load webhook url
    toast.info(`Carregado: ${host.name}`);
    setShowSavedHosts(false);
  };

  const handleDeleteHost = async (id: number) => {
    if (!confirm("Remover esta conexão salva?")) return;
    try {
      await fetch(`/hosts/${id}`, { method: 'DELETE' });
      toast.success("Conexão removida.");
      onRefreshSavedInstances();
    } catch (e) {
      toast.error("Erro ao remover.");
      console.error(e);
    }
  };

  // Poll for connection status when QR code is displayed
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    if (qrCode && !isConnected && instanceName && apiKey && baseUrl) {
      const apiService = new EvolutionApiService(baseUrl, apiKey);

      const checkConnection = async () => {
        try {
          const stateData = await apiService.getConnectionState(instanceName);
          console.log("Polling Status:", stateData);
          const status = stateData?.instance?.state || stateData?.instance?.status || stateData?.state || stateData?.status;

          if (status === 'open' || status === 'connected') {
            // Success! 
            toast.success(`Conexão realizada com sucesso! Instância: ${instanceName}`);

            // Auto-save on success!
            // saveHostToBackend(instanceName, baseUrl, apiKey, status, stateData?.instance?.ownerJid, stateData?.instance?.profilePicUrl);

            // Auto-reset logic
            setQrCode(null);
            setIsConnected(false); // Ensure we don't show the "Connected" card
            setInstanceName(""); // Clear form for next usage

            onRefreshInstances(); // Refresh list
          } else {
            setPollingStatus(`Aguardando... Status: ${status || 'desconhecido'}`);
          }
        } catch (error: any) {
          // Silent fail appropriately during polling
          console.log("Polling check failed", error);
          setPollingStatus(`Tentando conectar... (${error.message || 'Error'})`);
        }
      };

      // Poll every 3 seconds
      intervalId = setInterval(checkConnection, 3000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [qrCode, isConnected, instanceName, apiKey, baseUrl]);

  const apiService = new EvolutionApiService(baseUrl, apiKey);

  const handleGenerateQRCode = async () => {
    if (!instanceName) {
      setError("Por favor, digite um nome para a instância.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setQrCode(null);

    try {
      // 1. Create Instance
      let data;
      try {
        data = await apiService.createInstance(instanceName, "", "", webhookUrl);
        console.log("Create Instance Response:", data);
      } catch (e: any) {
        // Assume instance might already exist, try to fetch it
        console.warn("Create failed, checking if exists...", e);
        const instances = await apiService.fetchInstances();
        const exists = instances.find((i: any) => i.instance?.instanceName === instanceName);
        if (exists) {
          data = exists; // Use existing instance data structure if somewhat compatible
          toast.info("Instância já existe, tentando conectar...");
        } else {
          throw e;
        }
      }

      // 2. Connect (Get QR)
      let qrCodeData: string | null = null;

      // Handle direct QR in creation response or need to call connect
      if (data?.qrcode) {
        // If creation returns QR directly (some versions)
        if (data.qrcode.base64) qrCodeData = data.qrcode.base64;
        else qrCodeData = data.qrcode.pairingCode || data.qrcode.code;
      } else {
        // Explicitly connect
        const connectResponse = await apiService.connectInstance(instanceName);
        console.log("Connect response:", connectResponse);

        if (connectResponse.code || connectResponse.base64) {
          qrCodeData = connectResponse.code || connectResponse.base64 || null;
        } else if ((connectResponse as any).qrcode) {
          const qrObj = (connectResponse as any).qrcode;
          if (qrObj.base64) {
            qrCodeData = qrObj.base64;
          } else {
            qrCodeData = qrObj.pairingCode || qrObj.code;
          }

          if (!qrCodeData && typeof qrObj === 'string') qrCodeData = qrObj;
        } else if (connectResponse.instance && connectResponse.instance.status === 'open') {
          // Already connected
          toast.success(`Instância ${instanceName} já está conectada!`);

          // AUTOMATIC WEBHOOK SETUP & PERSISTENCE
          if (webhookUrl) {
            try {
              await apiService.setWebhook(instanceName, webhookUrl, true);
              toast.success("Webhook configurado automaticamente!");
            } catch (whErr) {
              console.error("Auto webhook failed", whErr);
              toast.error("Falha ao configurar webhook automaticamente.");
            }
          }

          // Auto-save host to DB with Webhook URL
          await saveHostToBackend(instanceName, baseUrl, apiKey, 'open', connectResponse.instance.ownerJid, connectResponse.instance.profilePicUrl, webhookUrl);

          onRefreshInstances();
          setIsLoading(false);
          return;
        }
      }

      if (qrCodeData) {
        setQrCode(qrCodeData);
        setIsConnected(false); // Waiting scan
        setPollingStatus("Aguardando leitura do QR Code...");

        // Start polling for connection success
        const pollInterval = setInterval(async () => {
          try {
            // We use a lighter check if possible, or fetch instances
            const instances = await apiService.fetchInstances();
            const myInstance = instances.find((i: any) => i.instance?.instanceName === instanceName);

            if (myInstance && myInstance.instance.status === 'open') {
              clearInterval(pollInterval);
              setQrCode(null);
              setPollingStatus("");
              setIsConnected(true);
              toast.success("Conectado com sucesso!");

              // AUTOMATIC WEBHOOK SETUP & PERSISTENCE AFTER SCAN
              if (webhookUrl) {
                try {
                  await apiService.setWebhook(instanceName, webhookUrl, true);
                  toast.success("Webhook configurado automaticamente!");
                } catch (whErr) {
                  console.error("Auto webhook failed", whErr);
                }
              }

              // Auto-save host to DB with Webhook URL
              await saveHostToBackend(instanceName, baseUrl, apiKey, 'open', myInstance.instance.ownerJid, myInstance.instance.profilePicUrl, webhookUrl);

              onRefreshInstances();
              setInstanceName(""); // Clear form or keep it? User might want to see it. Let's clear to reset.
              setWebhookUrl("");
            }
          } catch (err) {
            console.error("Polling error", err);
          }
        }, 3000);

        // Cleanup interval on unmount or manual stop (needed?)
        // simplified for this view
      } else {
        setError("Não foi possível obter o QR Code.");
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao criar/conectar instância.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    handleGenerateQRCode();
  };

  const checkStatus = async (targetName?: string) => {
    const nameToCheck = targetName || instanceName;
    if (!nameToCheck || !apiKey || !baseUrl) return;

    setIsLoading(true);
    setError(null);

    try {
      const apiService = new EvolutionApiService(baseUrl, apiKey);
      const stateData = await apiService.getConnectionState(nameToCheck);
      console.log("State Data:", stateData);

      const status = stateData?.instance?.state || stateData?.instance?.status || stateData?.state || stateData?.status;

      if (status === 'open' || status === 'connected') {
        // Success! 
        toast.success(`Conexão realizada com sucesso! Instância: ${nameToCheck}`);

        // Auto-reset logic
        setQrCode(null);
        setIsConnected(false);
        setInstanceName("");

        // Auto-save host to DB (Update webhook if provided)
        if (webhookUrl) {
          try {
            const apiService = new EvolutionApiService(baseUrl, apiKey);
            await apiService.setWebhook(nameToCheck, webhookUrl, true);
            toast.success("Webhook configurado automaticamente!");
          } catch (whErr) {
            console.error("Auto webhook failed in checkStatus", whErr);
          }
        }
        await saveHostToBackend(nameToCheck, baseUrl, apiKey, status, stateData?.instance?.ownerJid, stateData?.instance?.profilePicUrl, webhookUrl);

        onRefreshInstances(); // Refresh list
      } else {
        const msg = status ? `Status: ${status}` : "Não foi possível obter o status (resposta inesperada)";
        setError(msg);
      }
      onRefreshInstances(); // Update list

    } catch (err: any) {
      setError("Erro ao verificar status: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteInstance = async (targetName?: string) => {
    const nameToDelete = targetName || instanceName;
    if (!nameToDelete || !apiKey || !baseUrl) return;
    if (!confirm(`Tem certeza? Isso irá desconectar e excluir a instância "${nameToDelete}".`)) return;

    setIsLoading(true);

    try {
      const apiService = new EvolutionApiService(baseUrl, apiKey);
      // 1. Delete from Evolution API
      await apiService.deleteInstance(nameToDelete);

      // 2. Check if exists in DB (Saved Hosts) and delete it
      const savedHost = savedInstances.find(host => host.name === nameToDelete);
      if (savedHost) {
        try {
          await fetch(`/hosts/${savedHost.id}`, { method: 'DELETE' });
          toast.success("Conexão removida do banco de dados.");
        } catch (err) {
          console.error("Failed to delete from DB", err);
        }
      }

      toast.success(`Instância ${nameToDelete} excluída.`);
      onRefreshInstances();
      onRefreshSavedInstances(); // Refresh saved hosts list

      // Reset current view if we just deleted the active one
      if (instanceName === nameToDelete) {
        setInstanceName("");
        setQrCode(null);
        setIsConnected(false);
      }

    } catch (e: any) {
      toast.error("Erro ao excluir: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Select instance from list
  const selectInstance = (name: string) => {
    setInstanceName(name);
  };

  return (
    <div className="flex-1 flex gap-6 p-8 overflow-y-auto h-full items-start">

      {/* Sidebar Column */}
      <div className="w-1/3 min-w-[300px] h-full flex flex-col gap-4">

        {/* Saved Hosts Card */}
        <Card className="flex-shrink-0 max-h-[40%] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex justify-between items-center">
              Conexões Ativas
            </CardTitle>
            <CardDescription>Conexões salvas no banco</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2 pt-0">
            {savedInstances.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhuma conexão salva.</p>
            ) : (
              savedInstances.map((host) => {
                const isOpen = host.status === 'open' || host.status === 'connected';
                const phoneNumber = host.owner_jid ? host.owner_jid.split('@')[0] : '';

                return (
                  <div key={host.id} className="group flex items-center justify-between text-sm p-2 border rounded-md hover:bg-accent transition-colors cursor-pointer" onClick={() => handleLoadHost(host)}>
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={host.profile_pic_url} alt={host.name} />
                        <AvatarFallback>{host.name?.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="font-medium truncate flex items-center">
                          {host.name}
                          {phoneNumber && <span className="text-xs text-muted-foreground ml-2">{phoneNumber}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{host.base_url}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={(e) => {
                        e.stopPropagation();
                        setSelectedInstance({
                          name: host.name,
                          status: host.status,
                          ownerJid: host.owner_jid,
                          profilePicUrl: host.profile_pic_url,
                          createdAt: host.created_at,
                          webhookUrl: host.webhook_url,
                          instance: {
                            instanceName: host.name,
                            status: host.status,
                            ownerJid: host.owner_jid,
                            profilePicUrl: host.profile_pic_url,
                          }
                        });
                      }}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={(e) => { e.stopPropagation(); handleDeleteHost(host.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <div className={`w-2.5 h-2.5 rounded-full ml-1 ${isOpen ? 'bg-green-500' : 'bg-gray-300'}`} title={host.status}></div>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Instances Card */}
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              Conexões
              <Button variant="ghost" size="icon" onClick={onRefreshInstances} title="Atualizar Lista">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </CardTitle>
            <CardDescription>
              Instâncias encontradas na API
              <span className="block text-xs text-orange-500 mt-1 font-medium">
                * Clique no ícone de Salvar ( <Save className="w-3 h-3 inline mb-0.5" /> ) para habilitar o envio e recebimento de mensagens
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2">
            {instances.length === 0 && (!baseUrl || !apiKey) ? (
              <p className="text-muted-foreground text-sm text-center py-4">Selecione um servidor ou configure a API.</p>
            ) : instances.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhuma instância encontrada.</p>
            ) : (
              (() => {
                const filteredInstances = instances.filter(inst => {
                  const status = inst.instance?.status || inst.instance?.state || inst.connectionStatus || inst.status || 'unknown';
                  // if (status !== 'open' && status !== 'connected') return false; 
                  // Keeping all or filtering? User wanted filter restored.
                  // Checking previous context: "Restore Status Filter" was DONE.
                  // So we keep the filter.
                  if (status !== 'open' && status !== 'connected') return false;
                  return true;
                });

                if (filteredInstances.length === 0) {
                  return <p className="text-muted-foreground text-sm text-center py-4">Nenhuma conexão ativa encontrada.</p>;
                }

                return filteredInstances.map((inst: any, idx) => {
                  const name = inst.instance?.instanceName || inst.name || inst.instanceName || 'Unknown';
                  const status = inst.instance?.status || inst.instance?.state || inst.connectionStatus || inst.status || 'unknown';
                  const ownerJid = inst.instance?.ownerJid || inst.ownerJid;
                  const phoneNumber = ownerJid ? ownerJid.split('@')[0] : '';
                  const profilePic = inst.instance?.profilePicUrl || inst.profilePicUrl;
                  const isOpen = status === 'open' || status === 'connected';

                  return (
                    <div
                      key={idx}
                      className={`p-3 border rounded-lg cursor-pointer hover:bg-accent transition-colors flex justify-between items-center ${instanceName === name ? 'border-primary bg-accent/50' : ''}`}
                      onClick={() => selectInstance(name)}
                    >
                      <Avatar className="h-8 w-8 mr-3">
                        <AvatarImage src={inst.instance?.profilePicUrl || inst.profilePicUrl} alt={name} />
                        <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="overflow-hidden flex-1">
                        <p className="font-medium truncate" title={name}>
                          {name}
                          {phoneNumber && <span className="text-xs text-muted-foreground ml-2">{phoneNumber}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{status}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:text-green-500"
                          title="Salvar Conexão"
                          onClick={(e) => {
                            e.stopPropagation();
                            saveHostToBackend(name, baseUrl, apiKey, status, ownerJid, profilePic, inst.webhookUrl || inst.instance?.webhookUrl);
                          }}
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:text-blue-500"
                          title="Verificar Status"
                          onClick={(e) => {
                            e.stopPropagation();
                            const saved = savedInstances.find(s => s.name === name);
                            setSelectedInstance({
                              ...inst,
                              webhookUrl: saved?.webhook_url
                            });
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:text-red-500"
                          title="Excluir Instância"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteInstance(name);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <div className={`w-3 h-3 rounded-full ${isOpen ? 'bg-green-500' : 'bg-gray-300'}`} title={status}></div>
                      </div>
                    </div>
                  );
                });
              })()
            )}
          </CardContent>
        </Card>
      </div>

      {/* Connection Details Modal */}
      <Dialog open={!!selectedInstance} onOpenChange={(open) => !open && setSelectedInstance(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da Conexão</DialogTitle>
          </DialogHeader>

          {selectedInstance && (() => {
            const inst = selectedInstance;
            const name = inst.instance?.instanceName || inst.name || inst.instanceName || 'Unknown';
            const status = inst.instance?.status || inst.instance?.state || inst.connectionStatus || inst.status || 'unknown';
            const ownerJid = inst.instance?.ownerJid || inst.ownerJid;
            const phoneNumber = ownerJid ? ownerJid.split('@')[0] : 'Desconhecido';
            const profilePicUrl = inst.instance?.profilePicUrl || inst.profilePicUrl;
            const createdAt = inst.instance?.createdAt || inst.createdAt;
            const isOpen = status === 'open' || status === 'connected';

            const formattedDate = createdAt ? new Date(createdAt).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              dateStyle: 'short',
              timeStyle: 'medium'
            }) : 'Data desconhecida';

            return (
              <div className="flex flex-col gap-4 py-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profilePicUrl} alt={name} />
                    <AvatarFallback className="text-lg">{name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-lg">{name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className={`w-2 h-2 rounded-full ${isOpen ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                      {status}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 border-t pt-4">
                  <div className="grid grid-cols-3 gap-4">
                    <span className="font-medium text-muted-foreground">Nome:</span>
                    <span className="col-span-2">{name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <span className="font-medium text-muted-foreground">Status:</span>
                    <span className="col-span-2">{status}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <span className="font-medium text-muted-foreground">Número:</span>
                    <span className="col-span-2">{phoneNumber}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <span className="font-medium text-muted-foreground">Conectado em:</span>
                    <span className="col-span-2">{formattedDate}</span>
                  </div>
                  {((inst.webhookUrl) || (inst.instance?.webhookUrl)) && (
                    <div className="grid grid-cols-3 gap-4">
                      <span className="font-medium text-muted-foreground">Webhook:</span>
                      <span className="col-span-2 break-all text-xs flex items-center">{inst.webhookUrl || inst.instance?.webhookUrl}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <div className="flex-1 flex justify-center w-full">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Conexão WhatsApp
              {isConnected && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            </CardTitle>
            <CardDescription>
              Configure a conexão com a Evolution API para integração com WhatsApp.
              {isConnected && <span className="block text-green-600 font-bold mt-1">Conectado!</span>}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Status</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Configuração da API */}
            <div className="space-y-4">

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="baseUrl">URL da API</Label>
                  <Input
                    id="baseUrl"
                    placeholder="http://localhost:8080"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    disabled={isConnected || isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKey">Global API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="Sua Global API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isConnected || isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instanceName">Nome da Instância</Label>
                  <Input
                    id="instanceName"
                    placeholder="minha-instancia"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    disabled={isConnected || isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webhook-url-input">URL do Webhook (Opcional)</Label>
                  <Input
                    id="webhook-url-input"
                    placeholder="https://seu-ngrok.app/webhook"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    disabled={isConnected || isLoading}
                  />
                  <p className="text-[11px] text-muted-foreground">Será configurado automaticamente ao conectar.</p>
                </div>

                {!qrCode && !isConnected && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        onClick={handleGenerateQRCode}
                        className="flex-1"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Processando...
                          </>
                        ) : (
                          "Criar / Gerar QR"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* QR Code Display */}
              {qrCode && !isConnected && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center p-8 bg-accent/50 rounded-lg">
                    <div className="bg-white p-4 rounded-lg shadow-lg">
                      {/* If the string is base64 image data (starts with data:image), render img tag. 
                Evolution usually returns the base64 string without prefix or with. 
                Let's handle both or assume standard qrcode.react if it is just text.
                However, Evolution API "base64" field is usually an image data URI.
             */}
                      {qrCode.startsWith('data:image') ? (
                        <img src={qrCode} alt="WhatsApp QR Code" className="w-[256px] h-[256px]" />
                      ) : (
                        <QRCodeSVG
                          value={qrCode}
                          size={256}
                          level="H"
                          includeMargin={true}
                          fgColor="#0066cc"
                        />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-4 text-center">
                      Escaneie este QR Code com seu WhatsApp
                    </p>
                    {pollingStatus && (
                      <p className="text-center text-xs text-blue-500 animate-pulse mt-2">{pollingStatus}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleRefresh}
                      variant="outline"
                      className="flex-1"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Atualizar QR Code
                    </Button>
                    <Button
                      onClick={() => checkStatus()}
                      variant="secondary"
                      className="flex-1"
                    >
                      Confirmar Conexão
                    </Button>
                  </div>
                </div>
              )}



              {/* Informações */}
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                <h4 className="mb-2 font-semibold">ℹ️ Instruções:</h4>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Certifique-se que o <strong>Evolution API</strong> está rodando (Docker, local, etc).</li>
                  <li>Insira a URL (ex: <code>http://localhost:8080</code>) e a <strong>Global API Key</strong>.</li>
                  <li>Escolha um nome para sua instância.</li>
                  <li>Clique para criar/gerar o QR Code.</li>
                </ol>
              </div>

            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
