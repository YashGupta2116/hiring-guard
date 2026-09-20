# Low-cost AWS deployment (Lightsail)

This deploys the whole app on **one Amazon Lightsail Ubuntu server**: Next.js, API, Socket.IO,
worker, PostgreSQL, Redis, and persistent uploads. It avoids RDS, ElastiCache, ECS, a load balancer,
CDN, and S3, which keeps both cost and setup complexity low.

## Cost and server size

| Plan | Use it for | Current list price |
| --- | --- | --- |
| 2 GB RAM | Short demo / very light testing | $12 USD/month |
| **4 GB RAM** | Recommended for this full stack | **$24 USD/month** |

Use the 4 GB Linux/Unix bundle with public IPv4. This project runs five services plus a database, so
do not use the 512 MB or 1 GB plans. Pricing, transfer allowances, and free-tier eligibility can
change; confirm the details on [AWS Lightsail pricing](https://aws.amazon.com/lightsail/pricing/).
Mumbai has a lower included transfer allowance than the headline amount shown for some regions.

## 1. Make a cost guardrail first

1. Create/sign in to AWS and enable MFA for the root account.
2. In **Billing and Cost Management → Budgets**, create a **monthly cost budget** of `$30 USD` and
   email alert. It warns you; it does not shut down services.
3. Use only the single instance in this guide. Do not add a managed database, load balancer, CDN,
   or snapshots unless you intentionally accept their cost.

## 2. Create the server and set your domain

1. In Lightsail, create an instance: **Linux/Unix → Ubuntu 24.04 LTS → 4 GB RAM**.
2. Choose a close region (Mumbai is reasonable for India).
3. In its networking tab, allow **TCP 80** and **TCP 443**. Keep SSH (22) restricted to your own IP
   when possible.
4. Create a **static IP** in Lightsail and attach it to this running instance. It keeps the public
   address stable; check its small regional cost policy in the console.
5. At your domain registrar, create an `A` record such as `app.example.com` pointing to that static
   IP. HTTPS cannot finish until DNS resolves.

## 3. Install Docker

Click **Connect using SSH** in Lightsail, then run:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Reconnect, then verify:

```bash
docker version
docker compose version
```

## 4. Configure production secrets

Clone the project (a private repository needs a GitHub deploy key or access token):

```bash
git clone https://github.com/YashGupta2116/veritrust.git
cd veritrust/deploy
cp .env.production.example .env.production
chmod 600 .env.production
```

Edit it with `nano .env.production`. Set `DOMAIN` and `ACME_EMAIL`. Generate a distinct random value
for each of these fields by running `openssl rand -hex 32` six times: `POSTGRES_PASSWORD`,
`HASH_PEPPER`, `JWT_ACCESS_SECRET`, `JOIN_TOKEN_SECRET`, `CANDIDATE_TOKEN_SECRET`, and
`INTERNAL_SERVICE_TOKEN`. Leave `EVIDENCE_SIGNING_PRIVATE_KEY` blank initially.

## 5. Deploy

From `veritrust/deploy`, run the migration once, then start the app:

```bash
docker compose --env-file .env.production run --rm migrate
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
```

The first build can take several minutes. Caddy automatically issues and renews HTTPS once the DNS
record and firewall rules are ready. Open `https://app.example.com`.

To diagnose a failure:

```bash
docker compose --env-file .env.production logs --tail=100 caddy
docker compose --env-file .env.production logs --tail=100 api
docker compose --env-file .env.production logs --tail=100 worker
```

## Update the app

```bash
git -C .. pull
docker compose --env-file .env.production run --rm migrate
docker compose --env-file .env.production up -d --build
```

## Limits of this low-cost deployment

- All data is on one server. It is appropriate for a demo or small pilot, not fault-tolerant
  production. Snapshot before major changes and check snapshot pricing.
- Files persist through container rebuilds, but are not redundant like S3.
- Email is set to `log`: links are not sent by email. Configure a real SMTP provider before real
  invitations.
- Some users behind strict networks need a TURN server for WebRTC; it is not included because it
  adds infrastructure and cost.
- Do not run untrusted code with `SANDBOX_PROVIDER=local` or Docker on this server.

## Stop charges when finished

Download data you need, then delete the Lightsail instance, detach/delete the static IP, and delete
any snapshots or disks you no longer need. Stopping an instance alone can leave disk, snapshot, or
IP charges.
