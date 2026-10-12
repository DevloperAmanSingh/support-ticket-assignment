# Support ticket assignment

A service that assigns each new support ticket to an available agent. The product rules are in `docs/prd.md`. The design is in `docs/implementation.md`.

- `server/` is the API, on Express and PostgreSQL.
- `web/` is the UI for the team lead, on React.
- `shared/` holds the request and response types that both sides import.

## Set up

You need Node 26 or later, and Docker. Run the commands from the repository root.

1. Start PostgreSQL. This creates the `tickets` database for the app and `tickets_test` for the tests.

   ```
   docker compose up -d
   ```

2. Install the server and create the tables.

   ```
   cd server
   npm install
   npm run db:migrate
   ```

3. Load the sample data. The seed replaces all data in `tickets`. It loads two companies, `acme` and `globex`, with agents and tickets.

   ```
   npm run seed
   ```

4. Install the UI.

   ```
   cd ../web
   npm install
   ```

## Run

1. In `server/`, start the API. It listens on `http://localhost:3000/api`.

   ```
   npm start
   ```

2. In a second terminal, start the UI. Open the address that the command prints, by default `http://localhost:5173`.

   ```
   cd web
   npm run dev
   ```

To assign a ticket as the ticket system does, call the API:

```
curl -X POST http://localhost:3000/api/companies/acme/assignments \
  -H 'Content-Type: application/json' \
  -d '{"ticket_id":"T-500"}'
```

The response names the agent and gives the reason. In the UI, **Team schedule** sets shifts, timezone, and ticket limit. **Coverage** shows the gaps. **Tickets** shows each decision, and has **Assign again** for unassigned tickets.

## Test

The server tests need PostgreSQL. They use `tickets_test` and do not touch `tickets`.

```
cd server && npm test
cd web && npm test
```

Each folder also has `npm run typecheck` and `npm run lint`.

## Settings

The defaults match `docker-compose.yml`, so no setup is needed. To change a value, set it in the shell.

| Variable | Default |
|---|---|
| `DATABASE_URL` | `postgres://app:app@localhost:5432/tickets` |
| `TEST_DATABASE_URL` | `postgres://app:app@localhost:5432/tickets_test` |
| `PORT` | `3000` |
| `LOG_LEVEL` | `info` |

## What is simplified

- There is no login. Companies and agents come from the seed, and the UI does not create them.
- There is no real ticket system. The **New ticket** form and the **Close** button in the UI call the same API in its place.
- Decisions for one company run one at a time, under one database lock.
- A request that waits more than 750 ms gets a 503. The caller sends the ticket again.

## What I would build next

1. A stored open count and last assignment time on each agent. Today the service counts from `tickets` on each decision, and that reads more rows as closed tickets grow.
2. A queue for each company. Today a request that waits for the lock holds a database connection.
3. One-time schedule changes, such as a sick day or a holiday.
4. Login and roles, so that only a lead can change a schedule.
