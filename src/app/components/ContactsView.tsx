import { MessageSquare, Send, User } from "lucide-react";
import { Card } from "./ui/card";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

type Message = {
  id: string;
  text: string;
  sender: "user" | "contact";
  timestamp: string;
};

export function ContactsView() {
  const mockMessages: Message[] = [
    {
      id: "1",
      text: "Olá! Como posso ajudar?",
      sender: "user",
      timestamp: "10:30",
    },
    {
      id: "2",
      text: "Gostaria de saber mais sobre seus serviços",
      sender: "contact",
      timestamp: "10:32",
    },
    {
      id: "3",
      text: "Claro! Temos vários serviços disponíveis. Qual área você tem interesse?",
      sender: "user",
      timestamp: "10:33",
    },
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-muted/30">
      <Card className="w-full max-w-4xl h-[600px] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3">
          <Avatar>
            <AvatarFallback>
              <User className="w-5 h-5" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h3>Selecione um contato</h3>
            <p className="text-sm text-muted-foreground">
              Escolha um contato da lista para visualizar a conversa
            </p>
          </div>
        </div>

        {/* Empty State */}
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

        {/* Message Input (disabled) */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input placeholder="Digite uma mensagem..." disabled />
            <Button disabled>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
