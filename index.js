import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";

const API_KEY = process.env.LACRM_API_KEY;
const USER_ID = process.env.LACRM_USER_ID;

if (!API_KEY || !USER_ID) {
  console.error("Missing LACRM_API_KEY or LACRM_USER_ID environment variables.");
  process.exit(1);
}

async function lacrmCall(functionName, parameters = {}) {
  const response = await fetch("https://api.lessannoyingcrm.com/v2/", {
    method: "POST",
    headers: {
      Authorization: API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Function: functionName,
      Parameters: { UserId: USER_ID, ...parameters },
    }),
  });
  const data = await response.json();
  if (data.ErrorCode) throw new Error(data.ErrorDescription);
  return data;
}

const TOOLS = [
  {
    name: "get_tasks",
    description: "Get tasks from Less Annoying CRM within a date range",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date YYYY-MM-DD" },
        end_date: { type: "string", description: "End date YYYY-MM-DD" },
        include_completed: { type: "boolean", description: "Include completed tasks (default false)" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "create_task",
    description: "Create a new task in Less Annoying CRM",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Task name" },
        due_date: { type: "string", description: "Due date YYYY-MM-DD" },
        description: { type: "string", description: "Task notes/description" },
        contact_id: { type: "string", description: "Optional contact ID to link task to" },
      },
      required: ["name", "due_date"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as completed",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to mark complete" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "reschedule_task",
    description: "Change the due date of a task",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to reschedule" },
        new_date: { type: "string", description: "New due date YYYY-MM-DD" },
      },
      required: ["task_id", "new_date"],
    },
  },
  {
    name: "get_events",
    description: "Get calendar events from Less Annoying CRM",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date YYYY-MM-DD" },
        end_date: { type: "string", description: "End date YYYY-MM-DD" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "create_event",
    description: "Create a calendar event in Less Annoying CRM",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Event name" },
        start_date: { type: "string", description: "Start datetime ISO format e.g. 2026-09-01T09:00:00" },
        end_date: { type: "string", description: "End datetime ISO format e.g. 2026-09-01T10:00:00" },
        description: { type: "string", description: "Event description" },
        location: { type: "string", description: "Event location" },
      },
      required: ["name", "start_date", "end_date"],
    },
  },
  {
    name: "search_contacts",
    description: "Search for contacts in Less Annoying CRM by name, email, or phone",
    inputSchema: {
      type: "object",
      properties: {
        search_terms: { type: "string", description: "Name, email, or phone to search" },
      },
      required: ["search_terms"],
    },
  },
  {
    name: "get_contact",
    description: "Get full details for a specific contact",
    inputSchema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "The contact ID" },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "create_contact",
    description: "Create a new contact in Less Annoying CRM",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the contact" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        is_company: { type: "boolean", description: "True if this is a company, false for a person (default false)" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_note",
    description: "Add a note to a contact in Less Annoying CRM",
    inputSchema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "The contact ID to add the note to" },
        note: { type: "string", description: "The note text" },
      },
      required: ["contact_id", "note"],
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case "get_tasks": {
      const result = await lacrmCall("GetTasks", {
        StartDate: args.start_date,
        EndDate: args.end_date,
        IncludeCompleted: args.include_completed ?? false,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    case "create_task": {
      const params = { Name: args.name, DueDate: args.due_date, Description: args.description || "" };
      if (args.contact_id) params.ContactId = args.contact_id;
      const result = await lacrmCall("CreateTask", params);
      return { content: [{ type: "text", text: `Task created. ID: ${result.TaskId}` }] };
    }
    case "complete_task": {
      await lacrmCall("EditTask", { TaskId: args.task_id, IsCompleted: true });
      return { content: [{ type: "text", text: "Task marked as completed." }] };
    }
    case "reschedule_task": {
      await lacrmCall("EditTask", { TaskId: args.task_id, DueDate: args.new_date });
      return { content: [{ type: "text", text: `Task rescheduled to ${args.new_date}.` }] };
    }
    case "get_events": {
      const result = await lacrmCall("GetEvents", { StartDate: args.start_date, EndDate: args.end_date });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    case "create_event": {
      const result = await lacrmCall("CreateEvent", {
        Name: args.name, StartDate: args.start_date, EndDate: args.end_date,
        Description: args.description || "", Location: args.location || "",
      });
      return { content: [{ type: "text", text: `Event created. ID: ${result.EventId}` }] };
    }
    case "search_contacts": {
      const result = await lacrmCall("GetContacts", { SearchTerms: args.search_terms });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    case "get_contact": {
      const result = await lacrmCall("GetContact", { ContactId: args.contact_id });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    case "create_contact": {
      const params = { Name: args.name, IsCompany: args.is_company ?? false, AssignedTo: USER_ID };
      if (args.email) params.Email = [{ Text: args.email, Type: "Work" }];
      if (args.phone) params.Phone = [{ Text: args.phone, Type: "Work" }];
      const result = await lacrmCall("CreateContact", params);
      return { content: [{ type: "text", text: `Contact created. ID: ${result.ContactId}` }] };
    }
    case "create_note": {
      const result = await lacrmCall("CreateNote", { ContactId: args.contact_id, Note: args.note });
      return { content: [{ type: "text", text: `Note added. ID: ${result.NoteId}` }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const app = express();

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Cache-Control, mcp-session-id");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── OAuth 2.1 endpoints ───────────────────────────────────────────────────────

const authCodes = new Map();

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    scopes_supported: ["mcp"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

app.get("/.well-known/oauth-protected-resource", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  res.json({
    resource: base,
    authorization_servers: [base],
    scopes_supported: ["mcp"],
  });
});

app.post("/register", express.json(), (req, res) => {
  res.status(201).json({
    client_id: "claude-mcp-" + Date.now(),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(req.body || {}),
  });
});

app.get("/authorize", (req, res) => {
  const { redirect_uri, state } = req.query;
  if (!redirect_uri) return res.status(400).send("Missing redirect_uri");
  const code = Math.random().toString(36).slice(2) + Date.now().toString(36);
  authCodes.set(code, { created: Date.now() });
  for (const [k, v] of authCodes) {
    if (Date.now() - v.created > 600_000) authCodes.delete(k);
  }
  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.post("/token", express.urlencoded({ extended: true }), express.json(), (req, res) => {
  res.json({
    access_token: "lacrm-token-" + Date.now(),
    token_type: "Bearer",
    expires_in: 86400,
    scope: "mcp",
  });
});

// ── Streamable HTTP — raw JSON-RPC (no SDK transport needed) ──────────────────
app.get("/mcp", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  res.flushHeaders();
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 30000);
  req.on("close", () => clearInterval(heartbeat));
});
app.post("/mcp", express.json(), async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  // Notifications are one-way — no response
  if (method && method.startsWith("notifications/")) {
    return res.status(204).end();
  }

  const reply = (result) => res.json({ jsonrpc: "2.0", id, result });
  const error = (code, message) => res.json({ jsonrpc: "2.0", id, error: { code, message } });

  try {
    switch (method) {
      case "initialize":
        res.set("mcp-session-id", "lacrm-" + Date.now());
        return reply({
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "lacrm-mcp", version: "1.0.0" },
        });

      case "tools/list":
        return reply({ tools: TOOLS });

      case "tools/call": {
        const result = await handleToolCall(params.name, params.arguments || {});
        return reply(result);
      }

      case "ping":
        return reply({});

      default:
        return error(-32601, `Method not found: ${method}`);
    }
  } catch (err) {
    console.error("MCP error:", err);
    return error(-32000, err.message);
  }
});

// ── SSE transport (legacy fallback) ──────────────────────────────────────────

const server = new Server(
  { name: "lacrm-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await handleToolCall(name, args);
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

const transports = {};

app.get("/sse", async (req, res) => {
  try {
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;
    res.on("close", () => delete transports[transport.sessionId]);
    await server.connect(transport);
  } catch (error) {
    console.error("SSE connection error:", error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

app.post("/messages", express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("Session not found");
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`LACRM MCP server running on port ${PORT}`));
