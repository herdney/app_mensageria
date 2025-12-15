import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, User, Smartphone, RefreshCw } from "lucide-react";
import { Card } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { socket } from "../services/socket";
import { EvolutionApiService } from "../services/evolutionApi";
import { toast } from "sonner";

type Message = {
  id: string;
  text: string;
  sender: "user" | "contact";
  timestamp: string;
};

type Contact = {
  id: string;
  name: string;
  phoneNumber?: string;
  lastMessage: string;
  time: string;
  avatar?: string;
};

type ContactsViewProps = {
  instances?: any[];
  selectedInstance?: any;
  onSelectInstance?: (instance: any) => void;
  selectedContact?: Contact | null;
  baseUrl?: string;
  apiKey?: string;
};

export function ContactsView({ instances = [], selectedInstance, onSelectInstance, selectedContact, baseUrl, apiKey }: ContactsViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear messages when contact changes (simple approach for now)
  useEffect(() => {
    setMessages([]);
  }, [selectedContact?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Listen for Real-time Messages
  useEffect(() => {
    const handleEvent = (data: any) => {
      // We are looking for MESSAGES_UPSERT event
      // Structure depends on Evolution API version, but usually:
      // data.type === 'MESSAGES_UPSERT'
      const eventType = (data.type || data.event || "").toUpperCase();

      if (['MESSAGES.UPSERT', 'MESSAGES_UPSERT', 'SEND.MESSAGE'].includes(eventType)) {
        const payload = data.data || data.payload;
        // Normalize messages to array
        const msgs = Array.isArray(payload?.messages) ? payload.messages : [payload].filter(Boolean);

        msgs.forEach((msg: any) => {
          if (!msg || !msg.key) return;

          const remoteJid = msg.key.remoteJid;
          const fromMe = msg.key.fromMe;
          const remotePhone = remoteJid ? remoteJid.split('@')[0] : '';

          // Check if this message belongs to the currently selected contact
          // We check against phoneNumber OR id explicitly to be safe
          if (selectedContact && (remotePhone === selectedContact.phoneNumber || remoteJid === selectedContact.id)) {
            // Determine text content
            let text = "";
            if (msg.message?.conversation) text = msg.message.conversation;
            else if (msg.message?.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
            else if (msg.message?.imageMessage?.caption) text = msg.message.imageMessage.caption;
            else if (msg.message?.imageMessage) text = "[Imagem]";
            else text = "[Mídia/Outro Tipo]";

            const newMessage: Message = {
              id: msg.key?.id || Math.random().toString(),
              text: text,
              sender: fromMe ? "user" : "contact",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            setMessages(prev => {
              // 1. Check strict duplicate (ID match)
              if (prev.some(m => m.id === newMessage.id)) return prev;

              // 2. Check optimistic duplicate (Text + Sender match for temp IDs)
              // Only matching the last few messages to be safe/performant, but finding anywhere is fine for this scale
              if (newMessage.sender === "user") {
                const optimisticMatchIndex = prev.findIndex(m =>
                  m.sender === "user" &&
                  m.text === newMessage.text &&
                  m.id.startsWith("temp-")
                );

                if (optimisticMatchIndex !== -1) {
                  // Replace optimistic with real
                  const newHistory = [...prev];
                  newHistory[optimisticMatchIndex] = newMessage;
                  return newHistory;
                }
              }

              return [...prev, newMessage];
            });
          }
        });
      }
    };

    const handleClear = () => {
      setMessages([]);
    };

    socket.on('evolution_event', handleEvent);
    socket.on('database_cleared', handleClear);

    return () => {
      socket.off('evolution_event', handleEvent);
      socket.off('database_cleared', handleClear);
    };
  }, [selectedContact]);

  // Fetch History
  useEffect(() => {
    if (!selectedContact || !selectedInstance || !baseUrl || !apiKey) {
      setMessages([]);
      return;
    }

    const loadHistory = async () => {
      try {
        const response = await fetch(`/messages/${selectedInstance.name}/${selectedContact.id}?limit=50`);
        const history = await response.json();

        if (!history || !Array.isArray(history)) {
          setMessages([]);
          return;
        }

        const mappedMessages: Message[] = history.map((msg: any) => {
          const isFromMe = msg.from_me;
          const text = msg.content || "[Sem conteúdo]";
          const ts = msg.created_at;
          const timeStr = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

          return {
            id: msg.id,
            text: text,
            sender: isFromMe ? "user" : "contact",
            timestamp: timeStr
          };
        });

        // DB returns DESC (Newest First), reverse for UI
        mappedMessages.reverse();

        setMessages(mappedMessages);
      } catch (e) {
        console.error("Failed to load history", e);
        toast.error("Erro ao carregar histórico local");
      }
    };

    loadHistory();
  }, [selectedContact?.id, selectedInstance?.name]);


  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedInstance || !selectedContact || !baseUrl || !apiKey) return;
    if (!selectedContact.phoneNumber) {
      toast.error("Contato sem número de telefone.");
      return;
    }

    setIsSending(true);
    const textToSend = inputMessage;
    // Optimistic UI Update
    const tempId = "temp-" + Math.random().toString();
    const optimisticMsg: Message = {
      id: tempId,
      text: textToSend,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setInputMessage("");
    // Refund focus to input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    try {
      const apiService = new EvolutionApiService(baseUrl, apiKey);
      // Ensure phone number format (remove non-digits, etc if needed. Simple pass for now)
      await apiService.sendTextMessage(selectedInstance.name, selectedContact.phoneNumber, textToSend);
      // Success
    } catch (e: any) {
      console.error(e);
      let errorMessage = e.message || "Erro desconhecido";

      // Try to parse specific Evolution API errors
      try {
        // e.message might be "[400] {...}"
        const jsonPart = errorMessage.substring(errorMessage.indexOf('{'));
        const errorObj = JSON.parse(jsonPart);

        if (errorObj?.response?.message?.[0]?.exists === false) {
          errorMessage = "Este número não possui uma conta no WhatsApp.";
        } else if (errorObj?.error) {
          errorMessage = errorObj.error;
        }
      } catch (parseErr) {
        // Fallback to original message if parsing fails
      }

      toast.error(`Falha ao enviar: ${errorMessage}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };


  return (
    <div className="flex-1 flex flex-col h-full p-4 bg-muted/30">
      <Card className="flex-1 flex flex-col w-full h-full overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3">
          <Avatar>
            {selectedContact?.avatar && (
              <AvatarImage src={selectedContact.avatar} alt={selectedContact.name} />
            )}
            <AvatarFallback>
              {selectedContact ? selectedContact.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3>{selectedContact ? selectedContact.name : "Selecione um contato"}</h3>
            <p className="text-sm text-muted-foreground">
              {selectedContact
                ? (selectedContact.phoneNumber || "Online")
                : "Escolha um contato da lista para visualizar a conversa"
              }
            </p>
          </div>

          {/* Instance Selector */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden md:inline">Conectado como:</span>
            <Select
              value={selectedInstance?.name || ""}
              onValueChange={(value) => {
                const instance = instances.find(i => i.name === value);
                onSelectInstance?.(instance);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="Selecione uma instância" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {instances.length === 0 ? (
                  <SelectItem value="none" disabled>Nenhuma instância salva</SelectItem>
                ) : (
                  instances.map((item) => (
                    <SelectItem key={item.name} value={item.name}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${item.status === 'open' || item.status === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {item.name}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content Area */}
        {selectedContact ? (
          <>
            <div className="flex-1 p-4 overflow-y-auto min-h-0">
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-10">
                    Nenhuma mensagem recente exibida.<br />
                    Envie uma mensagem ou aguarde o recebimento.
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"
                      }`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${msg.sender === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                        }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      <span className="text-xs opacity-70 mt-1 block text-right">
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>
            </div>
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder="Digite uma mensagem..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={!selectedInstance}
                />
                <Button onClick={handleSendMessage} disabled={!selectedInstance || !inputMessage.trim()}>
                  {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              {!selectedInstance && <p className="text-xs text-red-500 mt-2">Selecione uma instância para enviar mensagens.</p>}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquare className="w-12 h-12 text-primary" />
            </div>
            <h3 className="mb-2">Nenhuma conversa selecionada</h3>
            <p className="text-muted-foreground max-w-sm">
              Selecione um contato na barra lateral para visualizar as mensagens e iniciar uma
              conversa
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
