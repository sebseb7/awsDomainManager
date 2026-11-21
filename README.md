# AWS Domain Manager

A terminal-based UI tool built with React and Ink for managing AWS resources across multiple accounts.

## Usage

```bash
npm i . && npm run build && npm run start
```

## Features

- **Route53 DNS Records** — Manage A/AAAA/CNAME/MX/TXT/NS records across hosted zones
- **EC2 Security Groups** — View, add, and delete inbound rules for security groups
- **S3 Buckets** — List, create (with optional scoped Put-Only and/or Read-Only IAM user creation — never delete), and delete S3 buckets, plus browse prefixes/folders and upload, download, or delete objects
- **AWS Account Management** — Add, edit, and remove AWS credential profiles (`~/.aws/credentials` and `~/.aws/config`) directly from the tool
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
  ├── EC2 Security Groups
  │     ├── Select account
  │     ├── Select security group
  │     └── View/manage inbound rules (a to add, d to delete)
  │
  ├── S3 Buckets
  │     ├── Select account
  │     ├── View/create/delete buckets (a to create, d to delete, Enter to browse)
  │     └── Browse/manage bucket objects (Enter to open folder, u to upload, g to download, d to delete)
  │
  └── Manage AWS Accounts
        └── View/add/edit/remove AWS profiles (a to add, e/Enter to edit, d to remove)
```

### Key Bindings

| Key | Route53 Records | EC2 Rules | S3 Buckets | S3 Objects | Manage AWS Accounts |
|-----|----------------|-----------|------------|------------|---------------------|
| `↑/↓` | Navigate list | Navigate list | Navigate list | Navigate list | Navigate list |
| `Enter` | Select | Select | Browse bucket | Open folder | Edit selected account |
| `a` | Add A record | Add inbound rule | Create bucket | — | Add AWS account |
| `A` | Add AAAA record | — | — | — | — |
| `c` | Add CNAME record | — | — | — | — |
| `e` | — | — | — | — | Edit selected account |
| `g` | — | — | — | Download file | — |
| `m` | Add MX record | — | — | — | — |
| `t` | Add TXT record | — | — | — | — |
| `n` | Add NS record | — | — | — | — |
| `u` | — | — | — | Upload file | — |
| `d` | Delete selected | Delete selected rule | Delete bucket | Delete object | Remove selected account |
| `Esc` | Go back | Go back | Go back | Up folder / back | Go back |

## Requirements

- Node.js 18+
- AWS credentials configured in `~/.aws/credentials` (or add them via **Manage AWS Accounts**)
- AWS region configured in `~/.aws/config` (EC2 is region-specific)
