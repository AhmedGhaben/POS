// First-run page: saves the server address through the desktop bridge,
// which checks /health before accepting it. Shown before anyone signs in,
// so it follows the computer's language (pt-BR → Brazilian, other pt →
// European, else English); see docs/plans/I18N.md.
const TEXTS = {
  en: {
    title: "Connect this till",
    intro: "Enter the address of your POS server. You only need to do this once on this computer.",
    label: "Server address",
    connect: "Connect",
    checking: "Checking…",
    invalid: "That isn't a valid address",
    unreachable: "Couldn't reach a POS server at that address",
    failed: "Something went wrong. Try again.",
  },
  "pt-PT": {
    title: "Ligar esta caixa",
    intro: "Introduza o endereço do servidor do ponto de venda. Só precisa de fazer isto uma vez neste computador.",
    label: "Endereço do servidor",
    connect: "Ligar",
    checking: "A verificar…",
    invalid: "Esse endereço não é válido",
    unreachable: "Não foi possível encontrar um servidor de ponto de venda nesse endereço",
    failed: "Algo correu mal. Tente novamente.",
  },
  "pt-BR": {
    title: "Conectar este caixa",
    intro: "Digite o endereço do servidor do PDV. Você só precisa fazer isso uma vez neste computador.",
    label: "Endereço do servidor",
    connect: "Conectar",
    checking: "Verificando…",
    invalid: "Esse endereço não é válido",
    unreachable: "Não foi possível encontrar um servidor de PDV nesse endereço",
    failed: "Algo deu errado. Tente de novo.",
  },
};

function pickLanguage() {
  for (const tag of navigator.languages || [navigator.language]) {
    const lower = String(tag).toLowerCase();
    if (lower === "pt-br") return "pt-BR";
    if (lower.startsWith("pt")) return "pt-PT";
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}

const lang = pickLanguage();
const t = TEXTS[lang];
document.documentElement.lang = lang;
document.getElementById("title").textContent = t.title;
document.getElementById("intro").textContent = t.intro;
document.getElementById("label").textContent = t.label;

const form = document.getElementById("form");
const input = document.getElementById("server");
const submit = document.getElementById("submit");
const error = document.getElementById("error");
submit.textContent = t.connect;

window.posDesktop.settings.get().then(({ serverUrl }) => {
  if (serverUrl) input.value = serverUrl;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  submit.disabled = true;
  submit.textContent = t.checking;
  try {
    const result = await window.posDesktop.settings.setServer(input.value);
    if (!result.ok) error.textContent = t[result.code] || result.error;
  } catch {
    error.textContent = t.failed;
  } finally {
    submit.disabled = false;
    submit.textContent = t.connect;
  }
});
