# Test signing key — not a secret

`test-key.pem` is a throwaway RSA key used only by the tests: the SAF-T hash
chain test vectors in `../signature.spec.ts` are made with it. It signs
nothing real. The API refuses to start in production with this key
(`signerFromEnv`), and the real key lives in secrets (`SAFT_PRIVATE_KEY`),
never in the repository.
