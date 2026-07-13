import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CartLine } from "@/features/pos/hooks/useCart";

interface CartProps {
  lines: CartLine[];
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export function Cart({ lines, onSetQuantity, onRemove }: CartProps) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Cart is empty — scan or search a product to begin.
      </div>
    );
  }

  return (
    <div className="flex-1 divide-y overflow-y-auto">
      {lines.map((line) => (
        <div key={line.product.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-medium">{line.product.name}</p>
            <p className="text-xs text-muted-foreground">
              ${Number(line.product.sellPrice).toFixed(2)} each
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={() => onSetQuantity(line.product.id, line.quantity - 1)}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-8 text-center text-sm">{line.quantity}</span>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              onClick={() => onSetQuantity(line.product.id, line.quantity + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <p className="w-20 text-right text-sm font-medium">
            ${(Number(line.product.sellPrice) * line.quantity).toFixed(2)}
          </p>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => onRemove(line.product.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
