# UAI Advanced Mode query language reference

Notes on the Asset Inventory **Advanced Mode** filter language, gathered by inspecting a live tenant. This is not official documentation and Infoblox may change any of it without notice.

The filter bar is a [Monaco](https://microsoft.github.io/monaco-editor/) editor whose language id is **`filterel`**. Queries are compiled client-side into [Cube.js](https://cube.dev/) queries against an `AssetDetails_ch_agg` cube.

## Shape of a query

```
<field> <operator> <value>
```

joined with `AND` / `OR`, grouped with parentheses:

```
asset.Type IN ["Laptop", "Workstation"] AND asset.OSType IN ["Windows"]
(asset.Confidence IN ["Low"]) OR (asset.Classifications IN ["Zombie"])
```

Field names may be written bare (`Type`) or namespaced (`asset.Type`). Both are accepted. Namespaced is preferred in this library: it is unambiguous, and it is the form the editor's autocomplete offers.

Operator keywords are conventionally uppercase. String values are double-quoted; list values go in `[ ... ]`.

## What differs between tenants, and what does not

Two tenants inspected on the same day presented noticeably different **autocomplete**, which is easy to mistake for a different query language. Tested against live data, it is not:

| | Tenant A | Tenant B |
|---|---|---|
| Root autocomplete | only `asset` | bare field names plus provider namespaces |
| `asset.` autocomplete | full field list | nothing |
| `Classifications` shown as | `Zombie`, `Noncompliant` | `zombie`, `oseol`, `oseos`, `oseossec`, `compliance`, `registration` |
| `MissingRecords` shown as | `DNS Forward Record`, `DNS Pointer Record`, `IPAM` | `missingdnsforwardrecord`, `missingdnsreverserecord` |
| Providers integrated | AWS, Azure, GCP, DHCP Logs, Infoblox Endpoint, NIOS | + ServiceNow, CrowdStrike, Intune, Jamf, Tenable, Meraki, Mist, Ordr, Aruba |
| Extra fields | — | `Category` (`Compute`, `Device`, `IoT`, `Network`, `Service`) |

**Queries are portable anyway.** Both differences are cosmetic, confirmed by comparing result counts on tenant B:

```
Type IN ["Laptop"]                              → 158     asset.Type IN ["Laptop"]                        → 158
Classifications IN ["zombie"]                   →  23     Classifications IN ["Zombie"]                   →  23
MissingRecords IN ["missingdnsforwardrecord"]   →  34     MissingRecords IN ["DNS Forward Record"]        →  34
```

So the `asset.` prefix is optional, and values are accepted in either the label or the code spelling, regardless of which one autocomplete happens to show you. This library uses the `asset.` prefix and label spellings throughout.

What genuinely does not carry across is **which providers and fields exist at all**. A `servicenow.*` query is meaningless where ServiceNow is not integrated, and `MissingRecords IN ["IPAM"]` only means something where IPAM data is present. That is what the `requiresProviders` field in the catalog is for.

> A caution learned the hard way while writing this page: the results table updates asynchronously, and reading the count too early gives you the *previous* query's number. Two of the figures above were wrong on first measurement for exactly that reason. When checking a query by hand, wait for the count to settle, and be suspicious of any result that exactly equals the previous one.

## Namespaces

| Namespace | Contents |
|---|---|
| `asset.` | The normalised, reconciled asset record. Always present. |
| `<provider>.` | Raw provider attributes, e.g. `servicenow.`, `crowdstrike_falcon.`, `intune.`, `jamf.`. Only present when that provider is integrated in the tenant. |

Provider namespaces expose the provider's own JSON structure verbatim, so paths are deep and provider-specific:

```
crowdstrike_falcon.crowdstrike_falcon_devices.device_policies.firewall.applied != "true"
```

**Autocomplete is tenant-scoped.** The editor only offers namespaces and values that exist in the tenant you are signed in to. A tenant with no Jamf integration will not suggest — and cannot usefully filter on — `jamf.*`.

## Operators

| Kind | Operators |
|---|---|
| String / enum | `=`, `IS`, `ISNOT`, `IN`, `NOTIN`, `CONTAINS`, `DOESNOTCONTAIN` |
| Date | `ONDATE`, `AFTERDATE`, `BEFOREDATE`, `INDATERANGE`, `NOTINDATERANGE` |
| Logical | `AND`, `OR` |

`!=` is also accepted on raw provider attributes.

Dates are written `MM-DD-YYYY`:

```
asset.LastSeen AFTERDATE 08-01-2026
```

`EMPTY` is a sentinel value meaning the field has no value:

```
asset.SerialNumber IS "EMPTY"
```

## `asset.` fields

The normalised schema, as offered by autocomplete:

```
CIDR                      LocationType              OSEndOfSecuritySupport
Classifications           MACAddresses              OSType
CloudAccountID            Managed                   OSVersion
Confidence                MissingRecords            OverallStatus
DHCPFingerprint           Model                     Providers
DiscoveryHost             Name                      ProvidersLabel
FirstSeen                 OperatingSystem           Region
FirstSync                 OSBuild                   RegistrationStatus
IPAddresses               OSEndOfLife               SerialNumber
LastSeen                  OSEndOfSale               Source
LastSync                  SubClassifications        Tags
Location                  Type                      UserCount
                                                    Vendor
```

## Value vocabularies

Values below are those the product defines. Which ones actually appear depends on the tenant.

**`Confidence`** — `High`, `Medium`, `Low`, `EMPTY`

**`OverallStatus`** — `OK`, `ERROR`, `EMPTY`

**`LocationType`** — `Cloud`, `Onprem`, `EMPTY`

**`MissingRecords`** — `DNS Forward Record`, `DNS Pointer Record`, `IPAM`, `EMPTY`

**`OSType`** — `Windows`, `macOS`, `Linux`, `iOS`, `iPadOS`, `Android`, `VMware`, `Network OS`, `Embedded`, `Tizen`, `Axis`, `EMPTY`

**`Classifications`** — UAI's own insight taxonomy: `Zombie`, `Noncompliant`, `EMPTY`

**`SubClassifications`** — `Orphan`, `Public Access`, `Unencrypted`, `Resource Utilization Idle`, `Resource Utilization Low`, `EMPTY`

**`Type`** — the device taxonomy:

```
Cloud NAT              Internet Gateway              Smart Door Bell     Streaming Device
Cloud Security Group   Laptop                        Smart Plug          Surveillance Camera
Desktop                Network Application Server    Smart Speaker       Switch
DNS Server             PDU                           Smart TV            Tablet
End User Device        Printer                       Smartphone          Unclassified
Gateway                Public IP Address             Storage Bucket      Virtual Machine
Generic IoT            Router                        Storage Volume      VoIP Phone
Hypervisor Host        Server                        Set-Top-Box         VPN Gateway
                       Smart Controller                                  Wireless Access Point
                                                                         Workstation
```

## Behaviour worth knowing

**The default `Managed IS "True"` filter.** Asset Inventory ships with this filter applied. Clear it before pasting a query that is already scoped, or the two combine and you get fewer results than you expect.

**A rolling time window.** The inventory view scopes results to assets whose `updated_at` falls in a trailing window (7 days in the tenant inspected). Counts are "assets seen recently", not "all assets ever".

**Advanced queries are one-way.** Once a query uses advanced syntax, the UI cannot convert it back to Basic Mode. It says so in a tooltip on the Basic Mode link.

**There is no client-side validation.** The editor registers no diagnostics: malformed queries produce no error markers and do not disable Apply. Mistakes surface only when the query reaches the server. Verify a query by running it and sanity-checking the count, not by trusting that it parsed.

## Saved Filters

The Save control next to the filter bar stores the current query as a named Saved Filter, listed under **Saved Filters** and manageable from the row menu there (Run Now, Mark as Favorite, Clone, Delete — Delete takes effect immediately, with no confirmation step).

**Names are capped at 50 characters, and the cap fails silently.** Measured on a live tenant: a 50-character name saves; a 51-character name does not, the popover closes as though it worked, and nothing appears in the list. There is no error message.

This is worth knowing beyond this project, because the obvious way to script bulk creation — click Save, type a name, click Save, assume it worked — will report complete success while quietly dropping every entry with a long name. Four of twenty-two went missing that way before the cause was found. Always read the list back.

## Asset Inventory has more than one route

The left nav reaches the same Asset Inventory page by two different routes, and they are not variants of one path:

| Menu path | Route |
|---|---|
| **Assets → Inventory** | `#/workspace/assets/unified-details/managed-assets` |
| **Network → Assets in Network** | `#/workspace/assets`, which redirects to `#/workspace/assets/details/managed-assets` |

Both render the same filter bar and the same `filterel` Monaco editor, so anything scripted against one works on the other. The default row scoping differs, though — the same tenant reported 1721 assets on `unified-details` and 2318 on `details` — so do not compare counts taken from different routes.

Anything matching on the route should match the `#/workspace/assets` prefix rather than a single leaf. Matching `/workspace/assets/details/` alone silently misses the menu item most people actually use.

## The portal routes with pushState, not hash assignment

Worth knowing before scripting anything that has to react to navigation: **`hashchange` does not fire when this app changes route.** Measured on a live route change from `.../details/...` to `.../unified-details/...`, the hash changed and `hashchange` fired zero times, because `history.pushState` never emits it — even when the hash it writes differs.

A `MutationObserver` on `document.body` is not a workaround either; with `childList` alone it only sees direct children, and route swaps happen deep in the tree.

What does work is wrapping `history.pushState` and `history.replaceState`, listening for `popstate`, and polling `location.href` as a backstop. Route changes also do **not** reload the page, so a userscript runs once and must handle every later navigation itself.

## Filter state in the URL

Asset Inventory keeps filter state in the URL hash:

```
#/workspace/assets/details/managed-assets?isAdvanced=true&advancedFilterValue=<encoded>&filter_items=<encoded>
```

Both encoded values are `JSON.stringify`'d and then compressed with [lz-string](https://github.com/pieroxy/lz-string)'s `compressToEncodedURIComponent`. So:

```js
advancedFilterValue = LZString.compressToEncodedURIComponent(JSON.stringify(queryText))
```

This is what makes shareable query links possible — construct that URL and send it to anyone with tenant access.

Two limits, both confirmed by testing:

- The link **pre-loads** the query into the Advanced Mode filter bar. It does not run it; the recipient still presses Apply.
- The URL is only read on a **full page load**. Changing the hash in an already-open tab is ignored, because the SPA does not re-read filter state on hash change.

Applying an advanced query also back-fills `filter_items` with an equivalent basic-mode representation, which is where the underlying Cube dimension names are visible (`AssetDetails_ch_agg.providers`, `.taxonomy_types`, `.os_type`, and so on).
