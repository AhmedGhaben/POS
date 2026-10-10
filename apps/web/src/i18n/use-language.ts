import * as React from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/features/auth/store";
import { applyLanguage, currentLanguage, isLanguage, type Language } from "./index";

/** Follows the signed-in person's saved language (mounted once, in App). */
export function useLanguageSync() {
  const saved = useAuthStore((s) => s.user?.language);
  React.useEffect(() => {
    if (isLanguage(saved)) applyLanguage(saved);
  }, [saved]);
}

/**
 * The language on screen and a setter. Signed in, the choice is saved on
 * the server so it follows the person to other tills and browsers; offline
 * it still applies here and is saved on this device.
 */
export function useLanguage(): [Language, (lang: Language) => void] {
  const { i18n } = useTranslation();
  const signedIn = useAuthStore((s) => s.user !== null);
  const setUserLanguage = useAuthStore((s) => s.setUserLanguage);
  const change = React.useCallback(
    (lang: Language) => {
      applyLanguage(lang);
      if (!signedIn) return;
      setUserLanguage(lang);
      void apiClient.patch("/users/me/language", { language: lang }).catch(() => {});
    },
    [signedIn, setUserLanguage],
  );
  // i18n.language in the deps so callers re-render when it changes.
  return React.useMemo(() => [currentLanguage(), change], [i18n.language, change]); // eslint-disable-line react-hooks/exhaustive-deps
}
