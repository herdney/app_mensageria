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
  workingHours: {
    start: string;
    end: string;
  };
  languages: string[];
  api_key?: string;
};

export function AgentView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Partial<Agent>>({
    name: "",
    description: "",
    prompt: "",
    isActive: true,
    autoReply: false,
    model: "gpt-3.5-turbo",
    temperature: 0.7,
    maxContext: 10,
    keywords: [],
    workingHours: {
      start: "09:00",
      end: "18:00",
    },
    languages: ["pt-BR"],
    api_key: "",
  });
  const [isEditing, setIsEditing] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  const fetchAgents = async () => {
    try {
      const res = await fetch("http://localhost:3001/agents");
      if (res.ok) {
        const data = await res.json();
        // Map snake_case from DB to camelCase for Frontend
        const mappedAgents = data.map((dbAgent: any) => ({
          ...dbAgent,
          isActive: dbAgent.is_active,
          autoReply: dbAgent.auto_reply,
          maxContext: dbAgent.max_context,
          temperature: parseFloat(dbAgent.temperature), // Ensure number
          workingHours: dbAgent.working_hours || { start: "09:00", end: "18:00" } // Fallback if null
        }));
        setAgents(mappedAgents);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      toast.error("Erro ao carregar agentes");
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleSaveAgent = async () => {
    if (!currentAgent.name || !currentAgent.prompt) {
      toast.error("Por favor, preencha o nome e o prompt do agente");
      return;
    }

    const payload = {
      id: currentAgent.id || Date.now().toString(),
      name: currentAgent.name,
      description: currentAgent.description || "",
      prompt: currentAgent.prompt,
      model: currentAgent.model,
      temperature: currentAgent.temperature,
      is_active: currentAgent.isActive,
      auto_reply: currentAgent.autoReply,
      max_context: currentAgent.maxContext,
      working_hours: currentAgent.workingHours || { start: "09:00", end: "18:00" },
      keywords: currentAgent.keywords || [],
      languages: currentAgent.languages || ["pt-BR"],
      api_key: currentAgent.api_key,
    };

    try {
      const method = currentAgent.id ? "PUT" : "POST";
      const url = currentAgent.id
        ? `http://localhost:3001/agents/${currentAgent.id}`
        : "http://localhost:3001/agents";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success("Agente salvo com sucesso!");
        fetchAgents();
        handleNewAgent(); // Reset form
        setIsEditing(false);
      } else {
        throw new Error("Failed to save");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar agente");
    }
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este agente?")) return;
    try {
      const res = await fetch(`http://localhost:3001/agents/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Agente removido");
        fetchAgents();
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao remover agente");
    }
  };



  const handleToggleStatus = async (id: string, newStatus: boolean) => {
    try {
      const agentToUpdate = agents.find(a => a.id === id);
      if (!agentToUpdate) return;

      const payload = {
        ...agentToUpdate,
        id: agentToUpdate.id,
        name: agentToUpdate.name,
        description: agentToUpdate.description,
        prompt: agentToUpdate.prompt,
        model: agentToUpdate.model,
        temperature: agentToUpdate.temperature,
        is_active: newStatus, // Update status
        auto_reply: agentToUpdate.autoReply,
        max_context: agentToUpdate.maxContext,
        working_hours: agentToUpdate.workingHours,
        keywords: agentToUpdate.keywords,
        languages: agentToUpdate.languages,
        api_key: agentToUpdate.api_key
      };

      const res = await fetch(`http://localhost:3001/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(`Agente ${newStatus ? 'ativado' : 'desativado'}`);
        fetchAgents();
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar status");
    }
  };

  const handleEditAgent = (agent: Agent) => {
    setCurrentAgent(agent);
    setIsEditing(true);
  };

  const handleNewAgent = () => {
    setIsEditing(true);
    setCurrentAgent({
      name: "",
      description: "",
      prompt: "",
      isActive: true,
      autoReply: false,
      model: "gpt-3.5-turbo",
      temperature: 0.7,
      maxContext: 10,
      keywords: [],
      workingHours: {
        start: "09:00",
        end: "18:00",
      },
      languages: ["pt-BR"],
      api_key: "",
    });
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !currentAgent.keywords?.includes(keywordInput.trim())) {
      setCurrentAgent({
        ...currentAgent,
        keywords: [...(currentAgent.keywords || []), keywordInput.trim()],
      });
      setKeywordInput("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setCurrentAgent({
      ...currentAgent,
      keywords: currentAgent.keywords?.filter((k) => k !== keyword) || [],
    });
  };

  const handleToggleLanguage = (lang: string) => {
    const currentLanguages = currentAgent.languages || [];
    if (currentLanguages.includes(lang)) {
      setCurrentAgent({
        ...currentAgent,
        languages: currentLanguages.filter((l) => l !== lang),
      });
    } else {
      setCurrentAgent({
        ...currentAgent,
        languages: [...currentLanguages, lang],
      });
    }
  };

  const languageOptions = [
    { value: "pt-BR", label: "Português (BR)" },
    { value: "en-US", label: "English (US)" },
    { value: "es-ES", label: "Español" },
    { value: "fr-FR", label: "Français" },
    { value: "de-DE", label: "Deutsch" },
  ];

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2">
              <Bot className="w-6 h-6" />
              Gerenciamento de Agentes
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure agentes de IA para responder automaticamente às mensagens
            </p>
          </div>
          {!isEditing && (
            <Button onClick={handleNewAgent}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Agente
            </Button>
          )}
        </div>

        {/* Lista de Agentes */}
        {agents.length > 0 && !isEditing && (
          <div className="space-y-3">
            <h3>Agentes Criados</h3>
            {agents.map((agent) => (
              <Card key={agent.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{agent.name}</CardTitle>
                      {agent.description && (
                        <CardDescription>{agent.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 mr-2">
                        <Label htmlFor={`switch-${agent.id}`} className="text-xs cursor-pointer">
                          {agent.isActive ? 'Ativo' : 'Inativo'}
                        </Label>
                        <Switch
                          id={`switch-${agent.id}`}
                          checked={agent.isActive}
                          onCheckedChange={(checked) => handleToggleStatus(agent.id, checked)}
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleEditAgent(agent)}>
                        <Bot className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteAgent(agent.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div>
                      <strong>Prompt:</strong>
                      <p className="text-muted-foreground mt-1 line-clamp-2">{agent.prompt}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <strong>Modelo:</strong>
                        <p className="text-muted-foreground">{agent.model}</p>
                      </div>
                      <div>
                        <strong>Temperatura:</strong>
                        <p className="text-muted-foreground">{agent.temperature}</p>
                      </div>
                      <div>
                        <strong>Contexto Máximo:</strong>
                        <p className="text-muted-foreground">{agent.maxContext} mensagens</p>
                      </div>
                      <div>
                        <strong>Resposta Automática:</strong>
                        <p className="text-muted-foreground">{agent.autoReply ? 'Sim' : 'Não'}</p>
                      </div>
                    </div>
                    <div>
                      <strong>Horário de Funcionamento:</strong>
                      <p className="text-muted-foreground">
                        {agent.workingHours.start} - {agent.workingHours.end}
                      </p>
                    </div>
                    {agent.keywords.length > 0 && (
                      <div>
                        <strong>Palavras-chave:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {agent.keywords.map((keyword) => (
                            <Badge key={keyword} variant="secondary">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <strong>Idiomas:</strong>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {agent.languages.map((lang) => {
                          const langLabel = languageOptions.find(l => l.value === lang)?.label || lang;
                          return (
                            <Badge key={lang} variant="outline">
                              {langLabel}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Formulário de Criação */}
        {isEditing && (
          <Card>
            <CardHeader>
              <CardTitle>Criar Novo Agente</CardTitle>
              <CardDescription>
                Configure as informações e comportamento do agente de IA
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {/* Informações Básicas */}
                <div className="space-y-4">
                  <h4 className="font-medium">Informações Básicas</h4>

                  <div className="space-y-2">
                    <Label htmlFor="agentName">Nome do Agente *</Label>
                    <Input
                      id="agentName"
                      placeholder="Ex: Atendente Principal"
                      value={currentAgent.name}
                      onChange={(e) => setCurrentAgent({ ...currentAgent, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agentDescription">Descrição</Label>
                    <Input
                      id="agentDescription"
                      placeholder="Breve descrição sobre o agente"
                      value={currentAgent.description}
                      onChange={(e) => setCurrentAgent({ ...currentAgent, description: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agentPrompt">Prompt do Sistema *</Label>
                    <Textarea
                      id="agentPrompt"
                      placeholder="Ex: Você é um assistente virtual educado e prestativo. Responda de forma clara e objetiva às dúvidas dos clientes sobre produtos e serviços..."
                      className="min-h-[120px] resize-none"
                      value={currentAgent.prompt}
                      onChange={(e) => setCurrentAgent({ ...currentAgent, prompt: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Este prompt define como o agente se comportará nas conversas
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4" />

                {/* Configurações do Modelo */}
                <div className="space-y-4">
                  <h4 className="font-medium">Configurações do Modelo</h4>

                  <div className="space-y-2">
                    <Label htmlFor="model">Modelo de IA</Label>
                    <Select
                      value={currentAgent.model}
                      onValueChange={(value) => setCurrentAgent({ ...currentAgent, model: value })}
                    >
                      <SelectTrigger id="model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                        <SelectItem value="gpt-4">GPT-4</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                        <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                        <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
                        <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="apiKey">OpenAI API Key (Opcional)</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="sk-..."
                      value={currentAgent.api_key || ""}
                      onChange={(e) => setCurrentAgent({ ...currentAgent, api_key: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco para usar a chave global do sistema
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="temperature">Temperatura</Label>
                      <span className="text-sm text-muted-foreground">
                        {currentAgent.temperature?.toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      id="temperature"
                      min={0}
                      max={2}
                      step={0.1}
                      value={[currentAgent.temperature || 0.7]}
                      onValueChange={(value) =>
                        setCurrentAgent({ ...currentAgent, temperature: value[0] })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Controla a aleatoriedade das respostas (0 = preciso, 2 = criativo)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxContext">Contexto Máximo (mensagens)</Label>
                    <Input
                      id="maxContext"
                      type="number"
                      min="1"
                      max="50"
                      value={currentAgent.maxContext}
                      onChange={(e) =>
                        setCurrentAgent({ ...currentAgent, maxContext: parseInt(e.target.value) || 10 })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Número de mensagens anteriores consideradas para contexto
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4" />

                {/* Filtros e Palavras-chave */}
                <div className="space-y-4">
                  <h4 className="font-medium">Filtros e Palavras-chave</h4>

                  <div className="space-y-2">
                    <Label htmlFor="keywords">Palavras-chave de Ativação</Label>
                    <div className="flex gap-2">
                      <Input
                        id="keywords"
                        placeholder="Digite uma palavra-chave"
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddKeyword();
                          }
                        }}
                      />
                      <Button type="button" onClick={handleAddKeyword} variant="outline">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      O agente só responderá mensagens contendo essas palavras (deixe vazio para responder tudo)
                    </p>
                    {currentAgent.keywords && currentAgent.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {currentAgent.keywords.map((keyword) => (
                          <Badge key={keyword} variant="secondary" className="gap-1">
                            {keyword}
                            <button
                              onClick={() => handleRemoveKeyword(keyword)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4" />

                {/* Horário de Funcionamento */}
                <div className="space-y-4">
                  <h4 className="font-medium">Horário de Funcionamento</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startTime">Início</Label>
                      <Input
                        id="startTime"
                        type="time"
                        value={currentAgent.workingHours?.start}
                        onChange={(e) =>
                          setCurrentAgent({
                            ...currentAgent,
                            workingHours: {
                              ...currentAgent.workingHours!,
                              start: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endTime">Término</Label>
                      <Input
                        id="endTime"
                        type="time"
                        value={currentAgent.workingHours?.end}
                        onChange={(e) =>
                          setCurrentAgent({
                            ...currentAgent,
                            workingHours: {
                              ...currentAgent.workingHours!,
                              end: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O agente só responderá dentro deste horário
                  </p>
                </div>

                <div className="border-t pt-4" />

                {/* Idiomas */}
                <div className="space-y-4">
                  <h4 className="font-medium">Idiomas Suportados</h4>

                  <div className="flex flex-wrap gap-2">
                    {languageOptions.map((lang) => (
                      <Badge
                        key={lang.value}
                        variant={currentAgent.languages?.includes(lang.value) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => handleToggleLanguage(lang.value)}
                      >
                        {lang.label}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Selecione os idiomas em que o agente pode se comunicar
                  </p>
                </div>

                <div className="border-t pt-4" />

                {/* Configurações Gerais */}
                <div className="space-y-4">
                  <h4 className="font-medium">Configurações Gerais</h4>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isActive">Agente Ativo</Label>
                      <p className="text-sm text-muted-foreground">
                        Ative ou desative o agente
                      </p>
                    </div>
                    <Switch
                      id="isActive"
                      checked={currentAgent.isActive}
                      onCheckedChange={(checked) =>
                        setCurrentAgent({ ...currentAgent, isActive: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="autoReply">Resposta Automática</Label>
                      <p className="text-sm text-muted-foreground">
                        Responder automaticamente às mensagens recebidas
                      </p>
                    </div>
                    <Switch
                      id="autoReply"
                      checked={currentAgent.autoReply}
                      onCheckedChange={(checked) =>
                        setCurrentAgent({ ...currentAgent, autoReply: checked })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSaveAgent} className="flex-1">
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Agente
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {agents.length === 0 && !isEditing && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bot className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="mb-2">Nenhum agente criado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie seu primeiro agente de IA para começar a automatizar o atendimento
              </p>
              <Button onClick={handleNewAgent}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Agente
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}