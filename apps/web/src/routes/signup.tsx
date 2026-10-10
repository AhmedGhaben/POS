import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useAuthStore } from "@/features/auth/store";
import { register } from "@/features/auth/api";
import { currentLanguage } from "@/i18n";

const signupSchema = z.object({
  firstName: z.string().trim().min(1, "validation.required").max(50),
  lastName: z.string().trim().min(1, "validation.required").max(50),
  businessName: z.string().trim().min(1, "validation.required").max(100),
  storeName: z.string().trim().min(1, "validation.required").max(100),
  email: z.string().trim().email("validation.email"),
  password: z.string().min(8, "validation.passwordLength"),
});

type SignupValues = z.output<typeof signupSchema>;

const defaultValues: z.input<typeof signupSchema> = {
  firstName: "",
  lastName: "",
  businessName: "",
  storeName: "",
  email: "",
  password: "",
};

function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function SignupPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const form = useForm<z.input<typeof signupSchema>, unknown, SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues,
  });

  const signupMutation = useMutation({
    mutationFn: (values: SignupValues) => register({ ...values, timezone: browserTimezone(), language: currentLanguage() }),
    onSuccess: ({ accessToken, user, stores, business }) => {
      setSession(accessToken, user, stores, business);
      navigate("/welcome", { replace: true });
    },
  });

  return (
    <AuthLayout
      title={t("signup.title")}
      description={t("signup.description")}
      footer={
        <>
          {t("signup.haveAccount")}{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("login.submit")}
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((values) => signupMutation.mutate(values))}
          noValidate
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.firstName")}</FormLabel>
                  <FormControl>
                    <Input autoComplete="given-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.lastName")}</FormLabel>
                  <FormControl>
                    <Input autoComplete="family-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="businessName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.businessName")}</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" placeholder={t("signup.businessPlaceholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="storeName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.firstStoreName")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("signup.storePlaceholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.email")}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("fields.password")}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {signupMutation.error && (
            <p className="text-sm text-destructive">{(signupMutation.error as Error).message}</p>
          )}
          <Button type="submit" className="w-full" disabled={signupMutation.isPending}>
            {signupMutation.isPending ? t("signup.submitting") : t("signup.submit")}
          </Button>
        </form>
      </Form>
    </AuthLayout>
  );
}
