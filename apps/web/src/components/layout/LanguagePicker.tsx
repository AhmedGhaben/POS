import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES, isLanguage } from "@/i18n";
import { useLanguage } from "@/i18n/use-language";
import { cn } from "@/lib/utils";

/** Language dropdown: the sign-in pages' corner, and This device. */
export function LanguagePicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useLanguage();
  return (
    <Select value={language} onValueChange={(v) => isLanguage(v) && setLanguage(v)}>
      <SelectTrigger className={cn("w-auto gap-2", className)} aria-label={t("language.label")}>
        <Languages className="h-4 w-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code}>
            {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
