#!/usr/bin/env node
/**
 * Leaf MCP proxy — Node 18+ / fastmcp@3.8
 *
 *   normal :  node leaf-mcp
 *   list    :  leaf-mcp --tools=list
 */
import { FastMCP } from "fastmcp";
import { z }       from "zod";
import { fetch }   from "undici";

/* ---------- constants ---------- */
const BASE_URL = new URL("https://api.withleaf.io/services");
const AUTH     = `Bearer ${process.env.LEAF_API_KEY || ""}`;

/* ---------- FastMCP shell ---------- */
const server    = new FastMCP({ name: "Leaf API", version: "1.0.0" });
const catalogue = [];                   // used for --tools=list

/* ---------- helper ---------- */
function addTool(tool) {
  server.addTool(tool);
  catalogue.push({ name: tool.name, description: tool.description });
}

/* =====  FIELD-BOUNDARY MANAGEMENT  ===== */

/* 1. Create field */
addTool({
  name: "createField",
  description: "Create a field for a Leaf user.",
  parameters: z.object({
    leafUserId: z.string(),
    body:       z.any()
  }),
  execute: async ({ leafUserId, body }) => {
    const url = new URL(`/fields/api/users/${leafUserId}/fields`, BASE_URL);
    const res = await fetch(url, {
      method:  "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body:    JSON.stringify(body ?? {})
    });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* 2. Get field */
addTool({
  name: "getField",
  description: "Fetch a single field by ID.",
  parameters: z.object({
    leafUserId: z.string(),
    fieldId:    z.string()
  }),
  execute: async ({ leafUserId, fieldId }) => {
    const url = new URL(`/fields/api/users/${leafUserId}/fields/${fieldId}`, BASE_URL);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* 3. List fields */
addTool({
  name: "listFields",
  description:
    "Return a paginated list of fields. Supports type, farmId, provider, leafUserId, page, size filters.",
  parameters: z.object({
    type:       z.string().optional(),
    farmId:     z.number().int().optional(),
    provider:   z.string().optional(),
    leafUserId: z.string().uuid().optional(),
    page:       z.number().int().min(0).optional(),
    size:       z.number().int().min(1).max(100).optional()
  }),
  execute: async (args) => {
    const url = new URL("/fields/api/fields", BASE_URL);
    for (const [k, v] of Object.entries(args)) if (v !== undefined) url.searchParams.set(k, v);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* 4. Get field boundary */
addTool({
  name: "getFieldBoundary",
  description: "Return the active boundary of a field.",
  parameters: z.object({
    leafUserId: z.string(),
    fieldId:    z.string()
  }),
  execute: async ({ leafUserId, fieldId }) => {
    const url = new URL(
      `/fields/api/users/${leafUserId}/fields/${fieldId}/boundary`,
      BASE_URL
    );
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* 5. Update field boundary */
addTool({
  name: "updateFieldBoundary",
  description: "Replace the active boundary of a field.",
  parameters: z.object({
    leafUserId: z.string(),
    fieldId:    z.string(),
    body:       z.any()
  }),
  execute: async ({ leafUserId, fieldId, body }) => {
    const url = new URL(
      `/fields/api/users/${leafUserId}/fields/${fieldId}/boundary`,
      BASE_URL
    );
    const res = await fetch(url, {
      method:  "PUT",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body:    JSON.stringify(body ?? {})
    });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* =====  OPERATIONS  ===== */

/* 6. List operations */
addTool({
  name: "listOperations",
  description:
    "Paginated list of operations with optional filters (leafUserId, provider, startTime, updatedTime, endTime, operationType, fieldId, page, size, sort).",
  parameters: z.object({
    leafUserId:    z.string().uuid().optional(),
    provider:      z.string().optional(),
    startTime:     z.string().optional(),
    updatedTime:   z.string().optional(),
    endTime:       z.string().optional(),
    operationType: z.string().optional(),
    fieldId:       z.string().uuid().optional(),
    page:          z.number().int().min(0).optional(),
    size:          z.number().int().min(1).max(100).optional(),
    sort:          z.string().optional()
  }),
  execute: async (args) => {
    const url = new URL("/operations/api/operations", BASE_URL);
    for (const [k, v] of Object.entries(args)) if (v !== undefined) url.searchParams.set(k, v);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* 7. Get operation */
addTool({
  name: "getOperation",
  description: "Get a single operation by ID.",
  parameters: z.object({ id: z.string() }),
  execute: async ({ id }) => {
    const url = new URL(`/operations/api/operations/${id}`, BASE_URL);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* 8. Get operation summary */
addTool({
  name: "getOperationSummary",
  description: "Get GeoJSON summary for an operation.",
  parameters: z.object({ id: z.string() }),
  execute: async ({ id }) => {
    const url = new URL(`/operations/api/operations/${id}/summary`, BASE_URL);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* 9. Get operation units */
addTool({
  name: "getOperationUnits",
  description: "Return unit map for an operation.",
  parameters: z.object({ id: z.string() }),
  execute: async ({ id }) => {
    const url = new URL(`/operations/api/operations/${id}/units`, BASE_URL);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* =====  LEAF USERS  ===== */

/* 10. List users */
addTool({
  name: "listUsers",
  description: "Paginated list of Leaf users, filterable by email, name, externalId.",
  parameters: z.object({
    email:      z.string().optional(),
    name:       z.string().optional(),
    externalId: z.string().optional(),
    page:       z.number().int().min(0).optional(),
    size:       z.number().int().min(1).max(100).optional()
  }),
  execute: async (args) => {
    const url = new URL("/usermanagement/api/users", BASE_URL);
    for (const [k, v] of Object.entries(args)) if (v !== undefined) url.searchParams.set(k, v);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* =====  MACHINE FILES  ===== */

/* 11. List files */
addTool({
  name: "listFiles",
  description:
    "Paginated list of machine files. Supports many optional filters (leafUserId, provider, status, origin, organizationId, batchId, createdTime, startTime, updatedTime, endTime, operationType, minArea, page, size, sort).",
  parameters: z.object({
    leafUserId:     z.string().uuid().optional(),
    provider:       z.string().optional(),
    status:         z.string().optional(),
    origin:         z.string().optional(),
    organizationId: z.string().optional(),
    batchId:        z.string().uuid().optional(),
    createdTime:    z.string().optional(),
    startTime:      z.string().optional(),
    updatedTime:    z.string().optional(),
    endTime:        z.string().optional(),
    operationType:  z.string().optional(),
    minArea:        z.number().optional(),
    page:           z.number().int().min(0).optional(),
    size:           z.number().int().min(1).max(100).optional(),
    sort:           z.string().optional()
  }),
  execute: async (args) => {
    const url = new URL("/operations/api/files", BASE_URL);
    for (const [k, v] of Object.entries(args)) if (v !== undefined) url.searchParams.set(k, v);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* 12. Get file */
addTool({
  name: "getFile",
  description: "Return a machine file by ID.",
  parameters: z.object({ id: z.string() }),
  execute: async ({ id }) => {
    const url = new URL(`/operations/api/files/${id}`, BASE_URL);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* 13. Get file summary */
addTool({
  name: "getFileSummary",
  description: "Return summary for a machine file by ID.",
  parameters: z.object({ id: z.string() }),
  execute: async ({ id }) => {
    const url = new URL(`/operations/api/files/${id}/summary`, BASE_URL);
    const res = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* ---------- list mode ---------- */
if (process.argv.includes("--tools=list")) {
  console.log(JSON.stringify(catalogue, null, 2));
  process.exit(0);
}

/* ---------- stdio loop ---------- */
server.start({ transportType: "stdio" });
