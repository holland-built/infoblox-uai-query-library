// ==UserScript==
// @name         UAI Query Library
// @namespace    https://github.com/IngmarVG-IB/infoblox-uai-query-library
// @version      0.1.2
// @description  Adds a curated, searchable query library to the Infoblox Universal Asset Insights Asset Inventory page.
// @author       Infoblox SE Team
// @license      MIT
// @match        https://csp.infoblox.com/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/IngmarVG-IB/infoblox-uai-query-library
// @supportURL   https://github.com/IngmarVG-IB/infoblox-uai-query-library/issues
// @updateURL    https://github.com/IngmarVG-IB/infoblox-uai-query-library/raw/main/dist/uai-query-library.user.js
// @downloadURL  https://github.com/IngmarVG-IB/infoblox-uai-query-library/raw/main/dist/uai-query-library.user.js
// ==/UserScript==

/*
 * An Infoblox project, built by the Infoblox SE team. Not part of the shipping
 * product and carries no support SLA.
 *
 * Privacy: this script makes no network requests of its own while it runs. It
 * sends no telemetry, fetches no remote catalog, and reads no asset data. It
 * puts text into the page's own filter box and clicks the page's own buttons.
 * The whole catalog is baked into this file at build time, so you can read
 * exactly what it will run before you install it.
 *
 * The one exception is outside the script: @updateURL asks your userscript
 * manager to check GitHub periodically for a new version. That is the
 * extension talking to github.com, not this code, and you can turn it off in
 * the extension's settings.
 *
 * @grant none is deliberate: it runs the script in the page's own context,
 * which is what makes window.monaco reachable. Storage therefore uses
 * localStorage rather than GM_setValue.
 */

(function () {
  'use strict';

  /** Injected at build time from queries/catalog.json. */
  const CATALOG = {
  "$schema": "./schema.json",
  "catalogVersion": "0.1.0",
  "queries": [
    {
      "id": "missing-from-servicenow",
      "title": "Assets Missing from ServiceNow",
      "savedFilterName": "Missing from ServiceNow",
      "category": "CMDB Reconciliation",
      "query": "Providers NOTIN [\"ServiceNow\"]",
      "description": "Any asset type with no ServiceNow record at all, regardless of ownership or device class. Not devices that are wrong in the CMDB — devices that are entirely absent from it. The broadest CMDB-completeness check there is.",
      "bestUsedFor": "Broad CMDB-hygiene conversations, and a strong opener with anyone who has not yet questioned their CMDB's completeness.",
      "tags": [
        "cmdb",
        "servicenow",
        "coverage",
        "opener"
      ],
      "requiresProviders": [
        "ServiceNow"
      ],
      "source": "workbook",
      "verified": "counted"
    },
    {
      "id": "managed-fleet-not-in-servicenow",
      "title": "Assets in EDR/MDM Fleet but Not in ServiceNow",
      "savedFilterName": "EDR/MDM Not in ServiceNow",
      "category": "CMDB Reconciliation",
      "query": "Type IN [\"Laptop\", \"Workstation\"] AND Providers CONTAINS \"CrowdStrike Falcon\" AND (Providers CONTAINS \"Microsoft Intune\" OR Providers CONTAINS \"Jamf Pro\") AND Providers NOTIN [\"ServiceNow\"]",
      "description": "Laptops and workstations that are already confirmed managed devices — covered by CrowdStrike for security and by Intune or Jamf for device management — yet have no ServiceNow record at all. Unlike a generic 'missing from CMDB' check, this rules out the 'maybe it is just noise' objection: these are devices the security and MDM stack already trusts.",
      "bestUsedFor": "CMDB-completeness conversations with IT and security leaders who assume anything actively managed is automatically tracked in the CMDB.",
      "tags": [
        "cmdb",
        "servicenow",
        "edr",
        "mdm",
        "crowdstrike",
        "intune",
        "jamf"
      ],
      "requiresProviders": [
        "ServiceNow",
        "CrowdStrike Falcon"
      ],
      "source": "workbook",
      "verified": "counted"
    },
    {
      "id": "retired-in-cmdb-still-on-network",
      "title": "Asset Marked as Retired in CMDB but Seen on the Network",
      "savedFilterName": "Retired in CMDB, Seen on Network",
      "category": "CMDB Reconciliation",
      "query": "servicenow.servicenow_computers.install_status = \"retired\" AND asset.LastSeen AFTERDATE {{param:seenSince}}",
      "description": "Cross-references ServiceNow's CMDB lifecycle status against real-time network telemetry, flagging any device marked 'Retired' that is still active on the network. A retired device is off the patch schedule, off the vulnerability scan roster and has no assigned owner — but if it is still connected, it is a live, unmonitored attack surface sitting in the blind spot between the IT and security teams.",
      "bestUsedFor": "IT Asset Management and CMDB-hygiene conversations, especially with teams confident their CMDB is accurate. Requires two independent systems to agree, which a single provider console cannot replicate on its own.",
      "tags": [
        "cmdb",
        "servicenow",
        "lifecycle",
        "telemetry",
        "ghost-assets"
      ],
      "requiresProviders": [
        "ServiceNow"
      ],
      "params": [
        {
          "name": "seenSince",
          "label": "Seen on the network since (days ago)",
          "type": "relativeDate",
          "default": -14,
          "min": -365,
          "max": -1
        }
      ],
      "proof": "Open one matching asset, expand its ServiceNow raw attributes, and point at install_status plus last_discovered — the two fields that produced the match.",
      "source": "workbook",
      "verified": "counted"
    },
    {
      "id": "byod-devices",
      "title": "BYOD / Unenrolled Personal Devices",
      "savedFilterName": "BYOD / Unenrolled Devices",
      "category": "Shadow IT",
      "query": "Type IN [\"Laptop\", \"Workstation\", \"Smartphone\", \"Tablet\"] AND Providers NOTIN [\"CrowdStrike Falcon\", \"ServiceNow\", \"Tenable\", \"Jamf Pro\", \"Microsoft Intune\"]",
      "description": "Laptops, workstations, smartphones and tablets — the device types people actually bring to work — that show zero presence across five core providers at once. A device this invisible was never enrolled anywhere, which is the clearest available signal of a personal device connecting to corporate resources.",
      "bestUsedFor": "BYOD and shadow-IT visibility conversations with anyone who wants to know what is connecting to their network outside every managed channel.",
      "tags": [
        "byod",
        "shadow-it",
        "unmanaged",
        "coverage"
      ],
      "requiresProviders": [],
      "source": "workbook",
      "verified": "counted"
    },
    {
      "id": "windows-macos-eol",
      "title": "Windows and macOS End-of-Life Devices",
      "category": "Lifecycle & Patch Hygiene",
      "query": "(OperatingSystem IS [\"Windows 11\"] AND OSVersion = \"{{param:winVersion}}\") OR (OperatingSystem CONTAINS \"macOS\" AND OSVersion IS \"{{param:macVersion}}\")",
      "description": "Combines a Windows 11 build-level lifecycle check with a macOS point-release lifecycle check into one cross-platform query. Uses normalised OS and version fields across both providers, showing lifecycle risk for the whole fleet instead of one platform at a time.",
      "bestUsedFor": "Windows and Apple lifecycle / patch-hygiene conversations with anyone running a mixed fleet who tracks OS upgrades platform by platform today.",
      "tags": [
        "lifecycle",
        "eol",
        "patching",
        "windows",
        "macos",
        "cross-platform"
      ],
      "requiresProviders": [],
      "params": [
        {
          "name": "winVersion",
          "label": "Windows 11 build to flag",
          "type": "string",
          "default": "22H2"
        },
        {
          "name": "macVersion",
          "label": "macOS version to flag",
          "type": "string",
          "default": "13.7.8"
        }
      ],
      "source": "workbook",
      "verified": "counted"
    },
    {
      "id": "laptops-disk-encryption-off",
      "title": "Corporate Managed Laptops with Disk Encryption Off",
      "savedFilterName": "Laptops: Disk Encryption Off",
      "category": "Compliance",
      "query": "(intune.intune_managed_devices.device_health_attestation_state.bitLockerStatus = \"PROTECTION_OFF\") OR (jamf.jamf_computers_inventory.disk_encryption.bootPartitionEncryptionDetails.partitionFileVault2State != \"ENCRYPTED\")",
      "description": "Combines Jamf's FileVault state for Macs with Intune's BitLocker protection state for Windows into a single cross-provider query — one filter covering both platforms instead of two separate checks. Full-disk encryption is a regulatory baseline; MDM enrolment alone does not guarantee it is actually switched on, on either platform.",
      "bestUsedFor": "Compliance-driven conversations (PCI-DSS, HIPAA, SOC 2, ISO 27001) with regulated organisations running mixed Mac and Windows fleets.",
      "tags": [
        "compliance",
        "encryption",
        "bitlocker",
        "filevault",
        "intune",
        "jamf",
        "cross-platform"
      ],
      "requiresProviders": [
        "Microsoft Intune",
        "Jamf Pro"
      ],
      "proof": "Open a Jamf-discovered asset and find partitionFileVault2State: NOT_ENCRYPTED in its raw attributes; open an Intune-discovered asset and find bitLockerStatus: PROTECTION_OFF.",
      "source": "workbook",
      "verified": "counted"
    },
    {
      "id": "crowdstrike-firewall-and-prevention-off",
      "title": "CrowdStrike Firewall Not Running and Prevention Policy Not Applied",
      "savedFilterName": "CS Firewall + Prevention Off",
      "category": "Security Control Gaps",
      "query": "crowdstrike_falcon.crowdstrike_falcon_devices.device_policies.prevention.applied != \"true\" AND crowdstrike_falcon.crowdstrike_falcon_devices.device_policies.firewall.applied != \"true\"",
      "description": "Stacks two raw CrowdStrike policy attributes — firewall and prevention (real-time malware and threat blocking) — to isolate devices where both controls are inactive at once. A device missing both is an unprotected endpoint hiding inside the EDR tool itself: it can execute malware, allow lateral movement, and never trigger an alert.",
      "bestUsedFor": "Technical validation calls and POCs with security architects who want proof of compound, cross-attribute querying against raw provider data.",
      "tags": [
        "edr",
        "crowdstrike",
        "policy",
        "security-gap",
        "compound"
      ],
      "requiresProviders": [
        "CrowdStrike Falcon"
      ],
      "source": "workbook",
      "verified": "counted"
    },
    {
      "id": "missing-dns-forward-record",
      "title": "Assets with No Forward DNS Record",
      "savedFilterName": "No Forward DNS",
      "category": "DDI Hygiene",
      "query": "asset.MissingRecords IN [\"DNS Forward Record\"]",
      "description": "Assets that are live on the network but have no A/AAAA record. Anything here is reachable by address but not by name, which breaks certificate issuance, log correlation and every runbook that assumes a hostname resolves.",
      "bestUsedFor": "DDI hygiene reviews, and the most direct way to show that asset visibility and DNS data are the same conversation.",
      "tags": [
        "dns",
        "ddi",
        "hygiene",
        "records"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "missing-dns-ptr-record",
      "title": "Assets with No Reverse DNS Record",
      "savedFilterName": "No Reverse DNS",
      "category": "DDI Hygiene",
      "query": "asset.MissingRecords IN [\"DNS Pointer Record\"]",
      "description": "Assets with no PTR record. Reverse lookups underpin mail acceptance, SIEM enrichment and most network forensics — an address that will not resolve backwards turns every investigation into manual work.",
      "bestUsedFor": "Security operations conversations about log and alert enrichment quality.",
      "tags": [
        "dns",
        "ddi",
        "ptr",
        "reverse",
        "hygiene"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "missing-ipam-record",
      "title": "Assets with No IPAM Record",
      "savedFilterName": "No IPAM Record",
      "category": "DDI Hygiene",
      "query": "asset.MissingRecords IN [\"IPAM\"]",
      "description": "Assets holding an address that IPAM does not know about. These are the addresses that cause duplicate-allocation incidents, because the system of record believes they are free.",
      "bestUsedFor": "IPAM accuracy conversations, particularly where address exhaustion or allocation conflicts have already caused an outage.",
      "tags": [
        "ipam",
        "ddi",
        "addressing",
        "hygiene"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "missing-any-core-record",
      "title": "Assets Missing Any Core DNS or IPAM Record",
      "savedFilterName": "Missing DNS or IPAM",
      "category": "DDI Hygiene",
      "query": "asset.MissingRecords IN [\"DNS Forward Record\", \"DNS Pointer Record\", \"IPAM\"]",
      "description": "The union of the three record-gap checks: every asset missing at least one of forward DNS, reverse DNS or IPAM. The single number that sizes the whole DDI hygiene problem.",
      "bestUsedFor": "Opening a DDI hygiene conversation with one figure before breaking it down by record type.",
      "tags": [
        "dns",
        "ipam",
        "ddi",
        "hygiene",
        "opener"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "zombie-assets",
      "title": "Zombie Assets",
      "savedFilterName": "Zombie Assets",
      "category": "Insight Classifications",
      "query": "asset.Classifications IN [\"Zombie\"]",
      "description": "Assets that UAI has itself classified as zombies — present and consuming address space or resources, but showing none of the signals of something genuinely in service. The product's own answer to the 'retired but still connected' problem, without needing a CMDB integration to find it.",
      "bestUsedFor": "Anyone who liked the retired-in-CMDB story but has no ServiceNow integration to run it against.",
      "tags": [
        "zombie",
        "lifecycle",
        "cleanup",
        "insights"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "unencrypted-assets",
      "title": "Assets Flagged as Unencrypted",
      "savedFilterName": "Unencrypted Assets",
      "category": "Insight Classifications",
      "query": "asset.SubClassifications IN [\"Unencrypted\"]",
      "description": "Assets UAI has classified as unencrypted, using whichever provider signal is available for that asset. Reaches the same conclusion as the BitLocker and FileVault query without hardcoding either provider's field path, so it keeps working as the provider mix changes.",
      "bestUsedFor": "Compliance conversations in tenants that do not have both Intune and Jamf integrated.",
      "tags": [
        "encryption",
        "compliance",
        "insights",
        "cross-platform"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "orphaned-assets",
      "title": "Orphaned Assets",
      "savedFilterName": "Orphaned Assets",
      "category": "Insight Classifications",
      "query": "asset.SubClassifications IN [\"Orphan\"]",
      "description": "Assets with no owning parent resource — typically cloud objects left behind when the thing that created them was deleted. They keep costing money and keep holding addresses.",
      "bestUsedFor": "Cloud cost and cloud hygiene conversations, where the finding has a direct currency value attached.",
      "tags": [
        "cloud",
        "orphan",
        "cost",
        "cleanup",
        "insights"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "syntax-only"
    },
    {
      "id": "publicly-accessible-assets",
      "title": "Publicly Accessible Assets",
      "savedFilterName": "Publicly Accessible",
      "category": "Insight Classifications",
      "query": "asset.SubClassifications IN [\"Public Access\"]",
      "description": "Assets UAI has determined are reachable from the public internet. The exposure list, derived from reconciled cloud and network data rather than from an external scan.",
      "bestUsedFor": "Attack-surface conversations, and a natural bridge into external attack surface management.",
      "tags": [
        "exposure",
        "attack-surface",
        "cloud",
        "insights",
        "security"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "syntax-only"
    },
    {
      "id": "idle-cloud-resources",
      "title": "Idle and Underused Cloud Resources",
      "savedFilterName": "Idle / Underused Cloud",
      "category": "Insight Classifications",
      "query": "asset.SubClassifications IN [\"Resource Utilization Idle\", \"Resource Utilization Low\"]",
      "description": "Cloud resources running at idle or consistently low utilisation. Every one is a live bill with no corresponding workload.",
      "bestUsedFor": "FinOps and cloud-cost conversations, where asset visibility pays for itself in the first month.",
      "tags": [
        "cloud",
        "cost",
        "finops",
        "utilisation",
        "insights"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "syntax-only"
    },
    {
      "id": "noncompliant-assets",
      "title": "Assets Classified as Noncompliant",
      "savedFilterName": "Noncompliant Assets",
      "category": "Insight Classifications",
      "query": "asset.Classifications IN [\"Noncompliant\"]",
      "description": "Assets failing UAI's own compliance classification. A useful starting point before narrowing to a specific control with the sub-classification queries.",
      "bestUsedFor": "Broad compliance-posture conversations, as the parent number the more specific findings sit underneath.",
      "tags": [
        "compliance",
        "insights",
        "posture"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "syntax-only"
    },
    {
      "id": "stale-assets",
      "title": "Assets Not Seen Recently",
      "category": "Discovery Hygiene",
      "query": "asset.LastSeen BEFOREDATE {{param:notSeenSince}}",
      "description": "Assets whose last network sighting predates the chosen date. Either they have genuinely left the estate and the record should be retired, or discovery has stopped seeing a part of the network it used to cover. Both are worth knowing.",
      "bestUsedFor": "Data-quality reviews, and for separating real decommissions from silent discovery gaps.",
      "tags": [
        "stale",
        "lifecycle",
        "discovery",
        "data-quality"
      ],
      "requiresProviders": [],
      "params": [
        {
          "name": "notSeenSince",
          "label": "Not seen since (days ago)",
          "type": "relativeDate",
          "default": -7,
          "min": -365,
          "max": -1
        }
      ],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "unclassified-assets",
      "title": "Unclassified Assets",
      "savedFilterName": "Unclassified Assets",
      "category": "Discovery Hygiene",
      "query": "asset.Type IN [\"Unclassified\"]",
      "description": "Assets present on the network that UAI could not assign a device type to. Each one is something connected that nobody can describe — the raw material of every shadow-IT and unmanaged-device conversation.",
      "bestUsedFor": "Showing that 'we have full visibility' and 'we can identify everything we see' are different claims.",
      "tags": [
        "unclassified",
        "shadow-it",
        "discovery",
        "unknown"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "low-confidence-identification",
      "title": "Assets Identified with Low Confidence",
      "savedFilterName": "Low-Confidence ID",
      "category": "Discovery Hygiene",
      "query": "asset.Confidence IN [\"Low\", \"EMPTY\"]",
      "description": "Assets whose identification UAI is not confident about. Distinct from unclassified: these have a guessed type that may well be wrong, so they are the records most likely to mislead an inventory report.",
      "bestUsedFor": "Data-quality conversations with teams who plan to drive automation off asset attributes.",
      "tags": [
        "confidence",
        "data-quality",
        "discovery"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "syntax-only"
    },
    {
      "id": "no-serial-number",
      "title": "Assets with No Serial Number",
      "savedFilterName": "No Serial Number",
      "category": "Discovery Hygiene",
      "query": "asset.SerialNumber IS \"EMPTY\"",
      "description": "Assets with no serial number recorded. Serial number is the join key most asset-management, warranty and procurement processes depend on; without it, an asset cannot be tied back to a purchase or a support contract.",
      "bestUsedFor": "ITAM conversations about reconciling technical inventory against procurement and warranty records.",
      "tags": [
        "itam",
        "serial",
        "data-quality",
        "procurement"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "assets-in-error-state",
      "title": "Assets Reporting an Error State",
      "savedFilterName": "Error State",
      "category": "Discovery Hygiene",
      "query": "asset.OverallStatus IN [\"ERROR\"]",
      "description": "Assets whose overall status is an error. Worth clearing before quoting any other number from the inventory, since these records are the least likely to be accurate.",
      "bestUsedFor": "Housekeeping ahead of a data-quality review or a QBR that will put inventory figures on a slide.",
      "tags": [
        "errors",
        "data-quality",
        "housekeeping"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "syntax-only"
    },
    {
      "id": "os-past-end-of-life",
      "title": "Operating Systems Past End of Life",
      "category": "Lifecycle & Patch Hygiene",
      "query": "asset.OSEndOfLife BEFOREDATE {{param:asOf}}",
      "description": "Every asset whose OS is already past its end-of-life date, using UAI's own lifecycle data rather than a hardcoded version string. Unlike a query naming specific builds, this one does not rot: it stays correct as new versions reach end of life.",
      "bestUsedFor": "Lifecycle conversations across a mixed fleet, and as the durable replacement for version-specific EOL filters.",
      "tags": [
        "eol",
        "lifecycle",
        "patching",
        "cross-platform"
      ],
      "requiresProviders": [],
      "params": [
        {
          "name": "asOf",
          "label": "As of (days from today)",
          "type": "relativeDate",
          "default": 0,
          "min": -365,
          "max": 365
        }
      ],
      "source": "derived",
      "verified": "syntax-only"
    },
    {
      "id": "os-past-security-support",
      "title": "Operating Systems Past End of Security Support",
      "savedFilterName": "OS Past End of Security Support",
      "category": "Lifecycle & Patch Hygiene",
      "query": "asset.OSEndOfSecuritySupport BEFOREDATE {{param:asOf}}",
      "description": "Assets running an OS that no longer receives security fixes. A stricter and more urgent cut than end of life: these will never be patched again, whatever the vulnerability.",
      "bestUsedFor": "Risk conversations where the question is not 'is it old' but 'can it still be fixed'.",
      "tags": [
        "eol",
        "security",
        "lifecycle",
        "patching",
        "risk"
      ],
      "requiresProviders": [],
      "params": [
        {
          "name": "asOf",
          "label": "As of (days from today)",
          "type": "relativeDate",
          "default": 0,
          "min": -365,
          "max": 365
        }
      ],
      "source": "derived",
      "verified": "syntax-only"
    },
    {
      "id": "os-approaching-end-of-life",
      "title": "Operating Systems Approaching End of Life",
      "savedFilterName": "OS Approaching End of Life",
      "category": "Lifecycle & Patch Hygiene",
      "query": "asset.OSEndOfLife BEFOREDATE {{param:horizon}}",
      "description": "Assets whose OS reaches end of life inside the chosen planning horizon. The forward-looking counterpart to the past-EOL query — the same data, used to plan an upgrade instead of to report a failure.",
      "bestUsedFor": "Budget and upgrade-planning conversations, where a dated list is more use than a count of what is already overdue.",
      "tags": [
        "eol",
        "lifecycle",
        "planning",
        "budget"
      ],
      "requiresProviders": [],
      "params": [
        {
          "name": "horizon",
          "label": "Planning horizon (days from today)",
          "type": "relativeDate",
          "default": 90,
          "min": 1,
          "max": 730
        }
      ],
      "source": "derived",
      "verified": "syntax-only"
    },
    {
      "id": "iot-and-ot-devices",
      "title": "IoT and OT Devices on the Network",
      "savedFilterName": "IoT / OT Devices",
      "category": "Estate Composition",
      "query": "asset.Type IN [\"Generic IoT\", \"Surveillance Camera\", \"Smart TV\", \"Smart Speaker\", \"Smart Plug\", \"Smart Door Bell\", \"Smart Controller\", \"Set-Top-Box\", \"Streaming Device\", \"VoIP Phone\", \"Printer\", \"PDU\"]",
      "description": "Every device class that generally cannot run an agent: cameras, printers, phones, building controllers, smart-home hardware. None of it will ever appear in an EDR console, so for most organisations this is the part of the estate no security tool inventories.",
      "bestUsedFor": "IoT and OT visibility conversations, especially where the security stack is entirely agent-based.",
      "tags": [
        "iot",
        "ot",
        "agentless",
        "unmanaged",
        "visibility"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "network-infrastructure",
      "title": "Network Infrastructure Inventory",
      "savedFilterName": "Network Infrastructure",
      "category": "Estate Composition",
      "query": "asset.Type IN [\"Router\", \"Switch\", \"Wireless Access Point\", \"Gateway\", \"VPN Gateway\"]",
      "description": "The routing, switching and wireless estate as UAI sees it. Useful as a cross-check against whatever the network team believes is deployed, and as the denominator for network-device lifecycle work.",
      "bestUsedFor": "Network-team conversations, and reconciling discovered infrastructure against the documented topology.",
      "tags": [
        "network",
        "infrastructure",
        "inventory"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "counted"
    },
    {
      "id": "cloud-assets",
      "title": "Cloud-Hosted Assets",
      "savedFilterName": "Cloud-Hosted Assets",
      "category": "Estate Composition",
      "query": "asset.LocationType IN [\"Cloud\"]",
      "description": "Everything UAI places in a cloud provider rather than on-premises. The starting point for splitting any other finding along the cloud/on-prem boundary, which is usually where ownership changes hands.",
      "bestUsedFor": "Scoping conversations where cloud and on-prem estates have different owners, tools and standards.",
      "tags": [
        "cloud",
        "estate",
        "scoping"
      ],
      "requiresProviders": [],
      "source": "derived",
      "verified": "syntax-only"
    }
  ]
};

  /** The page's real window, whether or not the manager sandboxed us. */
  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const NS = 'uaiql';
  const STORE_KEY = 'uaiql.local';
  const DEFAULT_SAVED_FILTER_PREFIX = '';
  const PREFIX_KEY = `${NS}.prefix`;

  /**
   * Optional marker put in front of every Saved Filter this script creates.
   * Off by default, so filters get clean names. To tag them (handy on a shared
   * tenant, so they are easy to find and remove later), run this once in the
   * page's DevTools console:  localStorage.setItem('uaiql.prefix', '[Library]')
   * (removeItem turns it off again).
   */
  function savedFilterPrefix() {
    try {
      const v = localStorage.getItem(PREFIX_KEY);
      return v === null ? DEFAULT_SAVED_FILTER_PREFIX : v.trim();
    } catch { return DEFAULT_SAVED_FILTER_PREFIX; }
  }

  /**
   * Asset Inventory is reachable on more than one route, and they are not
   * variations on one path — the left nav points at two different ones:
   *
   *   Assets > Inventory          #/workspace/assets/unified-details/managed-assets
   *   Network > Assets in Network #/workspace/assets  (an Assets *dashboard*)
   *
   * Both inventory routes render the same filter bar, so anything below a
   * sub-path is fair game. Bare `#/workspace/assets` is not: it is the Network
   * Assets dashboard — charts, no filter bar, no Monaco editor, ever. An
   * earlier version matched the whole `/workspace/assets` prefix to fix the
   * button not appearing under Assets > Inventory, and in doing so put the
   * button on that dashboard, where every query failed with "switch to
   * Advanced Mode first". Requiring a segment after `assets/` excludes it.
   *
   * The route is a cheap first filter, not the decision — mount() confirms the
   * filter bar is really there before adding anything to the page.
   */
  const INVENTORY_PATH = /\/workspace\/assets\/[^/?#]+\//;

  /**
   * Saved Filter names are capped at 50 characters. Measured, not guessed: a
   * 50-character name saves and a 51-character one does not — and the UI gives
   * no error when it refuses, it just silently does nothing. Hence both the
   * truncation here and the read-back check in saveAsFilter.
   */
  const SAVED_FILTER_MAX_NAME = 50;

  function savedFilterNameFor(entry) {
    const base = entry.savedFilterName || entry.title;
    const prefix = savedFilterPrefix();
    const full = prefix ? `${prefix} ${base}` : base;
    return full.length <= SAVED_FILTER_MAX_NAME ? full : full.slice(0, SAVED_FILTER_MAX_NAME).trimEnd();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------------------
  // lz-string (compressToEncodedURIComponent only)
  //
  // The app stores filter state in the URL as
  //   LZString.compressToEncodedURIComponent(JSON.stringify(queryText))
  // so reproducing that encoding is what makes shareable query links possible.
  //
  // Extracted from lz-string by pieroxy, MIT licensed.
  // https://github.com/pieroxy/lz-string
  // ---------------------------------------------------------------------------

  const URI_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';

  function compressToEncodedURIComponent(input) {
    if (input == null) return '';
    return _compress(input, 6, (a) => URI_KEY.charAt(a));
  }

  function _compress(uncompressed, bitsPerChar, getCharFromInt) {
    if (uncompressed == null) return '';
    const dictionary = {};
    const dictionaryToCreate = {};
    const data = [];
    let c = '', wc = '', w = '';
    let enlargeIn = 2, dictSize = 3, numBits = 2;
    let dataVal = 0, dataPosition = 0;

    const writeBits = (value, n) => {
      for (let i = 0; i < n; i++) {
        dataVal = (dataVal << 1) | (value & 1);
        if (dataPosition === bitsPerChar - 1) {
          dataPosition = 0;
          data.push(getCharFromInt(dataVal));
          dataVal = 0;
        } else {
          dataPosition++;
        }
        value >>= 1;
      }
    };

    const emit = (token) => {
      if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, token)) {
        if (token.charCodeAt(0) < 256) {
          writeBits(0, numBits);
          writeBits(token.charCodeAt(0), 8);
        } else {
          writeBits(1, numBits);
          writeBits(token.charCodeAt(0), 16);
        }
        enlargeIn--;
        if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
        delete dictionaryToCreate[token];
      } else {
        writeBits(dictionary[token], numBits);
      }
      enlargeIn--;
      if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
    };

    for (let ii = 0; ii < uncompressed.length; ii++) {
      c = uncompressed.charAt(ii);
      if (!Object.prototype.hasOwnProperty.call(dictionary, c)) {
        dictionary[c] = dictSize++;
        dictionaryToCreate[c] = true;
      }
      wc = w + c;
      if (Object.prototype.hasOwnProperty.call(dictionary, wc)) {
        w = wc;
      } else {
        emit(w);
        dictionary[wc] = dictSize++;
        w = String(c);
      }
    }

    if (w !== '') emit(w);

    writeBits(2, numBits);
    while (true) {
      dataVal <<= 1;
      if (dataPosition === bitsPerChar - 1) { data.push(getCharFromInt(dataVal)); break; }
      dataPosition++;
    }
    return data.join('');
  }

  // ---------------------------------------------------------------------------
  // Parameter substitution
  // ---------------------------------------------------------------------------

  /** UAI writes dates as MM-DD-YYYY. */
  function formatUaiDate(date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${mm}-${dd}-${date.getFullYear()}`;
  }

  function renderParamValue(param, raw) {
    if (param.type === 'relativeDate') {
      const d = new Date();
      d.setDate(d.getDate() + Number(raw));
      return formatUaiDate(d);
    }
    return String(raw);
  }

  function renderQuery(entry, values) {
    let out = entry.query;
    for (const param of entry.params || []) {
      const raw = values && param.name in values && values[param.name] !== ''
        ? values[param.name]
        : param.default;
      out = out.split(`{{param:${param.name}}}`).join(renderParamValue(param, raw));
    }
    const leftover = /\{\{param:(\w+)\}\}/.exec(out);
    if (leftover) throw new Error(`"${entry.id}" uses an undeclared parameter: ${leftover[1]}`);
    return out;
  }

  // ---------------------------------------------------------------------------
  // UAI adapter
  //
  // Everything coupling this script to the app lives here. Verified against the
  // live app: the filter bar is a Monaco editor with language id "filterel",
  // exposed on window.monaco, and Apply is a plain button.
  // ---------------------------------------------------------------------------

  const adapter = {
    onInventoryPage() {
      return INVENTORY_PATH.test(location.hash);
    },

    monaco() {
      return W.monaco;
    },

    /** The filter bar's model, or null when Advanced Mode is not open. */
    model() {
      const m = this.monaco();
      if (!m?.editor) return null;
      const models = m.editor.getModels();
      return models.find((x) => x.getLanguageId?.() === 'filterel') || models[0] || null;
    },

    button(label) {
      return [...document.querySelectorAll('button, a, span')].find(
        (e) => e.offsetParent && e.children.length === 0 && e.textContent.trim() === label,
      );
    },

    /**
     * The filter bar, in either mode. In Basic Mode window.monaco is already
     * loaded but getModels() is empty, so the toggle is the only tell.
     */
    filterBar() {
      return this.model() || this.button('Advanced Mode') || this.button('Basic Mode') || null;
    },

    /** Advanced Mode hosts the Monaco editor; Basic Mode does not. */
    async ensureAdvancedMode() {
      if (this.model()) return true;
      // The toggle can lag the rest of the bar, and the bar re-renders on mode
      // changes. Give it a moment rather than failing on the first look.
      let toggle = this.button('Advanced Mode');
      for (let i = 0; i < 12 && !toggle && !this.model(); i++) {
        await sleep(250);
        toggle = this.button('Advanced Mode');
      }
      if (this.model()) return true;
      if (!toggle) return false;
      toggle.click();
      // Measured at 270ms on a live tenant; budget well over that for a
      // loaded tenant on a slow connection.
      for (let i = 0; i < 40 && !this.model(); i++) await sleep(150);
      return !!this.model();
    },

    async setQuery(text) {
      if (!(await this.ensureAdvancedMode())) {
        throw new Error(
          this.button('Advanced Mode')
            ? 'The filter bar did not switch to Advanced Mode — try again in a moment.'
            : 'No filter bar on this page. Open Assets > Inventory.',
        );
      }
      this.model().setValue(text);
      await sleep(250);
    },

    async apply(text) {
      await this.setQuery(text);
      const btn = this.button('Apply');
      if (!btn) throw new Error('Could not find the Apply button.');
      if (btn.disabled) throw new Error('Apply is disabled — a query may still be running.');
      btn.click();
    },

    /**
     * Providers integrated in this tenant, read from the filter language's own
     * autocomplete. Returns null if it cannot be determined, which the UI reads
     * as "do not grey anything out".
     */
    async detectProviders() {
      const m = this.monaco();
      const model = this.model();
      if (!m || !model) return null;
      const editors = m.editor.getEditors?.() || [];
      const ed = editors[0];
      if (!ed) return null;

      const restore = model.getValue();
      try {
        const probe = 'asset.Providers IN [';
        model.setValue(probe);
        ed.setPosition({ lineNumber: 1, column: probe.length + 1 });
        ed.trigger('uaiql', 'editor.action.triggerSuggest', {});
        await sleep(900);
        const ctrl = ed.getContribution('editor.contrib.suggestController');
        const items = ctrl?.model?._completionModel?.items || [];
        ed.trigger('uaiql', 'hideSuggestWidget', {});
        const names = items
          .map((i) => i.completion?.label?.label ?? i.completion?.label ?? i.textLabel)
          .filter((s) => typeof s === 'string' && s !== 'EMPTY');
        return names.length ? names : null;
      } catch {
        return null;
      } finally {
        model.setValue(restore);
      }
    },

    /**
     * A URL that opens Asset Inventory with this query pre-loaded in the filter
     * bar. Verified against the live app: the recipient still has to press
     * Apply, and the URL is only read on a full page load — mutating the hash
     * in an already-open tab does nothing.
     */
    deepLink(queryText) {
      const encoded = compressToEncodedURIComponent(JSON.stringify(queryText));
      return `${location.origin}/#/workspace/assets/details/managed-assets`
        + `?hideBreadcrumbs=true&isAdvanced=true&advancedFilterValue=${encoded}`;
    },

    /**
     * Names of the Saved Filters currently visible in the picker that
     * `isMine(line)` accepts. Matching is by predicate rather than by prefix,
     * so it still works when the prefix has been turned off.
     */
    async listSavedFilterNames(isMine) {
      const link = this.button('Saved Filters');
      if (!link) return null;
      link.click();
      await sleep(1600);
      const seeAll = [...document.querySelectorAll('.cdk-overlay-container *')]
        .find((e) => e.offsetParent && !e.children.length && /see all/i.test(e.textContent.trim()));
      if (seeAll) { seeAll.click(); await sleep(2000); }

      // The list virtualises, so scroll it through to see every row.
      const pane = [...document.querySelectorAll('div')]
        .filter((d) => d.offsetParent && d.scrollHeight > d.clientHeight + 50)
        .pop();
      const names = new Set();
      const harvest = () => document.body.innerText.split('\n')
        .map((s) => s.trim())
        .filter((s) => s && isMine(s))
        .forEach((s) => names.add(s));
      harvest();
      for (let i = 0; pane && i < 30; i++) {
        pane.scrollTop += pane.clientHeight * 0.8;
        await sleep(220);
        harvest();
      }
      [...document.querySelectorAll('.cdk-overlay-container button')]
        .find((b) => b.offsetParent && b.textContent.trim() === 'Close')?.click();
      await sleep(500);
      return names;
    },

    /**
     * Creates a native Saved Filter by driving the app's own Save popover.
     * Deliberately UI-driven rather than calling an undocumented API: it stays
     * inside whatever the signed-in user is actually allowed to do.
     */
    async saveAsFilter(queryText, name) {
      if (name.length > SAVED_FILTER_MAX_NAME) {
        throw new Error(`Name is ${name.length} characters; the limit is ${SAVED_FILTER_MAX_NAME}.`);
      }
      await this.setQuery(queryText);
      const save = this.button('Save');
      if (!save || save.disabled) throw new Error('Save is unavailable for this query.');
      save.click();
      await sleep(700);

      const input = [...document.querySelectorAll('input')].find(
        (i) => i.offsetParent && /saved filter/i.test(i.value || ''),
      ) || [...document.querySelectorAll('.cdk-overlay-container input')].find((i) => i.offsetParent);
      if (!input) throw new Error('Could not find the filter name field.');

      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, name);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(250);

      const confirm = [...document.querySelectorAll('.cdk-overlay-container button, .cdk-overlay-container a')]
        .find((b) => b.offsetParent && b.textContent.trim() === 'Save');
      if (!confirm) throw new Error('Could not find the Save confirmation button.');
      confirm.click();
      await sleep(900);
    },

    async cancelOverlay() {
      const cancel = [...document.querySelectorAll('.cdk-overlay-container button, .cdk-overlay-container a, .cdk-overlay-container span')]
        .find((b) => b.offsetParent && b.textContent.trim() === 'Cancel');
      cancel?.click();
      await sleep(200);
    },
  };

  // ---------------------------------------------------------------------------
  // Local (user-added) queries
  // ---------------------------------------------------------------------------

  const store = {
    read() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
    },
    write(list) { localStorage.setItem(STORE_KEY, JSON.stringify(list)); },
  };

  const allQueries = () => [
    ...CATALOG.queries.map((q) => ({ ...q, origin: 'catalog' })),
    ...store.read().map((q) => ({ ...q, origin: 'local' })),
  ];

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  const CSS = `
  .${NS}-fab{position:fixed;right:22px;bottom:22px;z-index:2147483000;height:42px;padding:0 18px;
    border:0;border-radius:21px;background:#0d8b4d;color:#fff;font:600 13px/42px system-ui,-apple-system,sans-serif;
    cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4)}
  .${NS}-fab:hover{background:#10a75d}
  .${NS}-panel{position:fixed;top:0;right:0;bottom:0;width:460px;max-width:100vw;z-index:2147483001;
    background:#1b1f24;color:#e6e9ec;box-shadow:-6px 0 28px rgba(0,0,0,.5);display:none;flex-direction:column;
    font:13px/1.55 system-ui,-apple-system,sans-serif;border-left:1px solid #2f353c}
  .${NS}-panel[data-open="1"]{display:flex}
  .${NS}-head{padding:14px 16px;border-bottom:1px solid #2f353c;display:flex;align-items:center;gap:10px}
  .${NS}-head h2{margin:0;font-size:14px;font-weight:700;flex:1;letter-spacing:.01em}
  .${NS}-x{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#8b949e;padding:0 4px}
  .${NS}-x:hover{color:#e6e9ec}
  .${NS}-search{margin:12px 16px 0;padding:8px 10px;border:1px solid #3a4149;border-radius:6px;
    background:#12161a;color:#e6e9ec;font:inherit}
  .${NS}-search::placeholder{color:#6e7781}
  .${NS}-list{flex:1;overflow:auto;padding:10px 16px 16px}
  .${NS}-cat{margin:16px 0 7px;font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#7d8892}
  .${NS}-item{border:1px solid #2f353c;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#20252b}
  .${NS}-item[data-off="1"]{opacity:.45}
  .${NS}-title{font-weight:600;cursor:pointer;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
  .${NS}-tag{font-weight:500;color:#8b949e;font-size:10.5px;border:1px solid #3a4149;border-radius:3px;padding:0 5px}
  .${NS}-tag.warn{color:#e3b341;border-color:#5c4a1a}
  .${NS}-desc{color:#a8b1ba;font-size:12px;margin-top:5px}
  .${NS}-more{display:none}
  .${NS}-item[data-open="1"] .${NS}-more{display:block}
  .${NS}-use{color:#8b949e;font-size:11.5px;margin-top:7px;font-style:italic}
  .${NS}-q{font:11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#12161a;
    border:1px solid #2f353c;border-radius:5px;padding:7px 8px;white-space:pre-wrap;word-break:break-word;
    margin-top:8px;color:#c9d1d9}
  .${NS}-params{margin-top:8px}
  .${NS}-params label{display:flex;align-items:center;gap:8px;font-size:11.5px;margin-bottom:5px;color:#a8b1ba}
  .${NS}-params input{width:110px;padding:3px 7px;border:1px solid #3a4149;border-radius:4px;
    background:#12161a;color:#e6e9ec;font:inherit}
  .${NS}-btns{display:flex;gap:6px;margin-top:9px;flex-wrap:wrap}
  .${NS}-btn{border:1px solid #3a4149;background:#2a3038;color:#e6e9ec;border-radius:5px;padding:5px 11px;
    font-size:11.5px;cursor:pointer;font-family:inherit}
  .${NS}-btn:hover{background:#343b44}
  .${NS}-btn.p{background:#0d8b4d;border-color:#0d8b4d;color:#fff}
  .${NS}-btn.p:hover{background:#10a75d}
  .${NS}-foot{border-top:1px solid #2f353c;padding:10px 16px;display:flex;gap:8px;align-items:center;
    font-size:11.5px;color:#7d8892}
  .${NS}-toast{position:fixed;bottom:78px;right:22px;z-index:2147483002;background:#0d1117;color:#e6e9ec;
    padding:10px 14px;border-radius:6px;font:12.5px system-ui,sans-serif;max-width:400px;
    border:1px solid #3a4149;box-shadow:0 4px 16px rgba(0,0,0,.5)}
  `;

  function toast(msg, ms = 3400) {
    document.querySelector(`.${NS}-toast`)?.remove();
    const el = document.createElement('div');
    el.className = `${NS}-toast`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let providers = null; // null = unknown, array = detected

  function buildPanel() {
    const panel = document.createElement('div');
    panel.className = `${NS}-panel`;
    panel.innerHTML = `
      <div class="${NS}-head">
        <h2>UAI Query Library</h2>
        <button class="${NS}-x" title="Close">&times;</button>
      </div>
      <input class="${NS}-search" type="search" placeholder="Search title, description, tag or provider…">
      <div class="${NS}-list"></div>
      <div class="${NS}-foot">
        <span class="${NS}-count"></span>
        <span style="flex:1"></span>
        <button class="${NS}-btn" data-act="install">Install as Saved Filters…</button>
      </div>`;

    const list = panel.querySelector(`.${NS}-list`);
    const search = panel.querySelector(`.${NS}-search`);
    const count = panel.querySelector(`.${NS}-count`);

    const missingFor = (q) => {
      if (!providers || !q.requiresProviders?.length) return null;
      const missing = q.requiresProviders.filter((p) => !providers.includes(p));
      return missing.length ? missing : null;
    };

    function render() {
      const t = search.value.trim().toLowerCase();
      const all = allQueries();
      const matches = all.filter((q) => !t || [
        q.title, q.description, q.category, q.bestUsedFor || '',
        ...(q.tags || []), ...(q.requiresProviders || []),
      ].join(' ').toLowerCase().includes(t));

      count.textContent = t ? `${matches.length} of ${all.length} queries` : `${all.length} queries`;
      list.innerHTML = '';

      const groups = new Map();
      for (const q of matches) {
        if (!groups.has(q.category)) groups.set(q.category, []);
        groups.get(q.category).push(q);
      }
      for (const [category, entries] of groups) {
        const h = document.createElement('div');
        h.className = `${NS}-cat`;
        h.textContent = category;
        list.appendChild(h);
        entries.forEach((q) => list.appendChild(renderItem(q)));
      }
      if (!matches.length) {
        list.innerHTML = `<div class="${NS}-desc" style="margin-top:14px">No queries match that search.</div>`;
      }
    }

    function renderItem(q) {
      const missing = missingFor(q);
      const item = document.createElement('div');
      item.className = `${NS}-item`;
      if (missing) item.dataset.off = '1';

      const params = (q.params || []).map((p) => `
        <label><span style="flex:1">${esc(p.label)}</span>
          <input data-param="${esc(p.name)}" type="${p.type === 'string' ? 'text' : 'number'}"
                 value="${esc(String(p.default))}"
                 ${p.min !== undefined ? `min="${p.min}"` : ''} ${p.max !== undefined ? `max="${p.max}"` : ''}>
        </label>`).join('');

      item.innerHTML = `
        <div class="${NS}-title">
          <span style="flex:1">${esc(q.title)}</span>
          ${q.origin === 'local' ? `<span class="${NS}-tag">local</span>` : ''}
          ${q.verified === 'counted' ? `<span class="${NS}-tag">verified</span>` : ''}
          ${missing ? `<span class="${NS}-tag warn">needs ${esc(missing.join(', '))}</span>` : ''}
        </div>
        <div class="${NS}-desc">${esc(q.description)}</div>
        <div class="${NS}-more">
          ${q.bestUsedFor ? `<div class="${NS}-use">${esc(q.bestUsedFor)}</div>` : ''}
          ${params ? `<div class="${NS}-params">${params}</div>` : ''}
          <div class="${NS}-q"></div>
          <div class="${NS}-btns">
            <button class="${NS}-btn p" data-act="apply">Apply &amp; run</button>
            <button class="${NS}-btn" data-act="load">Load only</button>
            <button class="${NS}-btn" data-act="copy">Copy query</button>
            <button class="${NS}-btn" data-act="link">Copy link</button>
          </div>
        </div>`;

      const qBox = item.querySelector(`.${NS}-q`);
      const readParams = () => Object.fromEntries(
        [...item.querySelectorAll('[data-param]')].map((i) => [i.dataset.param, i.value]));
      const refresh = () => {
        try { qBox.textContent = renderQuery(q, readParams()); }
        catch (e) { qBox.textContent = `⚠ ${e.message}`; }
      };
      refresh();

      item.querySelector(`.${NS}-title`).addEventListener('click', () => {
        item.dataset.open = item.dataset.open === '1' ? '0' : '1';
      });
      item.querySelectorAll('[data-param]').forEach((i) => i.addEventListener('input', refresh));

      item.querySelector(`.${NS}-btns`).addEventListener('click', async (ev) => {
        const act = ev.target.dataset?.act;
        if (!act) return;
        let text;
        try { text = renderQuery(q, readParams()); }
        catch (e) { toast(e.message, 6000); return; }

        try {
          if (act === 'copy') {
            await navigator.clipboard.writeText(text);
            toast('Query copied.');
          } else if (act === 'link') {
            await navigator.clipboard.writeText(adapter.deepLink(text));
            toast('Link copied. It opens Asset Inventory with this query loaded — the recipient still clicks Apply to run it.', 5000);
          } else if (act === 'load') {
            await adapter.setQuery(text);
            toast(`Loaded: ${q.title}`);
          } else {
            await adapter.apply(text);
            toast(`Running: ${q.title}`);
          }
        } catch (e) {
          toast(e.message, 6000);
        }
      });

      return item;
    }

    search.addEventListener('input', render);
    panel.querySelector(`.${NS}-x`).addEventListener('click', () => { panel.dataset.open = '0'; });
    panel.querySelector('[data-act="install"]').addEventListener('click', () => installFlow());

    panel.render = render;
    render();
    return panel;
  }

  /**
   * Writes selected queries into the tenant as native Saved Filters. This is the
   * only thing the script does that changes the tenant, so it asks first, names
   * everything with a visible prefix, and skips anything parameterised (a saved
   * filter would freeze today's date into the query and quietly go stale).
   */
  async function installFlow() {
    const eligible = allQueries().filter((q) => !q.params?.length);
    const skipped = allQueries().length - eligible.length;

    const ok = W.confirm(
      `Create ${eligible.length} Saved Filters in the tenant you are signed in to?\n\n`
      + (savedFilterPrefix()
        ? `Each is named with the "${savedFilterPrefix()}" prefix so they are easy to find and remove.\n\n`
        : `They are named after the queries, with no prefix, so look for them by name when you want to remove them.\n\n`)
      + (skipped ? `${skipped} parameterised queries are skipped — saving them would freeze today's date into the filter.\n\n` : '')
      + `This writes to a shared tenant. Do not run it against a customer's production tenant without their agreement.`,
    );
    if (!ok) return;

    let attempted = 0;
    const failures = [];
    const wanted = new Map();
    for (const q of eligible) {
      const name = savedFilterNameFor(q);
      wanted.set(name, q.title);
      try {
        await adapter.saveAsFilter(q.query, name);
        attempted++;
        toast(`Saved ${attempted}/${eligible.length}: ${q.title}`, 1500);
      } catch (e) {
        failures.push(`${q.title}: ${e.message}`);
        await adapter.cancelOverlay();
      }
      await sleep(400);
    }

    // The app accepts a save silently and then discards it in some cases, so
    // read the list back rather than trusting that clicking Save worked.
    const actual = await adapter.listSavedFilterNames(
      (line) => [...wanted.keys()].some((name) => line.includes(name)),
    );
    if (actual) {
      for (const [name, title] of wanted) {
        const present = [...actual].some((n) => n.includes(name));
        if (!present && !failures.some((f) => f.startsWith(title))) {
          failures.push(`${title}: reported success but is not in the list`);
        }
      }
    }

    const created = wanted.size - failures.length;
    toast(
      failures.length
        ? `Created ${created} of ${eligible.length}. ${failures.length} did not stick — see console.`
        : `Created ${created} Saved Filters.`,
      7000,
    );
    if (failures.length) console.warn('[uaiql] Saved Filter failures:\n' + failures.join('\n'));
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  let panel = null;

  function mount() {
    if (!adapter.onInventoryPage()) {
      document.querySelector(`.${NS}-fab`)?.remove();
      if (panel) { panel.remove(); panel = null; }
      return;
    }
    if (document.querySelector(`.${NS}-fab`)) return;

    // The route matching is not proof there is anything to drive. Wait for the
    // filter bar itself, which lands a few hundred ms after the route change.
    // Cheap to re-check: this only runs between arriving on an inventory route
    // and the bar rendering, because the guard above returns once mounted.
    if (!adapter.filterBar()) return;

    const style = document.createElement('style');
    style.id = `${NS}-style`;
    style.textContent = CSS;
    if (!document.getElementById(`${NS}-style`)) document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.className = `${NS}-fab`;
    fab.textContent = 'Query Library';
    document.body.appendChild(fab);

    panel = buildPanel();
    document.body.appendChild(panel);

    fab.addEventListener('click', async () => {
      const opening = panel.dataset.open !== '1';
      panel.dataset.open = opening ? '1' : '0';
      if (opening && providers === null) {
        providers = await adapter.detectProviders();
        if (providers) panel.render();
      }
    });
  }

  /**
   * Notices client-side navigation in a single-page app.
   *
   * Listening for `hashchange` is not enough and was the original bug here.
   * The portal routes with history.pushState, and pushState never fires
   * hashchange even when the hash it writes is different — measured on a live
   * route change: the hash went from .../details/... to .../unified-details/...
   * and hashchange fired zero times. A MutationObserver on document.body only
   * sees direct children, so route swaps deep in the app do not reach it either.
   *
   * So: wrap the history methods, keep the native events for completeness, and
   * poll as a backstop for anything that changes the URL by another path. The
   * poll is a string comparison, which is cheaper than the observer it replaces.
   */
  function watchNavigation(onChange) {
    let last = location.href;
    const check = () => {
      if (location.href === last) return;
      last = location.href;
      onChange();
    };

    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        check();
        return result;
      };
    }

    W.addEventListener('popstate', check);
    W.addEventListener('hashchange', check);

    // Tick unconditionally rather than only on a URL change: the filter bar
    // renders after the route settles, so the mount that matters is usually a
    // later one. onChange is a regex test and one querySelector once mounted.
    setInterval(() => { check(); onChange(); }, 750);
  }

  if (document.body) {
    mount();
    watchNavigation(mount);
  }
})();
