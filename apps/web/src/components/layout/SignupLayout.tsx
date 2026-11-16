import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Store, Zap } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";
import { AuthAppearanceControls } from "./AuthAppearanceControls";
import { useAuthEntrance } from "./use-auth-entrance";
import "@/styles/storbit-login.css";

/** Decorative synthetic storefront: no merchant information or logo recreation. */
function Storefront() {
 return <svg className="storefront" viewBox="0 0 560 290" aria-hidden="true" focusable="false">
  <defs>
   <linearGradient id="signup-orbit" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#FF7A00"/><stop offset=".5" stopColor="#FF3366"/><stop offset="1" stopColor="#7A00FF"/></linearGradient>
   <linearGradient id="signup-shop" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#B84DFF"/><stop offset="1" stopColor="#6D28D9"/></linearGradient>
  </defs>
  <ellipse cx="280" cy="270" rx="250" ry="10" fill="#B84DFF" opacity=".16"/>
  <path d="M80 247C24 143 139 80 221 72C337 -27 475 53 464 168C506 240 407 277 331 257Z" fill="url(#signup-orbit)" opacity=".85"/>
  <rect x="146" y="56" width="276" height="204" rx="18" fill="url(#signup-shop)"/>
  <rect x="146" y="56" width="276" height="30" rx="15" fill="#7A00FF"/>
  <g fill="#FFB3E6"><circle cx="164" cy="71" r="4"/><circle cx="178" cy="71" r="4"/><circle cx="192" cy="71" r="4"/></g>
  <rect x="162" y="126" width="244" height="117" rx="5" fill="#EDEBFF"/>
  <g fill="#B84DFF" opacity=".3"><path d="M168 188H400V194H168Z M168 226H400V232H168Z"/></g>
  <g className="shop-box shop-box-one" fill="#FFB36C" stroke="#E99654" strokeWidth="1.5"><rect x="181" y="163" width="30" height="24" rx="2"/><rect x="215" y="153" width="36" height="34" rx="2"/><rect x="187" y="204" width="43" height="21" rx="2"/></g>
  <rect x="276" y="145" width="55" height="98" rx="4" fill="#7960BE"/>
  <rect x="282" y="151" width="43" height="85" rx="2" fill="#C9BFFF"/><circle cx="319" cy="196" r="3" fill="#6D28D9"/>
  <g className="shop-awning">
  <path d="M146 91H422L438 126H130Z" fill="#FF3366"/>
  <path d="M165 91H196L188 126H151Z M227 91H258L254 126H219Z M289 91H320L326 126H290Z M351 91H382L401 126H364Z" fill="#FFF0FA"/>
  <path d="M130 126H438V135Q421 151 403 135Q385 151 367 135Q349 151 331 135Q313 151 295 135Q277 151 259 135Q241 151 223 135Q205 151 187 135Q169 151 151 135Q140 145 130 135Z" fill="#FF77B7"/>
  </g>
  <g fill="#4DAD78"><path d="M111 248C47 217 70 166 111 225C80 156 128 143 119 228C152 175 177 209 122 251Z"/><path d="M454 249C414 218 438 181 459 229C459 169 499 183 468 239C513 203 526 238 467 253Z"/></g>
  <g fill="#7960BE"><path d="M95 237H131L125 263H101Z M443 239H480L473 263H450Z"/></g>
  <g className="shop-box shop-box-two">
  <g fill="#F5AD70" stroke="#E99654" strokeWidth="2"><rect x="83" y="239" width="54" height="28" rx="3"/><rect x="110" y="210" width="48" height="29" rx="3"/></g>
  <g stroke="#FFE0B8" strokeWidth="6"><path d="M110 240V250 M134 211V221"/></g>
  </g>
  <rect className="onboarding-card" x="367" y="154" width="165" height="83" rx="14"/>
  <g className="shop-check shop-check-one"><circle cx="389" cy="176" r="8" fill="#44C898"/><path d="M385 176L388 179L393 173" fill="none" stroke="white" strokeWidth="2"/></g>
  <g className="shop-check shop-check-two"><circle cx="389" cy="196" r="8" fill="#44C898"/><path d="M385 196L388 199L393 193" fill="none" stroke="white" strokeWidth="2"/></g>
  <g className="shop-check shop-check-three"><circle cx="389" cy="216" r="8" fill="#44C898"/><path d="M385 216L388 219L393 213" fill="none" stroke="white" strokeWidth="2"/></g>
  <g stroke="#A993D7" strokeWidth="5" strokeLinecap="round"><path d="M408 176H510 M408 196H491 M408 216H500"/></g>
 </svg>;
}

export function SignupLayout({ children, footer }: { children: ReactNode; footer: ReactNode }) {
 const { t } = useTranslation("auth");
 const { theme } = useTheme();
 const entranceRef = useAuthEntrance();
 return <main ref={entranceRef} className="storbit-login storbit-signup">
  <aside className="brand-panel">
   <div className="brand-top"><img className="logo-img" src={theme === "dark" ? "/brand/storbit-logo-light.png" : "/brand/storbit-logo-original.png"} alt="STORBIT" width="2172" height="724" /></div>
   <div className="brand-copy"><div className="eyebrow">{t("login.eyebrow")}</div><h1>{t("signup.headline")}</h1><p>{t("signup.brandDescription")}</p><div className="brand-accent" aria-hidden="true" /></div>
   <Storefront />
   <ul className="signup-benefits">{([{ key: "fast", Icon: Zap }, { key: "stores", Icon: Store }, { key: "unified", Icon: Layers }] as const).map(({ key, Icon }) => <li key={key}><span className="benefit-icon"><Icon aria-hidden="true" /></span><strong>{t(`signup.benefits.${key}.title`)}</strong><p>{t(`signup.benefits.${key}.description`)}</p></li>)}</ul>
  </aside>
  <AuthAppearanceControls />
  <section className="auth-panel" aria-labelledby="signup-heading"><div className="auth-content">
   <div className="workspace-label">{t("signup.workspace")}</div><h2 id="signup-heading">{t("signup.title")}</h2><p className="auth-intro">{t("signup.description")}</p>
   {children}<div className="signup">{footer}</div>
  </div><div className="auth-footer">{t("login.tagline")}</div></section>
 </main>;
}
