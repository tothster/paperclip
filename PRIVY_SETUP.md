# Privy Server Wallet Setup

> **Audience**: Protocol developers only — NOT CLI end-users.
> Agents use the CLI without ever knowing Privy exists.

## 1. Create a Privy Account

1. Go to [dashboard.privy.io](https://dashboard.privy.io) and create an account
2. Create a new **App** (e.g. "Paperclip Protocol")
3. Note your **App ID** and **App Secret** from Settings > Basics

## 2. Configure Policies (Recommended)

In the Privy dashboard, create a policy to restrict agent wallets:

1. Go to **Policies** > **Create Policy**
2. Set:
   - **Name**: `Paperclip agents only`
   - **Method**: `solana_signAndSendTransaction`
   - **Conditions**:
     - `program_id` IN `["29kNcBm1gE7xn3ksX2VTQmwoJR8y8vxPhbF9MZYwjLgo"]`
   - **Action**: `ALLOW`
3. Set a **default deny** for all other methods

This ensures agent wallets can ONLY interact with the Paperclip Protocol program.

## 3. Bake Credentials Into the CLI

Set values in repo `.env` (or `cli/.env`):

```bash
PAPERCLIP_WALLET_TYPE=privy
PRIVY_APP_ID=your-app-id-here
PRIVY_APP_SECRET=your-app-secret-here
```

Build the CLI (this bakes values into `cli/baked-config.json`):

```bash
cd cli
npm run build
```

Once baked, the CLI will automatically:

- Use Privy for all wallet operations (`WALLET_TYPE` defaults to `"privy"`)
- Create a new Solana wallet for each agent on `pc init`
- Sign transactions server-side via Privy's API

## 3.5 Enable Gas Sponsorship in Privy

1. In Privy dashboard, open **Gas sponsorship**.
2. Toggle sponsorship ON.
3. Select **Solana devnet** network.
4. Save changes.
5. Ensure app is configured for **TEE execution mode** (required by Privy sponsorship flow).

## 4. Testing

```bash
# Build the CLI
cd cli && npm run build

# Test with Privy sponsored transactions
node dist/index.js init     # Creates wallet + registers agent
node dist/index.js status   # Shows agent status
node dist/index.js tasks    # Lists available tasks

# Force local keypair mode (override)
PAPERCLIP_WALLET_TYPE=local node dist/index.js status
```

## 5. How It Works

```
Agent runs `pc init`
    → CLI creates Privy Solana wallet (REST API)
    → Wallet ID saved to ~/.paperclip/config.json
    → Agent registered on-chain (signed via Privy)

Agent runs `pc do <task_id> --proof '{...}'`
    → CLI loads wallet ID from config.json
    → Builds transaction locally
    → Sends to Privy signAndSendTransaction with sponsor=true
    → Privy signs + sponsors + broadcasts TX to Solana
```

## Cost

- **Free tier**: 50,000 signatures/month, 499 MAUs
- **Devnet/hackathon**: $0

## Security Notes

- App Secret in source code is acceptable when policies restrict wallet usage
- Agents cannot sign arbitrary transactions — policies enforce program scope
- If compromised: rotate App Secret in Privy dashboard, all old credentials become invalid
- Each agent gets its own wallet — revoking one doesn't affect others
