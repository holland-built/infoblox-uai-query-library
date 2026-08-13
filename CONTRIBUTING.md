# Contributing

New queries are the most useful thing you can add here, and you do not need to be a developer to add one.

## The bar for a new query

A query belongs in the library once you can say yes to all four:

1. **You have run it** against a real tenant, in Advanced Mode, and it returned without error.
2. **The result made sense** — you looked at the count and at a few of the matching rows, and they are genuinely what the query claims to find.
3. **You can point at the evidence.** Open one matching asset, find the field and value that produced the match, and be able to name it. If you cannot do that, you cannot defend the result when someone pushes back on it.
4. **It answers a question someone actually asks.** Not "here is a field that exists", but "here is something people want to know and currently cannot easily find out".

A query that returns a big number is not automatically a good query. A query whose number you can explain is.

## Adding one

Queries live in [`queries/catalog.json`](queries/catalog.json). Add an object to the `queries` array:

```json
{
  "id": "assets-with-no-owner",
  "title": "Assets with No Assigned Owner",
  "category": "Discovery Hygiene",
  "query": "asset.SomeField IS \"EMPTY\"",
  "description": "What it finds, and why that matters operationally. Two or three sentences.",
  "bestUsedFor": "Which conversation or workflow this fits.",
  "tags": ["ownership", "data-quality"],
  "requiresProviders": [],
  "source": "community",
  "verified": "counted"
}
```

### The fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Lower-case kebab-case, unique, never reused for a different query. |
| `title` | yes | What appears in the panel. |
| `savedFilterName` | sometimes | A shorter name for the Saved Filter install. **Required** when `[Library] ` plus the title exceeds 50 characters — the product silently discards longer names, with no error. The build fails if you forget. |
| `category` | yes | Reuse an existing one where it fits rather than inventing a near-duplicate. |
| `query` | yes | The query text. Escape inner double quotes as `\"`. |
| `description` | yes | What it finds and why it matters. Not a restatement of the query. |
| `bestUsedFor` | no | The situation this is the right query for. |
| `proof` | no | How to verify a match by drilling into the raw provider attributes. |
| `tags` | no | Used by the panel's search box. |
| `requiresProviders` | no | Providers that must be integrated for this to mean anything. The panel greys the query out when they are missing, so please fill this in for anything provider-specific. |
| `params` | no | See below. |
| `source` | yes | `community` for anything you author. |
| `verified` | yes | `counted` if you ran it and checked the number; `syntax-only` if it ran but the tenant lacked the data to confirm it; `unverified` if you have not run it. Be honest — this tag is what makes the rest of the catalog trustworthy. |

### Never hard-code a date

A query with a fixed date in it is wrong the day after it is written. Use a parameter:

```json
"query": "asset.LastSeen BEFOREDATE {{param:notSeenSince}}",
"params": [
  {
    "name": "notSeenSince",
    "label": "Not seen since (days ago)",
    "type": "relativeDate",
    "default": -7,
    "min": -365,
    "max": -1
  }
]
```

`relativeDate` takes a number of days relative to today (negative for the past) and renders as the `MM-DD-YYYY` the product expects. `type` may also be `string` or `integer`.

Every `{{param:x}}` must be declared, and every declared parameter must be used. The build checks both.

### Check it builds

```bash
node build/build.mjs
```

No dependencies, no install step — you just need Node. It validates the catalog (unique ids, balanced quotes and brackets, parameters declared and used, a recognised operator present, Saved Filter names within the 50-character limit) and fails with a specific message if something is off.

### Beware the asynchronous result count

When you check a query by hand, the results table updates asynchronously. Read the count too early and you get the **previous** query's number — which looks like a perfectly plausible result. This has produced wrong conclusions twice while building this library. Wait for the count to settle, and treat any result that exactly equals the previous query's count as suspect until you have re-run it.

## What does not belong here

- **Anything tenant-specific.** Discovery job names, asset names, IP addresses, account IDs, internal hostnames, customer names. This repository is public. Queries should be portable; if a query only works in one tenant, it belongs in your own notes.
- **Internal-only material.** Do not paste in content from internal enablement decks, playbooks or portals. Descriptions here should stand on their own as technical writing.
- **Screenshots containing real customer data.** Screenshots of a demo tenant are fine — that is what the images in the README are. Anything showing a real customer's estate is not, even partially, and even if it looks anonymous.

## Changing the script itself

The userscript source is [`src/uai-query-library.user.js`](src/uai-query-library.user.js). `dist/` is generated — edit the source, then run the build.

Anything that touches the app's DOM or its Monaco editor belongs in the `adapter` object. Keeping that coupling in one place means an upstream UI change breaks one section rather than being scattered through the file.

If you change the adapter, test it against a live tenant. There is no test suite that can stand in for that, because the whole thing is a conversation with someone else's UI.

## Reporting a broken query

Open an issue with the query id, what you expected, what you got, and — if the product's UI has changed — what it looks like now. A query that silently returns nothing is a bug worth reporting, not something to work around quietly.
