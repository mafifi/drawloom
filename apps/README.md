# Applications

Applications here are public-source reference composition roots. They select
concrete providers and host public Drawloom packages in a deployment or
distribution. Their `private: true` manifest flag prevents package publication,
not source disclosure. Proprietary workbenches belong in a separate repository;
see the [public/private boundary](../ARCHITECTURE.md#public-and-commercial-boundary).

The planned application targets are:

- hosted SvelteKit applications composed for Cloudflare;
- local SvelteKit applications packaged in a minimal Tauri shell.

No application is scaffolded until a product surface and its consumed contracts
have been accepted.
