import { Check, ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGES } from "@/i18n";
import { useLanguage } from "@/i18n/use-language";
import { cn } from "@/lib/utils";

/** Short name on the button: PT-AO, EN, PT-PT, PT-BR. */
function shortName(code: string) {
  return code.toUpperCase();
}

/**
 * The one language control: a compact dropdown on the sign-in and sign-up
 * pages, the first-run setup, the top bar and This device. Each language is
 * named in its own language, Angolan Portuguese first.
 */
export function LanguagePicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useLanguage();
  const current = LANGUAGES.find((l) => l.code === language);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("h-11 gap-1.5 px-3 font-semibold", className)}
          aria-label={`${t("language.label")}: ${current?.label ?? language}`}
        >
          <Languages className="h-4 w-4" aria-hidden />
          {shortName(language)}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} lang={l.code} onClick={() => setLanguage(l.code)} className="min-h-10">
            <Check className={l.code === language ? "h-4 w-4" : "h-4 w-4 opacity-0"} aria-hidden />
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
