import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Bot, Save, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Agent = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  isActive: boolean;
  autoReply: boolean;
  model: string;
  temperature: number;
  maxContext: number;
  keywords: string[];
  workingHours: { start: string; end: string };
  languages: string[];
  api_key?: string;
};

const defaultAgentForm: Partial<Agent> = {
  name: "",
  description: "",
  prompt: "",
  isActive: true,
  autoReply: false,
  model: "gpt-3.5-turbo",
  temperature: 0.7,
  maxContext: 10,
  keywords: [],
  workingHours: { start: "09:00", end: "18:00" },
  languages: ["pt-BR"],
  api_key: "",
};

function mapDbAgentToUi(dbAgent: any): Agent {
  return {
    ...dbAgent,
    isActive: !!dbAgent.is_active,
    autoReply: !!dbAgent.auto_reply,
    maxContext: Number(dbAgent.max_context ?? 10),
    temperature: Number(dbAgent.temperature ?? 0.7),
    workingHours: dbAgent.working_hours || { start: "09:00", end: "18:00" },
    keywords: Array.isArray(dbAgent.keywords) ? dbAgent.keywords : [],
    languages: Array.isArray(dbAgent.languages) ? dbAgent.languages : ["pt-BR"],
    api_key: dbAgent.api_key ?? "",
  };
}

function mapUiAgentToPayload(agent: Partial<Agent>) {
  return {
    id: agent.id || Date.now().toString(),
    name: agent.name,
    description: agent.description || "",
    prompt: agent.prompt,
    model: agent.model || "gpt-3.5-turbo",
    temperature: agent.temperature ?? 0.7,
    is_active: agent.isActive ?? true,
    auto_reply: agent.autoReply ?? false,
    max_context: agent.maxContext ?? 10,
    working_hours: agent.workingHours || { start: "09:00", end: "18:00" },
    keywords: agent.keywords || [],
    languages: agent.languages || ["pt-BR"],
    api_key: agent.api_key || "",
  };
}

export function AgentView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Partial<Agent>>(defaultAgentForm);
  const [isEditing, setIsEditing] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  const fetchAgents = async () => {
    try {
      const res = await fetch("/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      setAgents((Array.isArray(data) ? data : []).map(mapDbAgentToUi));
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      toast.error("Erro ao carregar agentes");
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleNewAgent = () => {
    setIsEditing(true);
    setCurrentAgent(defaultAgentForm);
  };

  const handleEditAgent = (agent: Agent) => {
    setCurrentAgent(agent);
    setIsEditing(true);
  };

  const handleSaveAgent = async () => {
    if (!currentAgent.name || !currentAgent.prompt) {
      toast.error("Por favor, preencha o nome e o prompt do agente");
      return;
    }

    const payload = mapUiAgentToPayload(currentAgent);

    try {
      const method = currentAgent.id ? "PUT" : "POST";
      const url = currentAgent.id ? `/agents/${currentAgent.id}` : "/agents";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save agent");

      toast.success("Agente salvo com sucesso!");
      await fetchAgents();
      handleNewAgent();
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar agente");
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este agente?")) return;
    try {
      const res = await fetch(`/agents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete agent");
      toast.success("Agente removido");
      await fetchAgents();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao remover agente");
    }
  };

  const handleToggleStatus = async (id: string, newStatus: boolean) => {
    try {
      const agentToUpdate = agents.find((a) => a.id === id);
      if (!agentToUpdate) return;

      const payload = {
        ...mapUiAgentToPayload(agentToUpdate),
        is_active: newStatus,
      };

      const res = await fetch(`/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to update agent status");

      toast.success(`Agente ${newStatus ? "ativado" : "desativado"}`);
      await fetchAgents();
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar status");
    }
  };

  const handleAddKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    if (currentAgent.keywords?.includes(kw)) return;

    setCurrentAgent((prev) => ({
      ...prev,
      keywords: [...(prev.keywords || []), kw],
    }));
    setKeywordInput("");
  };

  const handleRemoveKeyword = (keyword: string) => {
    setCurrentAgent((prev) => ({
      ...prev,
      keywords: (prev.keywords || []).filter((k) => k !== keyword),
    }));
  };

  const handleToggleLanguage = (lang: string) => {
    setCurrentAgent((prev) => {
      const langs = prev.languages || [];
      return langs.includes(lang)
        ? { ...prev, languages: langs.filter((l) => l !== lang) }
        : { ...prev, languages: [...langs, lang] };
    });
  };

  const languageOptions = [
    { value: "pt-BR", label: "Português (BR)" },
    { value: "en-US", label: "English (US)" },
    { value: "es-ES", label: "Español" },
    { value: "fr-FR", label: "Français" },
    { value: "de-DE", label: "Deutsch" },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <h2 className="text-xl font-semibold">Agentes</h2>
        </div>
        <Button onClick={handleNewAgent}>
          <Plus className="w-4 h-4 mr-2" />
          Novo agente
        </Button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {agents.map((a) => (
          <Card key={a.id} className="p-3 flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-medium truncate">{a.name}</div>
              <div className="text-xs text-muted-foreground truncate">{a.description}</div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={a.isActive} onCheckedChange={(v) => handleToggleStatus(a.id, v)} />
              <Button variant="outline" onClick={() => handleEditAgent(a)}>
                Editar
              </Button>
              <Button variant="destructive" onClick={() => handleDeleteAgent(a.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Form */}
      {isEditing && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Configurar agente</CardTitle>
            <CardDescription>Crie/edite o prompt e parâmetros</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={currentAgent.name || ""}
                onChange={(e) => setCurrentAgent((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={currentAgent.description || ""}
                onChange={(e) => setCurrentAgent((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Prompt *</Label>
              <Textarea
                className="min-h-[120px] resize-none"
                value={currentAgent.prompt || ""}
                onChange={(e) => setCurrentAgent((prev) => ({ ...prev, prompt: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Modelo</Label>
              <Select value={currentAgent.model} onValueChange={(v) => setCurrentAgent((p) => ({ ...p, model: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Temperatura</Label>
                <span className="text-sm text-muted-foreground">{(currentAgent.temperature ?? 0.7).toFixed(1)}</span>
              </div>
              <Slider
                min={0}
                max={2}
                step={0.1}
                value={[currentAgent.temperature ?? 0.7]}
                onValueChange={(v) => setCurrentAgent((p) => ({ ...p, temperature: v[0] }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Keywords</Label>
              <div className="flex gap-2">
                <Input value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} />
                <Button onClick={handleAddKeyword} variant="outline">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(currentAgent.keywords || []).map((k) => (
                  <Badge key={k} className="gap-1">
                    {k}
                    <X className="w-3 h-3 cursor-pointer" onClick={() => handleRemoveKeyword(k)} />
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Idiomas</Label>
              <div className="flex flex-wrap gap-2">
                {languageOptions.map((lang) => (
                  <Badge
                    key={lang.value}
                    variant={(currentAgent.languages || []).includes(lang.value) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => handleToggleLanguage(lang.value)}
                  >
                    {lang.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSaveAgent} className="flex-1">
                <Save className="w-4 h-4 mr-2" />
                Salvar
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
