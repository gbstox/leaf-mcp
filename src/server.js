#!/usr/bin/env node
/**
 * Leaf MCP proxy — Node 18+ / fastmcp@3.8
 *  – normal mode:   node leaf-mcp        (waits for JSON-RPC over stdio)
 *  – list  mode:    leaf-mcp --tools=list   (prints catalogue then exits)
 */
import fs from "fs";
import yaml from "yaml";
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { fetch } from "undici";

/* ---------- load trimmed OpenAPI spec ---------- */
const spec = yaml.parse(
  fs.readFileSync(
    new URL("./resources/leaf_mcp_spec.yaml", import.meta.url),
    "utf8"
  )
);

const BASE_URL = new URL(
  spec.servers?.[0]?.url || "https://api.withleaf.io/services"
);

/* ---------- create server shell ---------- */
const server = new FastMCP({
  name: "Leaf API",
  version: spec.info?.version || "1.0.0"
});

const catalogue = [];                 // we keep a copy for --tools=list

/* ---------- helper: Zod schema ---------- */
function schema(op) {
  const shape = {};
  for (const p of op.parameters || []) shape[p.name] = z.any();
  if (op.requestBody?.content?.["application/json"]) shape.__body = z.any();
  return Object.keys(shape).length ? z.object(shape) : z.object({});
}

/* ---------- register every operation ---------- */
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [httpMethod, op] of Object.entries(methods)) {
    const toolName = (op.operationId || `${httpMethod}_${path}`)
      .replace(/[{}\/]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    const tool = {
      name: toolName,
      description:
        op.summary || op.description || `${httpMethod.toUpperCase()} ${path}`,
      parameters: schema(op),

      execute: async (args) => {
        /* build URL */
        const urlPath = path.replace(/\{(\w+)\}/g, (_, k) => args[k]);
        const url = new URL(urlPath, BASE_URL);

        /* query params */
        (op.parameters || []).forEach((p) => {
          if (
            p.in === "query" &&
            !path.includes(`{${p.name}}`) &&
            args[p.name] !== undefined
          ) {
            url.searchParams.set(p.name, args[p.name]);
          }
        });

        /* HTTP call */
        const res = await fetch(url, {
          method: httpMethod.toUpperCase(),
          headers: {
            Authorization: `Bearer ${process.env.LEAF_API_KEY || ""}`,
            "Content-Type": "application/json"
          },
          body: op.requestBody?.content?.["application/json"]
            ? JSON.stringify(args.__body || {})
            : undefined
        });

        const text = await res.text();
        try { return JSON.stringify(JSON.parse(text)); }
        catch { return text; }
      }
    };

    server.addTool(tool);
    catalogue.push({ name: tool.name, description: tool.description });
  }
}

/* ---------- one-shot list mode ---------- */
if (process.argv.includes("--tools=list")) {
  console.log(JSON.stringify(catalogue, null, 2));
  process.exit(0);
}

/* ---------- normal MCP stdio loop ---------- */
server.start({ transportType: "stdio" });
