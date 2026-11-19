# LAN access

To reach the UI from another device on your private network:

1. Set `HOST` in `.env` to this machine's LAN IP (for example `192.168.1.50`), not a public address.
2. Keep `PORT` set (default `3000`).
3. Restart the server so it binds that interface.
4. On Windows Firewall, allow inbound TCP for that PORT on the Private profile only, limited to `LocalSubnet`.
5. Do not port-forward the service and do not expose it to the internet.

`ALLOWED_CIDRS` defaults to loopback and private ranges. Clients outside those ranges receive HTTP 403.

Binding all interfaces (`0.0.0.0` or `::`) is refused unless `ALLOW_ALL_INTERFACES=true`.
