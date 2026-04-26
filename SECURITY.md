# Security Policy

## Supported versions

Security fixes are expected to land on `main` and in the next GitHub Release / GHCR image.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue. Use GitHub's private vulnerability reporting if it is enabled for this repository, or contact the repository owner directly.

## Deployment security notes

- `API_TOKEN` protects write endpoints by requiring the `x-api-token` header.
- The browser UI and read endpoints are not a full authentication system.
- If you expose the app beyond a trusted LAN, put it behind a real auth layer such as a reverse proxy, VPN, or identity-aware gateway.
- Treat exports and SQLite backups as personal health data; store and share them carefully.
