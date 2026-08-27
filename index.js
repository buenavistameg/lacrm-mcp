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

const server = new Server(
  { name: "lacrm-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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
          first_name: { type: "string", description: "First name" },
          last_name: { type: "string", description: "Last name" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
        },
        required: ["first_name"],
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
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
        const params = {
          Name: args.name,
          DueDate: args.due_date,
          Description: args.description || "",
        };
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
        const result = await lacrmCall("GetEvents", {
          StartDate: args.start_date,
          EndDate: args.end_date,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "create_event": {
        const result = await lacrmCall("CreateEvent", {
          Name: args.name,
          StartDate: args.start_date,
          EndDate: args.end_date,
          Description: args.description || "",
          Location: args.location || "",
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
        const params = {
          FirstName: args.first_name,
          LastName: args.last_name || "",
        };
        if (args.email) params.Email = [{ Text: args.email, Type: "Work" }];
        if (args.phone) params.Phone = [{ Text: args.phone, Type: "Work" }];
        const result = await lacrmCall("CreateContact", params);
        return { content: [{ type: "text", text: `Contact created. ID: ${result.ContactId}` }] };
      }

      case "create_note": {
        const result = await lacrmCall("CreateNote", {
          ContactId: args.contact_id,
          Note: args.note,
        });
        return { content: [{ type: "text", text: `Note added. ID: ${result.NoteId}` }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Express app for SSE transport
const app = express();
const transports = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => delete transports[transport.sessionId]);
  await server.connect(transport);
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

app.get("/health", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LACRM MCP server running on port ${PORT}`));
