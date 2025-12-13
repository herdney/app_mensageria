import { MessageSquare, QrCode, Bot, User } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Avatar, AvatarFallback } from "./ui/avatar";

type Contact = {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
};

type SidebarProps = {
  activeView: "contacts" | "connection" | "agent";
  onViewChange: (view: "contacts" | "connection" | "agent") => void;
  contacts: Contact[];
  onContactClick?: (contactId: string) => void;
};

export function Sidebar({ activeView, onViewChange, contacts, onContactClick }: SidebarProps) {
  return (
    <div className="w-80 border-r bg-background flex flex-col h-screen">
      {/* Logo/Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-primary" />
          <h1>Mensageria</h1>
        </div>
      </div>

      {/* Menu Items */}
      <div className="p-2 border-b">
        <div className="space-y-1">
          <Button
            variant={activeView === "contacts" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => onViewChange("contacts")}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Contatos
          </Button>
          <Button
            variant={activeView === "connection" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => onViewChange("connection")}
          >
            <QrCode className="w-4 h-4 mr-2" />
            Conexão
          </Button>
          <Button
            variant={activeView === "agent" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => onViewChange("agent")}
          >
            <Bot className="w-4 h-4 mr-2" />
            Agente
          </Button>
        </div>
      </div>

      {/* Contacts List */}
      {activeView === "contacts" && (
        <ScrollArea className="flex-1">
          <div className="p-2">
            {contacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum contato ainda</p>
              </div>
            ) : (
              <div className="space-y-1">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => onContactClick?.(contact.id)}
                    className="w-full p-3 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback>
                          <User className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="truncate">{contact.name}</span>
                          <span className="text-xs text-muted-foreground">{contact.time}</span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {contact.lastMessage}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
