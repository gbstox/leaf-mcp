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
const catalogue = [];   // reused for --tools=list

/* ---------- helper ---------- */
function addTool(tool) {
  server.addTool(tool);
  catalogue.push({ name: tool.name, description: tool.description });
}

/* ---------- 1. Create field ---------- */
addTool({
  name: "createField",
  description: "Create a field for a Leaf user.",
  parameters: z.object({
    leafUserId: z.string().describe("Leaf user ID"),
    body:       z.any().describe("JSON matching FieldCreate schema")
  }),
  execute: async ({ leafUserId, body }) => {
    const url  = new URL(`/fields/api/users/${leafUserId}/fields`, BASE_URL);
    const res  = await fetch(url, {
      method:  "POST",
      headers: { Authorization: AUTH, "Content-Type": "application/json" },
      body:    JSON.stringify(body ?? {})
    });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* ---------- 2. Get field ---------- */
addTool({
  name: "getField",
  description: "Fetch a single field by ID.",
  parameters: z.object({
    leafUserId: z.string().describe("Leaf user ID"),
    fieldId:    z.string().describe("Field ID")
  }),
  execute: async ({ leafUserId, fieldId }) => {
    const url  = new URL(
      `/fields/api/users/${leafUserId}/fields/${fieldId}`,
      BASE_URL
    );
    const res  = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt = await res.text();
    try { return JSON.stringify(JSON.parse(txt)); } catch { return txt; }
  }
});

/* ---------- 3. List fields ---------- */
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
    for (const [k, v] of Object.entries(args)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const res  = await fetch(url, { method: "GET", headers: { Authorization: AUTH } });
    const txt  = await res.text();
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
