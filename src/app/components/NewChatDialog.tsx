import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";

interface NewChatDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSend: (phoneNumber: string, message: string) => Promise<void>;
}

export function NewChatDialog({ open, onOpenChange, onSend }: NewChatDialogProps) {
    const [phoneNumber, setPhoneNumber] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!phoneNumber || !message) return;
        setLoading(true);
        try {
            await onSend(phoneNumber, message);
            onOpenChange(false);
            // Reset fields
            setPhoneNumber("");
            setMessage("");
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Novo Chat</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="phone">Número (ex: 5541999999999)</Label>
                        <Input
                            id="phone"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="55..."
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="message">Mensagem Inicial</Label>
                        <Textarea
                            id="message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Digite sua mensagem..."
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSend} disabled={loading}>
                        {loading ? "Enviando..." : "Enviar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
