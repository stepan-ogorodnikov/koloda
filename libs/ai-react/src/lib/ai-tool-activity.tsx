import { AlertCircleIcon, Wrench01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { tv } from "tailwind-variants";

const toolActivityHeadline = tv({
  base: "flex flex-row items-center gap-2",
  variants: {
    isError: { true: "fg-error" },
    isRunning: { true: "animate-shimmer" },
  },
  defaultVariants: { isError: false, isRunning: false },
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
  const displayName = toolCallLabel(call.name, _);
  const summary = toolCallSummary(call, _);
  const headline = summary ? `${displayName} - ${summary}` : displayName;
  const inputText = formatToolPayload(call.input);
  const outputText = call.status === "success" ? formatToolPayload(call.output) : "";
  const errorText = call.status === "error" ? formatToolPayload(call.error) : "";

  return (
    <li className="fg-level-4">
      <details>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <span
            className={toolActivityHeadline({
              isError: call.status === "error",
              isRunning: call.status === "running",
            })}
          >
            <ToolCallStatusIcon status={call.status} />
            <span>{headline}</span>
          </span>
        </summary>
        <div className="mt-1 ml-7 flex flex-col gap-2">
          <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.tool`)} text={call.name} />
          {inputText ? <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.input`)} text={inputText} /> : null}
          {outputText ? <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.output`)} text={outputText} /> : null}
          {errorText ? <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.failed`)} text={errorText} /> : null}
        </div>
      </details>
    </li>
  );
}

type ToolCallStatusIconProps = {
  status: AIToolCallRecord["status"];
};

function ToolCallStatusIcon({ status }: ToolCallStatusIconProps) {
  const { _ } = useLingui();

  if (status === "error") {
    return (
      <HugeiconsIcon
        className="size-5 min-w-5"
        strokeWidth={1.75}
        icon={AlertCircleIcon}
        aria-label={_(msg`ai.chat.tool-activity.failed`)}
      />
    );
  }

  return (
    <HugeiconsIcon
      className="size-5 min-w-5"
      strokeWidth={1.5}
      icon={Wrench01Icon}
      aria-hidden={status === "running" ? undefined : true}
      aria-label={status === "running" ? _(msg`ai.chat.tool-activity.running`) : undefined}
    />
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

function toolCallLabel(name: string, translate: I18n["_"]): string {
  // WHY: labels exist only for the two shipped tools; unknown names stay the protocol id
  // so a new tool still renders instead of a missing catalog string.
  if (name === "list_decks") return translate(msg`ai.chat.tool-activity.list-decks`);
  if (name === "get_deck_cards") return translate(msg`ai.chat.tool-activity.get-deck-cards`);
  return name;
}

function toolCallSummary(call: AIToolCallRecord, translate: I18n["_"]): string | null {
  // WHY: the translator param must not be named `_`. Lingui treats `_()` as the
  // t-macro and extracts nested `plural()` as `{0}`, which does not match the SWC runtime id.
  if (call.status === "error") return translate(msg`ai.chat.tool-activity.failed`);
  if (call.status !== "success") return null;
  // WHY: compact counts exist only for these two output shapes; unknown tools
  // must stay name-only (commit 5 copy decision / Visibility UI).
  if (call.name === "list_decks") {
    const deckCount = namedArrayLength(call.output, "decks");
    if (deckCount !== null) return translate(msg`${plural(deckCount, { other: "ai.chat.tool-activity.decks" })}`);
  }
  if (call.name === "get_deck_cards") {
    const cardCount = namedArrayLength(call.output, "cards") ?? namedNumber(call.output, "totalCards");
    if (cardCount !== null) return translate(msg`${plural(cardCount, { other: "ai.chat.tool-activity.cards" })}`);
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
