import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import type { BusinessDto } from "@pos/shared";
import { Button } from "@/components/ui/button";
import { logoSrc, removeLogo, uploadLogo } from "@/features/business/api";
import { resizeLogo } from "@/features/business/resize-logo";

interface LogoUploaderProps {
  business: BusinessDto;
  onSaved: (business: BusinessDto) => void;
}

export function LogoUploader({ business, onSaved }: LogoUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => uploadLogo(await resizeLogo(file)),
    onSuccess: (updated) => {
      setError(null);
      onSaved(updated);
      toast.success("Logo updated");
    },
    onError: (err) => setError((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: removeLogo,
    onSuccess: (updated) => {
      onSaved(updated);
      toast.success("Logo removed");
    },
    onError: (err) => setError((err as Error).message),
  });

  const src = logoSrc(business);
  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
        {src ? (
          <img src={src} alt="Business logo" className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Shown on receipts and invoices. PNG with a transparent background works best; large images are
          shrunk automatically.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            {upload.isPending ? "Uploading..." : src ? "Replace" : "Upload logo"}
          </Button>
          {src && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => remove.mutate()}>
              <Trash2 className="mr-2 h-4 w-4" /> Remove
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload.mutate(file);
          }}
        />
      </div>
    </div>
  );
}
