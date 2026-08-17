import { AlertCircleIcon, DashedLineCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { tv } from "tailwind-variants";

const toolActivityHeadline = tv({
  variants: {
    isError: { true: "fg-error" },
  },
  defaultVariants: { isError: false },
});

/**
 * Tool-call row for the compact activity widget.
 * Shape matches the run-record toolCalls entries; this primitive must not
 * import conversation store types (layer map: ai-react owns UI only).
 */
export type AIToolCallRecord = {
  id: string;
  name: string;
  input: unknown;
  status: "running" | "success" | "error";
  output?: unknown;
  error?: unknown;
};

export type AIToolActivityProps = {
  calls: readonly AIToolCallRecord[];
};

export function AIToolActivity({ calls }: AIToolActivityProps) {
  const { _ } = useLingui();
  if (calls.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 px-3" aria-label={_(msg`ai.chat.tool-activity.label`)}>
      {calls.map((call) => (
        <ToolActivityRow key={call.id} call={call} />
      ))}
    </ul>
  );
}

type ToolActivityRowProps = {
  call: AIToolCallRecord;
};

function ToolActivityRow({ call }: ToolActivityRowProps) {
  const { _ } = useLingui();
  const summary = toolCallSummary(call, _);
  const headline = summary ? `${call.name} — ${summary}` : call.name;
  const inputText = formatToolPayload(call.input);
  const outputText = call.status === "success" ? formatToolPayload(call.output) : "";
  const errorText = call.status === "error" ? formatToolPayload(call.error) : "";
  const hasInspectablePayload = inputText !== "" || outputText !== "" || errorText !== "";

  const heading = (
    <span className="flex flex-row items-center gap-2">
      {call.status === "running" ? (
        <HugeiconsIcon
          className="size-4 min-w-4 animate-spin"
          strokeWidth={1.75}
          icon={DashedLineCircleIcon}
          aria-label={_(msg`ai.chat.tool-activity.running`)}
        />
      ) : call.status === "error" ? (
        <HugeiconsIcon
          className="size-4 min-w-4 fg-error"
          strokeWidth={1.75}
          icon={AlertCircleIcon}
          aria-label={_(msg`ai.chat.tool-activity.failed`)}
        />
      ) : null}
      <span className={toolActivityHeadline({ isError: call.status === "error" })}>{headline}</span>
    </span>
  );

  return (
    <li className="fg-level-4 text-sm">
      {hasInspectablePayload ? (
        <details>
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{heading}</summary>
          <div className="mt-1 ml-6 flex flex-col gap-2">
            {inputText ? <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.input`)} text={inputText} /> : null}
            {outputText ? <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.output`)} text={outputText} /> : null}
            {errorText ? <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.failed`)} text={errorText} /> : null}
          </div>
        </details>
      ) : (
        heading
      )}
    </li>
  );
}

type ToolPayloadBlockProps = {
  label: string;
  text: string;
};

function ToolPayloadBlock({ label, text }: ToolPayloadBlockProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs">{label}</span>
      <pre className="whitespace-pre-wrap break-all text-xs leading-5">{text}</pre>
    </div>
  );
}

function toolCallSummary(call: AIToolCallRecord, _: (message: { toString(): string }) => string): string | null {
  if (call.status === "error") return _(msg`ai.chat.tool-activity.failed`);
  if (call.status !== "success") return null;
  // WHY: compact counts exist only for these two output shapes; unknown tools
  // must stay name-only (commit 5 copy decision / Visibility UI).
  if (call.name === "list_decks") {
    const count = namedArrayLength(call.output, "decks");
    if (count !== null) return _(msg`ai.chat.tool-activity.decks ${count}`);
  }
  if (call.name === "get_deck_cards") {
    const count = namedArrayLength(call.output, "cards") ?? namedNumber(call.output, "totalCards");
    if (count !== null) return _(msg`ai.chat.tool-activity.cards ${count}`);
  }
  return null;
}

function namedArrayLength(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field) ? field.length : null;
}

function namedNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function formatToolPayload(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value, null, 2);
    return json === undefined ? "" : json;
  } catch {
    // WHY: tool payloads are JSON-shaped in practice; stringify can still throw
    // on cyclic host objects, and inspection must not crash the chat row.
    return String(value);
  }
}
