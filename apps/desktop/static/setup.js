// First-run page: saves the server address through the desktop bridge,
// which checks /health before accepting it.
const form = document.getElementById("form");
const input = document.getElementById("server");
const submit = document.getElementById("submit");
const error = document.getElementById("error");

window.posDesktop.settings.get().then(({ serverUrl }) => {
  if (serverUrl) input.value = serverUrl;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  submit.disabled = true;
  submit.textContent = "Checking…";
  try {
    const result = await window.posDesktop.settings.setServer(input.value);
    if (!result.ok) error.textContent = result.error;
  } catch {
    error.textContent = "Something went wrong. Try again.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Connect";
  }
});
