import {
  AGENT_TOOLS,
  formatLongDate,
  parseDemoCommand,
  parseDueDate,
  type AgentToolName,
  type DemoIntent,
} from "@181hacks/paylink-core";
import { chaseUnpaid, findInvoice, issueInvoice, remindInvoice, unpaidInvoices } from "./invoices";
import { detectChannel, parseInbound } from "./ingest";
import { demoMode, env, paypalMode } from "./env";
import { formatUsd } from "./money";
import type { PaypalInvoice } from "./types";

const SYSTEM_PROMPT = `You are PayLink, an invoicing and collections agent for a freelance studio.
The merchant bills clients in USD through PayPal. Turn plain sentences, pasted emails, and short chats into tool calls.
Use create_invoice, check_status, list_unpaid, send_reminder, and generate_pdf.
create_invoice sends a PayPal invoice unless asDraft is true.
send_reminder chases an unpaid PayPal invoice. Never remind a paid invoice.
Never invent a payment, a PayPal transaction id, or a paid status.
If the email address is missing and the merchant wants it sent, ask for it.
Keep replies to a few sentences. Speak about the invoice, the PayPal pay link, and the receipt.`;

const TOOLS = AGENT_TOOLS.map((tool) => {
  if (tool.function.name === "create_invoice") {
    return {
      ...tool,
      function: {
        ...tool.function,
        description: "Create a USD PayPal invoice and a pay link for a client.",
        parameters: {
          ...tool.function.parameters,
          properties: {
            ...(tool.function.parameters.properties as object),
            amount: { type: "string", description: "Decimal USD amount, such as 150 or 80.50" },
          },
        },
      },
    };
  }
  if (tool.function.name === "send_reminder") {
    return {
      ...tool,
      function: { ...tool.function, description: "Send a PayPal reminder for an open invoice. Refused when the invoice is paid or still a draft." },
    };
  }
  if (tool.function.name === "generate_pdf") {
    return {
      ...tool,
      function: { ...tool.function, description: "Open the printable invoice page for a client." },
    };
  }
  return tool;
});

export interface ChatRequest {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface ChatResponse {
  reply: string;
  mode: "demo" | "llm";
  paypal: "demo" | "sandbox";
  invoice?: PaypalInvoice;
  invoices?: PaypalInvoice[];
  link?: string;
}

export async function runChat(request: ChatRequest, origin: string): Promise<ChatResponse> {
  const paypal = paypalMode();
  const text = request.message.trim();
  const lower = text.toLowerCase();
  if (/\b(chase|remind|nudge)\b/.test(lower) && /\b(all|everyone|unpaid|outstanding|open)\b/.test(lower)) {
    const result = await chaseUnpaid(origin);
    const paypalModeName = paypal;
    if (result.reminded.length === 0) {
      return { mode: agentMode(), paypal: paypalModeName, reply: result.skipped[0] ?? "Nothing open to chase." };
    }
    const lines = result.reminded.map((invoice) => `${invoice.number} · ${invoice.clientName}`).join("\n");
    return {
      mode: agentMode(),
      paypal: paypalModeName,
      invoices: result.reminded,
      reply: `Chased ${result.reminded.length} open ${result.reminded.length === 1 ? "invoice" : "invoices"} through PayPal.\n${lines}`,
    };
  }

  const channel = detectChannel(text);
  if (channel) {
    const inbound = parseInbound(text, channel);
    if (!inbound.ok) return { mode: agentMode(), paypal, reply: inbound.hint };
    return act(
      {
        type: "create_invoice",
        clientName: inbound.clientName,
        clientEmail: inbound.clientEmail,
        amount: inbound.amount,
        description: inbound.description,
        dueDate: inbound.dueDate,
        asDraft: false,
      },
      origin,
      channel,
    );
  }

  const mode = agentMode();
  const intent = mode === "llm" ? await llmIntent(request) : parseDemoCommand(text);
  return act(intent, origin, "agent");
}

function agentMode(): "demo" | "llm" {
  return demoMode() ? "demo" : "llm";
}

async function act(intent: DemoIntent, origin: string, channel: PaypalInvoice["channel"]): Promise<ChatResponse> {
  const mode = agentMode();
  const paypal = paypalMode();
  if (intent.type === "help") {
    return {
      mode,
      paypal,
      reply: 'I draft PayPal invoices, list what is open, and chase late ones. Try "invoice Ada Lovelace ada@example.com 480 USD for the logo, due Friday".',
    };
  }
  if (intent.type === "unknown") return { mode, paypal, reply: intent.hint.replace("USDC", "USD") };
  if (intent.type === "list_unpaid") {
    const invoices = unpaidInvoices();
    if (invoices.length === 0) return { mode, paypal, invoices, reply: "Nothing is open. The books are clear." };
    const lines = invoices.map((invoice) => `${invoice.clientName} · ${formatUsd(invoice.amount)} USD · ${invoice.status} · ${invoice.number}`).join("\n");
    return { mode, paypal, invoices, reply: `${invoices.length} open ${invoices.length === 1 ? "invoice" : "invoices"}:\n${lines}` };
  }
  if (intent.type === "create_invoice") {
    try {
      const invoice = await issueInvoice({ ...intent, channel, origin });
      const link = `${origin.replace(/\/$/, "")}/pay/${invoice.id}`;
      return {
        mode,
        paypal,
        invoice,
        link: invoice.status === "draft" ? `/invoices/${invoice.id}` : link,
        reply: intent.asDraft
          ? `Draft ${invoice.number} is saved for ${invoice.clientName}. PayPal id ${invoice.payment?.reference ?? "pending"}. It is not sent yet.`
          : `Invoice ${invoice.number} is with PayPal for ${invoice.clientName}. ${formatUsd(invoice.amount)} USD for ${invoice.description}, due ${formatLongDate(invoice.dueDate)}. Pay link: ${link}`,
      };
    } catch (error) {
      return { mode, paypal, reply: error instanceof Error ? error.message : "I couldn't create the invoice." };
    }
  }
  if (intent.type === "check_status") {
    const invoice = findInvoice(intent.query);
    if (!invoice) return { mode, paypal, reply: `I couldn't find an invoice matching “${intent.query}”.` };
    return {
      mode,
      paypal,
      invoice,
      link: `/pay/${invoice.id}`,
      reply: `${invoice.number} for ${invoice.clientName} is ${invoice.status}. ${formatUsd(invoice.amount)} USD for ${invoice.description}, due ${formatLongDate(invoice.dueDate)}.${invoice.payment?.reference ? ` PayPal ${invoice.payment.reference}.` : ""}`,
    };
  }
  if (intent.type === "generate_pdf") {
    const invoice = findInvoice(intent.query);
    if (!invoice) return { mode, paypal, reply: intent.query ? `I couldn't find “${intent.query}”.` : "Which invoice should I open?" };
    return {
      mode,
      paypal,
      invoice,
      link: `/invoices/${invoice.id}`,
      reply: `${invoice.number} is ready to print. Open /invoices/${invoice.id}.`,
    };
  }
  try {
    const result = await remindInvoice(intent.query, origin);
    if (result.refusal) return { mode, paypal, invoice: result.invoice, reply: result.refusal };
    return {
      mode,
      paypal,
      invoice: result.invoice,
      reply: result.invoice.clientEmail
        ? `Reminded ${result.invoice.clientName} about ${result.invoice.number}. The PayPal invoice is still ${formatUsd(result.invoice.amount)} USD.`
        : `I noted a reminder for ${result.invoice.number}, but there is no email on it, so PayPal and the mail log had nowhere to send it.`,
    };
  } catch (error) {
    return { mode, paypal, reply: error instanceof Error ? error.message : "I couldn't send the reminder." };
  }
}

async function llmIntent(request: ChatRequest): Promise<DemoIntent> {
  try {
    const response = await fetch(`${env("LLM_BASE_URL", "https://api.openai.com/v1")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("LLM_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env("LLM_MODEL", "gpt-4o-mini"),
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...(request.history ?? []).slice(-8),
          { role: "user", content: request.message },
        ],
        tools: TOOLS,
        tool_choice: "auto",
      }),
    });
    if (!response.ok) return parseDemoCommand(request.message);
    const json = (await response.json()) as {
      choices?: { message?: { content?: string; tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
    };
    const call = json.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (!call?.name) return parseDemoCommand(request.message);
    return toolToIntent(call.name as AgentToolName, JSON.parse(call.arguments || "{}") as Record<string, string | boolean>);
  } catch {
    return parseDemoCommand(request.message);
  }
}

function toolToIntent(name: AgentToolName, args: Record<string, string | boolean>): DemoIntent {
  if (name === "create_invoice") {
    const clientName = String(args.clientName ?? "").trim();
    const amount = String(args.amount ?? "").trim();
    if (!clientName || !amount) return { type: "unknown", hint: "I need a client and an amount before I can create a PayPal invoice." };
    return {
      type: "create_invoice",
      clientName,
      clientEmail: args.clientEmail ? String(args.clientEmail) : undefined,
      amount,
      description: String(args.description ?? "Services"),
      dueDate: parseDueDate(args.dueDate ? String(args.dueDate) : undefined, new Date()),
      asDraft: Boolean(args.asDraft),
    };
  }
  if (name === "list_unpaid") return { type: "list_unpaid" };
  if (name === "check_status") return { type: "check_status", query: String(args.query ?? "") };
  if (name === "send_reminder") return { type: "send_reminder", query: String(args.query ?? "") };
  return { type: "generate_pdf", query: String(args.query ?? "") };
}
