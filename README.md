# AWS Domain Manager

A terminal-based UI tool built with React and Ink for managing AWS resources across multiple accounts.

## Usage

```bash
npm i . && npm run build && npm run start
```

## Features

- **Route53 DNS Records** — Manage A/AAAA/CNAME/MX/TXT/NS records across hosted zones
- **EC2 Security Groups** — View, add, and delete inbound rules for security groups
- Terminal UI with keyboard navigation
- Support for AWS credential profiles
- Interactive resource creation

## Navigation

```
Resource Selection
  ├── Route53 Hosted Zones
  │     ├── Select account
  │     ├── Select hosted zone
  │     └── View/manage DNS records (a/A/c/m/t/n to add, d to delete)
  │
  └── EC2 Security Groups
        ├── Select account
        ├── Select security group
        └── View/manage inbound rules (a to add, d to delete)
```

### Key Bindings

| Key | Route53 Records | EC2 Rules |
|-----|----------------|-----------|
| `↑/↓` | Navigate list | Navigate list |
| `Enter` | Select | Select |
| `a` | Add A record | Add inbound rule |
| `A` | Add AAAA record | — |
| `c` | Add CNAME record | — |
| `m` | Add MX record | — |
| `t` | Add TXT record | — |
| `n` | Add NS record | — |
| `d` | Delete selected | Delete selected rule |
| `Esc` | Go back | Go back |

## Requirements

- Node.js 18+
- AWS credentials configured in `~/.aws/credentials`
- AWS region configured in `~/.aws/config` (EC2 is region-specific)
