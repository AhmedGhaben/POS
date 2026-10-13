import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Combobox } from "@/components/ui/combobox";
import { LANGUAGES, isLanguage } from "@/i18n";
import { useLanguage } from "@/i18n/use-language";
import { cn } from "@/lib/utils";

/** Language dropdown: the sign-in pages' corner, and This device. */
export function LanguagePicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useLanguage();
  return (
    <Combobox
      value={language}
      onChange={(v) => v !== null && isLanguage(v) && setLanguage(v)}
      className={cn("w-auto gap-2", className)}
      aria-label={t("language.label")}
      icon={<Languages className="h-4 w-4" />}
      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
    />
  );
}
