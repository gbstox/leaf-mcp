#!/usr/bin/env node
/**
 * Leaf MCP proxy — Node 18+ / fastmcp@3.8
 *
 *   normal :  node leaf-mcp
 *   list    :  leaf-mcp --tools=list
 */
import { FastMCP } from "fastmcp";
import { z }       from "zod";
import fs          from "node:fs";
import path        from "node:path";

/* ---------- constants ---------- */
const BASE_URL = new URL("https://api.withleaf.io/services/");   // keep trailing /

const token = (process.env.LEAF_API_KEY || "").trim();
if (!token) throw new Error("LEAF_API_KEY env var is missing");
const AUTH  = `Bearer ${token}`;

/* ---------- FastMCP shell ---------- */
const server    = new FastMCP({ name: "Leaf API", version: "1.0.0" });
const catalogue = [];
function addTool(t) { server.addTool(t); catalogue.push({ name: t.name, description: t.description }); }

/* ---------- tiny helper ---------- */
const _get = async (url) => {
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const txt = await res.text();
  try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
};
const _bodyReq = async (url, method, bodyObj) => {
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj ?? {})
  });
  const txt = await res.text();
  try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
};

/* =====  EMBEDDED DOCS  ===== */

const DOC_ROOT = new URL("./resources/docs/", import.meta.url);

function loadDocs(rootURL) {
  const root = rootURL.pathname;
  const docs = {};
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith(".md")) {
        const slug = path.relative(root, full).replace(/\.md$/, "");
        docs[slug] = fs.readFileSync(full, "utf8");
      }
    }
  }
  if (fs.existsSync(root)) walk(root);
  return docs;
}

const docs = loadDocs(DOC_ROOT);

addTool({
  name: "listDocs",
  description: "Return the list of embedded documentation slugs.",
  parameters: z.object({}),
  execute: () => Object.keys(docs)
});

addTool({
  name: "getDoc",
  description: "Return full markdown for the given doc slug.",
  parameters: z.object({ slug: z.string() }),
  execute: ({ slug }) => {
    if (!(slug in docs)) throw new Error(`No such doc: ${slug}`);
    return docs[slug];
  }
});

/* =====  FIELD-BOUNDARY MANAGEMENT  ===== */

addTool({
  name: "createField",
  description: "Create a field for a Leaf user.",
  parameters: z.object({ leafUserId: z.string(), body: z.any() }),
  execute: ({ leafUserId, body }) =>
    _bodyReq(new URL(`fields/api/users/${leafUserId}/fields`, BASE_URL), "POST", body)
});

addTool({
  name: "getField",
  description: "Fetch a single field by ID.",
  parameters: z.object({ leafUserId: z.string(), fieldId: z.string() }),
  execute: ({ leafUserId, fieldId }) =>
    _get(new URL(`fields/api/users/${leafUserId}/fields/${fieldId}`, BASE_URL))
});

addTool({
  name: "listFields",
  description: `
Get all fields.

Returns a paged list of fields. You can narrow the results by supplying the
following query parameters:

• type        – Only fields of this type (string)
• farmId      – Only fields belonging to this farm ID (integer)
• provider    – Only fields coming from this provider (string)
• leafUserId  – Only fields that belong to this Leaf user (UUID string)

Pagination:
• page – Zero-based page number to fetch
• size – Page size (default 20, max 100)
`,
  parameters: z.object({
    type: z.string().optional(), farmId: z.number().int().optional(),
    provider: z.string().optional(), leafUserId: z.string().uuid().optional(),
    page: z.number().int().min(0).optional(), size: z.number().int().min(1).max(100).optional()
  }),
  execute: (args) => {
    const url = new URL("fields/api/fields", BASE_URL);
    for (const [k, v] of Object.entries(args)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

addTool({
  name: "getFieldBoundary",
  description: "Return the active boundary of a field.",
  parameters: z.object({ leafUserId: z.string(), fieldId: z.string() }),
  execute: ({ leafUserId, fieldId }) =>
    _get(new URL(`fields/api/users/${leafUserId}/fields/${fieldId}/boundary`, BASE_URL))
});

addTool({
  name: "updateFieldBoundary",
  description: "Replace the active boundary of a field.",
  parameters: z.object({ leafUserId: z.string(), fieldId: z.string(), body: z.any() }),
  execute: ({ leafUserId, fieldId, body }) =>
    _bodyReq(new URL(`fields/api/users/${leafUserId}/fields/${fieldId}/boundary`, BASE_URL),"PUT",body)
});

/* =====  OPERATIONS  ===== */

addTool({
  name: "listOperations",
  description: `
Get all operations.

Returns a paged list of operations that belong to the authenticated
organization. Filter parameters:

• leafUserId    – UUID of one of your users
• provider      – CNHI | JohnDeere | Trimble | ClimateFieldView | AgLeader | Stara | Leaf
• startTime     – ISO-8601 timestamp; operations starting on/after this instant
• updatedTime   – ISO-8601 timestamp; operations updated on/after this instant
• endTime       – ISO-8601 timestamp; operations ending on/before this instant
• operationType – applied | planted | harvested | tillage
• fieldId       – Field UUID where the operation occurred

Pagination:
• page – Zero-based page number (default 0)
• size – Page size (max 100)

sort:
One or more comma-separated fields, priority left-to-right.
Each field may be suffixed by ',asc' (default) or ',desc'.
Valid fields: id | leafUserId | startTime | endTime | type | updatedTime
Example: "startTime,desc"
`,
  parameters: z.object({
    leafUserId: z.string().uuid().optional(), provider: z.string().optional(),
    startTime: z.string().optional(), updatedTime: z.string().optional(),
    endTime: z.string().optional(), operationType: z.string().optional(),
    fieldId: z.string().uuid().optional(), page: z.number().int().min(0).optional(),
    size: z.number().int().min(1).max(100).optional(), sort: z.string().optional()
  }),
  execute: (args) => {
    const url = new URL("operations/api/operations", BASE_URL);
    for (const [k, v] of Object.entries(args)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

addTool({
  name: "getOperation",
  description: "Get a single operation by ID.",
  parameters: z.object({ id: z.string() }),
  execute: ({ id }) => _get(new URL(`operations/api/operations/${id}`, BASE_URL))
});

addTool({
  name: "getOperationSummary",
  description: "Get GeoJSON summary for an operation.",
  parameters: z.object({ id: z.string() }),
  execute: ({ id }) => _get(new URL(`operations/api/operations/${id}/summary`, BASE_URL))
});

addTool({
  name: "getOperationUnits",
  description: "Return unit map for an operation.",
  parameters: z.object({ id: z.string() }),
  execute: ({ id }) => _get(new URL(`operations/api/operations/${id}/units`, BASE_URL))
});

/* =====  LEAF USERS  ===== */

addTool({
  name: "listUsers",
  description: `
Get all Leaf Users.

Returns a paged list of Leaf users that belong to the authenticated
organization. You can filter the results with:

• email      – Email address of the user
• name       – Full name of the user
• externalId – Your external identifier for the user

Pagination:
• page – Zero-based page number (default 0)
• size – Page size (max 100)
`,
  parameters: z.object({
    email: z.string().optional(), name: z.string().optional(),
    externalId: z.string().optional(), page: z.number().int().min(0).optional(),
    size: z.number().int().min(1).max(100).optional()
  }),
  execute: (args) => {
    const url = new URL("usermanagement/api/users", BASE_URL);
    for (const [k, v] of Object.entries(args)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

/* =====  MACHINE FILES  ===== */

addTool({
  name: "listFiles",
  description: `
Paginated list of machine files with optional filters (see \`sort\`).

Filter parameters:
• leafUserId       – UUID of one of your users
• provider         – CNHI | JohnDeere | Trimble | ClimateFieldView | AgLeader | RavenSlingshot | Stara | Leaf
• status           – processed | failed | processing
• origin           – provider | automerged | merged | uploaded
• organizationId   – Provider organisation ID (John Deere only)
• batchId          – UUID returned when an upload is initiated
• createdTime      – ISO-8601 timestamp; files created on/after this instant
• startTime        – ISO-8601 timestamp; operation started on/after this instant
• updatedTime      – ISO-8601 timestamp; files updated on/after this instant
• endTime          – ISO-8601 timestamp; operation ended on/before this instant
• operationType    – applied | planted | harvested | tillage
• minArea          – Minimum operation area in square metres (double)

sort:
One or more comma-separated fields, priority left-to-right.
Each field may be suffixed by ',asc' (default) or ',desc'.
Example: "createdTime,desc"
`,
  parameters: z.object({
    leafUserId: z.string().uuid().optional(), provider: z.string().optional(),
    status: z.string().optional(), origin: z.string().optional(),
    organizationId: z.string().optional(), batchId: z.string().uuid().optional(),
    createdTime: z.string().optional(), startTime: z.string().optional(),
    updatedTime: z.string().optional(), endTime: z.string().optional(),
    operationType: z.string().optional(), minArea: z.number().optional(),
    page: z.number().int().min(0).optional(), size: z.number().int().min(1).max(100).optional(),
    sort: z.string().optional()
  }),
  execute: (args) => {
    const url = new URL("operations/api/files", BASE_URL);
    for (const [k, v] of Object.entries(args)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

addTool({
  name: "getFile",
  description: "Return a machine file by ID.",
  parameters: z.object({ id: z.string() }),
  execute: ({ id }) => _get(new URL(`operations/api/files/${id}`, BASE_URL))
});

addTool({
  name: "getFileSummary",
  description: "Return summary for a machine file by ID.",
  parameters: z.object({ id: z.string() }),
  execute: ({ id }) => _get(new URL(`operations/api/files/${id}/summary`, BASE_URL))
});

addTool({
  name: "getFileStatus",
  /*
   * Get a file status
   *
   * Returns the processing status for every step of Leaf’s pipeline for the
   * specified file.
   *
   * Endpoint:
   *   GET /operations/api/files/{id}/status
   *
   * Path parameter:
   *   • id – UUID of the file to inspect
   *
   * Example curl:
   *   curl -H "Authorization: Bearer $TOKEN" \\
   *        "https://api.withleaf.io/services/operations/api/files/{id}/status"
   *
   * Example response:
   *   {
   *     "rawGeojson":       { "status": "processed", "message": "ok" },
   *     "normalizedGeojson":{ "status": "processed", "message": "ok" },
   *     "standardGeojson":  { "status": "processed", "message": "ok" },
   *     "propertiesPNGs":   { "status": "processed", "message": "ok" },
   *     "areaAndYield":     { "status": "processed", "message": "ok" },
   *     "summary":          { "status": "processed", "message": "ok" },
   *     "units":            { "status": "processed", "message": "ok" },
   *     "originalFile":     { "status": "processed", "message": "ok" },
   *     "cleanupGeojson":   { "status": "processed", "message": "ok" }
   *   }
   */
  parameters: z.object({ id: z.string() }),
  execute: ({ id }) =>
    _get(new URL(`operations/api/files/${id}/status`, BASE_URL))
});

/* =====  WEATHER  ===== */

/* ---- forecast – field ---- */

addTool({
  name: "getWeatherForecastFieldDaily",
  description: "Get daily forecasted weather for a Leaf user's field. startTime & endTime format: YYYY-MM-DD",
  parameters: z.object({
    leafUserId: z.string(),
    fieldId:    z.string(),
    startTime:  z.string().optional(),
    endTime:    z.string().optional(),
    model:      z.string().optional(),
    units:      z.string().optional()
  }),
  execute: ({ leafUserId, fieldId, ...query }) => {
    const url = new URL(
      `weather/api/users/${leafUserId}/weather/forecast/field/${fieldId}/daily`,
      BASE_URL
    );
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

addTool({
  name: "getWeatherForecastFieldHourly",
  description: "Get hourly forecasted weather for a Leaf user's field.",
  parameters: z.object({
    leafUserId: z.string(),
    fieldId:    z.string(),
    startTime:  z.string().optional(),
    endTime:    z.string().optional(),
    model:      z.string().optional(),
    units:      z.string().optional()
  }),
  execute: ({ leafUserId, fieldId, ...query }) => {
    const url = new URL(
      `weather/api/users/${leafUserId}/weather/forecast/field/${fieldId}/hourly`,
      BASE_URL
    );
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

/* ---- forecast – lat/lon ---- */

addTool({
  name: "getWeatherForecastLatLonDaily",
  description: "Get daily forecasted weather for a latitude/longitude pair.",
  parameters: z.object({
    lat:       z.number(),
    lon:       z.number(),
    startTime: z.string().optional(),
    endTime:   z.string().optional(),
    model:     z.string().optional(),
    units:     z.string().optional()
  }),
  execute: ({ lat, lon, ...query }) => {
    const url = new URL(
      `weather/api/weather/forecast/daily/${lat},${lon}`,
      BASE_URL
    );
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

addTool({
  name: "getWeatherForecastLatLonHourly",
  description: "Get hourly forecasted weather for a latitude/longitude pair.",
  parameters: z.object({
    lat:       z.number(),
    lon:       z.number(),
    startTime: z.string().optional(),
    endTime:   z.string().optional(),
    model:     z.string().optional(),
    units:     z.string().optional()
  }),
  execute: ({ lat, lon, ...query }) => {
    const url = new URL(
      `weather/api/weather/forecast/hourly/${lat},${lon}`,
      BASE_URL
    );
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

/* ---- historical – field ---- */

addTool({
  name: "getWeatherHistoricalFieldDaily",
  description: "Get daily historical weather for a Leaf user's field.",
  parameters: z.object({
    leafUserId: z.string(),
    fieldId:    z.string(),
    startTime:  z.string().optional(),
    endTime:    z.string().optional(),
    model:      z.string().optional(),
    units:      z.string().optional()
  }),
  execute: ({ leafUserId, fieldId, ...query }) => {
    const url = new URL(
      `weather/api/users/${leafUserId}/weather/historical/field/${fieldId}/daily`,
      BASE_URL
    );
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

addTool({
  name: "getWeatherHistoricalFieldHourly",
  description: "Get hourly historical weather for a Leaf user's field.",
  parameters: z.object({
    leafUserId: z.string(),
    fieldId:    z.string(),
    startTime:  z.string().optional(),
    endTime:    z.string().optional(),
    model:      z.string().optional(),
    units:      z.string().optional()
  }),
  execute: ({ leafUserId, fieldId, ...query }) => {
    const url = new URL(
      `weather/api/users/${leafUserId}/weather/historical/field/${fieldId}/hourly`,
      BASE_URL
    );
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

/* ---- historical – lat/lon ---- */

addTool({
  name: "getWeatherHistoricalLatLonDaily",
  description: "Get daily historical weather for a latitude/longitude pair.",
  parameters: z.object({
    lat:       z.number(),
    lon:       z.number(),
    startTime: z.string().optional(),
    endTime:   z.string().optional(),
    model:     z.string().optional(),
    units:     z.string().optional()
  }),
  execute: ({ lat, lon, ...query }) => {
    const url = new URL(
      `weather/api/weather/historical/daily/${lat},${lon}`,
      BASE_URL
    );
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

addTool({
  name: "getWeatherHistoricalLatLonHourly",
  description: "Get hourly historical weather for a latitude/longitude pair.",
  parameters: z.object({
    lat:       z.number(),
    lon:       z.number(),
    startTime: z.string().optional(),
    endTime:   z.string().optional(),
    model:     z.string().optional(),
    units:     z.string().optional()
  }),
  execute: ({ lat, lon, ...query }) => {
    const url = new URL(
      `weather/api/weather/historical/hourly/${lat},${lon}`,
      BASE_URL
    );
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    return _get(url);
  }
});

/* ---------- list mode ---------- */
if (process.argv.includes("--tools=list")) {
  console.log(JSON.stringify(catalogue, null, 2));
  process.exit(0);
}

/* ---------- stdio loop ---------- */
server.start({ transportType: "stdio" });