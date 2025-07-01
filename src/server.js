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
  description: "Paginated list of fields with optional filters.",
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
  // `sort` accepts one or more comma-separated values. The first field has the
  // highest priority; each value may be followed by ` asc` (default) or ` desc`.
  // Example: "id desc,updatedTime"  → sort by id DESC then updatedTime ASC.
  description: "Paginated list of operations with optional filters (see `sort`).",
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
  description: "Paginated list of Leaf users, optionally filtered by email/name/externalId.",
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
  // Same `sort` behaviour as in listOperations (multi-value, asc/desc).
  // Example: "createdTime desc,status"
  description: "Paginated list of machine files with optional filters (see `sort`).",
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

/* =====  WEATHER  ===== */

/* ---- forecast – field ---- */

addTool({
  name: "getWeatherForecastFieldDaily",
  description: "Get daily forecasted weather for a Leaf user's field.",
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