# Cmpe492-Project
This repository is about graduate project in Boğaziçi University Computer Engineering Department

A full-stack Web3 jukebox: listeners claim JukeCoin (JUKE) from a faucet and pay 0.001 JUKE on-chain for
each song they play.

## Repository layout

```
Cmpe492-Project/
├── backend/                 Django + Django REST Framework API
│   ├── config/              project settings, root URLs, ASGI/WSGI
│   ├── api/                 API routing (GET /api/health/)
│   ├── users/               custom User model with wallet_address, token auth endpoints
│   ├── music/               Song + Play models, track list, paid-play verification and streaming
│   ├── media/music/         drop audio files here (not committed, not publicly served)
│   ├── manage.py
│   ├── requirements.txt
│   └── .env.example         copy to .env
├── frontend/                React 19 + Vite + React Router 7, ethers v6
│   ├── src/api/             fetch wrapper for the Django API
│   ├── src/auth/            auth state (token), route guards
│   ├── src/web3/            MetaMask connection, JukeCoin contract calls
│   ├── src/components/      wallet panel, paid player, form pieces
│   ├── src/pages/           Login, Register, Dashboard
│   └── .env.example         copy to .env.local
├── contracts/               Solidity + Hardhat 3 (mocha + ethers toolbox)
│   ├── contracts/           JukeCoin.sol (ERC-20 + faucet + payForPlay), Jukebox.sol (starter)
│   ├── test/                Mocha tests
│   ├── ignition/modules/    deployment modules
│   └── hardhat.config.ts
└── .github/                 issue + PR templates
```

## Prerequisites

- Python 3.11+
- Node.js 22.10+ (required by Hardhat 3) and npm
- MetaMask in your browser

## First-time setup

Commands are given for Windows PowerShell; macOS/Linux differences are noted.

```powershell
# backend
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env              # macOS/Linux: cp .env.example .env
# put a real DJANGO_SECRET_KEY in .env, generated with:
python -c "from django.core.management.utils import get_random_secret_key as k; print(k())"
python manage.py migrate
python manage.py createsuperuser    # optional, for /admin/
cd ..

# frontend
cd frontend
npm install
copy .env.example .env.local        # macOS/Linux: cp .env.example .env.local
cd ..

# contracts
cd contracts
npm install
npm test
cd ..
```

## Running the whole app locally

Use four terminals, in this order:

```powershell
# 1. local blockchain (chain id 31337 on http://127.0.0.1:8545)
cd contracts; npm run node

# 2. deploy JukeCoin. Do this first on a fresh node so it lands at 0x5FbDB2315678afecb367f032d93F642f64180aa3,
#    the address already in both .env.example files. Otherwise, copy the printed address into
#    JUKECOIN_ADDRESS (backend/.env) and VITE_JUKECOIN_ADDRESS (frontend/.env.local).
cd contracts; npm run deploy:jukecoin:local

# 3. API on http://localhost:8000
cd backend; .venv\Scripts\Activate.ps1; python manage.py runserver

# 4. web app on http://localhost:5173
cd frontend; npm run dev
```

The Hardhat chain starts empty every time the node restarts, so repeat step 2 after each restart.

### MetaMask setup (once)

1. Add the network: Settings → Networks → Add network manually:
   name `Hardhat Local`, RPC URL `http://127.0.0.1:8545`, chain ID `31337`, currency `ETH`.
   The app's **Switch to Hardhat Local** button can also add it for you.
2. Import a test account: Account menu → Add account → Import account, and paste one of the private keys that
   `npm run node` prints, e.g. Account #1. These keys are public. **Never send real funds to them.**
3. After restarting the node, reset the account's nonce, or MetaMask's transactions will fail:
   Settings → Advanced → **Clear activity tab data**.

### Using the app

1. Register or log in.
2. **Connect Wallet**, then **Claim 1000 JukeCoin** (once per 24 hours per wallet).
3. Press **Play (0.001 JukeCoin)** next to a song and confirm the transaction in MetaMask. The song plays once.

How a paid play works:

1. The frontend asks Django for a play (`POST /api/tracks/<id>/plays/`) and gets a random one-time `play_id`.
2. MetaMask sends `JukeCoin.payForPlay(songId, play_id)`, which burns 0.001 JUKE and emits `SongPlayed`.
3. The frontend sends the transaction hash to Django (`POST /api/plays/<id>/confirm/`). Django reads the receipt
   from the chain and checks that it succeeded, came from the JukeCoin contract, paid for this song and this
   `play_id`, and hasn't been used before.
4. Django returns a signed stream URL that is valid for 10 minutes. The player plays it once, without seek or replay controls.

Audio files are never served publicly, so a song can't be fetched without a verified payment.

## Adding music

1. Copy audio files (`mp3`, `wav`, `ogg`, `flac`, `m4a`, `aac`) into `backend/media/music/`. Subfolders are fine.
2. Run `python manage.py sync_music` to register them. Title and artist come from the file's tags, or from an
   `Artist - Title.mp3` filename when the file has no tags. Add `--prune` to remove tracks whose file was deleted.

You can also edit titles and artists in the Django admin, where paid plays are listed too.

## API

| Method | Path                         | Auth   | Purpose                                              |
| ------ | ---------------------------- | ------ | ---------------------------------------------------- |
| GET    | `/api/health/`               | none   | Liveness check                                       |
| POST   | `/api/auth/register/`        | none   | `{username, password, email?}` → `{token, user}`      |
| POST   | `/api/auth/login/`           | none   | `{username, password}` → `{token, user}`              |
| POST   | `/api/auth/logout/`          | token  | Deletes the token                                    |
| GET    | `/api/auth/me/`              | token  | Current user                                         |
| GET    | `/api/tracks/`               | token  | `[{id, title, artist}]`                              |
| POST   | `/api/tracks/<id>/plays/`    | token  | Start a paid play → `{id, song_id, play_id}`         |
| POST   | `/api/plays/<id>/confirm/`   | token  | `{tx_hash}` → `{stream_url, expires_in}` once verified |
| GET    | `/api/plays/<id>/stream/`    | signed `?token=` | The audio file                          |

Authenticated requests send the header `Authorization: Token <token>`. Login and register are limited
to 20 requests per minute per client.

## Contracts

```powershell
cd contracts
npm run compile                     # npx hardhat build
npm test                            # npx hardhat test
npm run deploy:jukecoin:local       # JukeCoin to the running local node
npm run deploy:local                # Jukebox.sol starter contract (not used by the app)
```

`JukeCoin` (JUKE) is a test ERC-20 token:
- `claimTokens()` mints 1,000 JUKE to the caller, once every 24 hours.
- `payForPlay(songId, playId)` burns `PLAY_PRICE` (0.001 JUKE) and emits `SongPlayed`. The backend verifies plays by
  this event's signature; a test pins its topic hash, so changing the event means updating `backend/music/chain.py`.

To see your balance inside MetaMask too, import the token by its contract address.

Sepolia secrets are stored in the Hardhat keystore rather than in files:

```powershell
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy ignition/modules/JukeCoin.ts --network sepolia
```

## How this was scaffolded

For reference, these are the commands used to create the skeleton:

```powershell
git checkout -b feature/setup-monorepo

# backend
mkdir backend
python -m venv backend\.venv
backend\.venv\Scripts\pip install django djangorestframework django-cors-headers python-dotenv
backend\.venv\Scripts\django-admin startproject config backend
cd backend; .venv\Scripts\python manage.py startapp api; cd ..

# frontend ('--' is quoted because Windows PowerShell 5.1 swallows a bare --)
npm create vite@latest frontend '--' --template react --no-interactive
cd frontend; npm install; npm install ethers; cd ..

# contracts (manual equivalent of the interactive `npx hardhat --init`)
mkdir contracts; cd contracts
npm init -y; npm pkg set type=module
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox-mocha-ethers ethers chai mocha `
  typescript@~6.0.3 @types/node @types/mocha @types/chai `
  @nomicfoundation/hardhat-ethers @nomicfoundation/hardhat-ethers-chai-matchers `
  @nomicfoundation/hardhat-ignition @nomicfoundation/hardhat-ignition-ethers `
  @nomicfoundation/hardhat-keystore @nomicfoundation/hardhat-mocha `
  @nomicfoundation/hardhat-network-helpers @nomicfoundation/hardhat-typechain `
  @nomicfoundation/hardhat-verify @nomicfoundation/ignition-core
# then hardhat.config.ts, tsconfig.json, contracts/, test/, ignition/ were added by hand
```
