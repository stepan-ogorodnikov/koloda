import {
  AiBrain01Icon,
  AlertCircleIcon,
  ChevronRightIcon,
  InvestigationIcon,
  WrenchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Button, CardsIcon } from "@koloda/ui";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { tv } from "tailwind-variants";

const toolActivityHeadline = tv({
  base: "flex flex-row items-center gap-2",
  variants: {
    isError: { true: "fg-error" },
    isRunning: { true: "animate-shimmer" },
  },
  defaultVariants: { isError: false, isRunning: false },
});

const thinkingLabel = tv({
  base: "font-medium",
  variants: {
    isRunning: { true: "animate-shimmer-text--fg-level-4/fg-level-1" },
  },
  defaultVariants: { isRunning: false },
});

const toolActivityTriggerClass = [
  "group/tool justify-start px-1 -mx-1 whitespace-normal font-normal animate-colors",
  "hover:bg-transparent data-pressed:bg-transparent data-pressed:shadow-none",
  "fg-level-3 hover:fg-level-2 data-pressed:fg-level-2",
];

// WHY: the fold sits in the chat flow, so an uncapped JSON dump would shove the
// answer down. Reasoning prose is uncapped; this scroller is not.
// The border frames only the disclosed payload; the trigger row stays a ghost fold.
const toolActivityPayloadClass = [
  "max-h-96 mt-1 p-3 overflow-y-auto overscroll-y-contain",
  "rounded-lg border-2 border-main bg-level-1",
].join(" ");

/**
 * Activity row for the compact widget.
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

export type AIReasoningRecord = {
  kind: "reasoning";
  id: string;
  text: string;
  status: "running" | "done";
};

export type AIActivityRecord = AIToolCallRecord | AIReasoningRecord;

export function isReasoningRecord(entry: AIActivityRecord): entry is AIReasoningRecord {
  return "kind" in entry && entry.kind === "reasoning";
}

export type AIToolActivityProps = {
  calls: readonly AIActivityRecord[];
  renderText?: (text: string) => ReactNode;
};

export function AIToolActivity({ calls, renderText }: AIToolActivityProps) {
  const { _ } = useLingui();
  if (calls.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 px-3" aria-label={_(msg`ai.chat.tool-activity.label`)}>
      {calls.map((call) =>
        isReasoningRecord(call) ? (
          <ReasoningActivityRow key={call.id} item={call} renderText={renderText} />
        ) : (
          <ToolActivityRow key={call.id} call={call} />
        ),
      )}
    </ul>
  );
}

type ReasoningActivityRowProps = { item: AIReasoningRecord; renderText?: (text: string) => ReactNode };

function ReasoningActivityRow({ item, renderText }: ReasoningActivityRowProps) {
  const { _ } = useLingui();
  const [isUserOpen, setIsUserOpen] = useState<boolean | null>(null);
  // WHY: open while tokens are arriving; auto-collapse when the next tool or
  // the answer starts (`status` flips to done) unless the user toggled.
  const isOpen = isUserOpen ?? item.status === "running";
  const displayName =
    item.status === "running" ? _(msg`ai.chat.tool-activity.thinking`) : _(msg`ai.chat.tool-activity.thought`);

  return (
    <li className="fg-level-4">
      <Button
        variants={{ style: "ghost", class: toolActivityTriggerClass }}
        aria-expanded={isOpen}
        onPress={() => setIsUserOpen(!isOpen)}
      >
        <span className={toolActivityHeadline()}>
          <HugeiconsIcon
            className="size-6 min-w-6"
            strokeWidth={1.75}
            icon={AiBrain01Icon}
            aria-hidden={item.status === "running" ? undefined : true}
            aria-label={item.status === "running" ? _(msg`ai.chat.tool-activity.running`) : undefined}
          />
          <span className={thinkingLabel({ isRunning: item.status === "running" })}>{displayName}</span>
          <FoldChevron />
        </span>
      </Button>
      {isOpen && item.text ? (
        renderText ? (
          <div className="py-3">{renderText(item.text)}</div>
        ) : (
          <p className="py-3 whitespace-pre-wrap leading-6 fg-level-3">{item.text}</p>
        )
      ) : null}
    </li>
  );
}

type ToolActivityRowProps = { call: AIToolCallRecord };

function ToolActivityRow({ call }: ToolActivityRowProps) {
  const { _ } = useLingui();
  // WHY: tool payloads stay collapsed until the user opens them. Reasoning
  // auto-opens while tokens arrive; a JSON dump must not.
  const [isOpen, setIsOpen] = useState(false);
  const displayName = toolCallLabel(call.name, _);
  const summary = toolCallSummary(call, _);
  const inputText = formatToolPayload(call.input);
  const bounded = call.status === "success" ? boundedToolOutput(call.output) : null;
  const outputText = call.status === "success" ? (bounded ? bounded.preview : formatToolPayload(call.output)) : "";
  const errorText = call.status === "error" ? formatToolPayload(call.error) : "";

  return (
    <li className="fg-level-4">
      <Button
        variants={{ style: "ghost", class: toolActivityTriggerClass }}
        aria-expanded={isOpen}
        onPress={() => setIsOpen(!isOpen)}
      >
        <span
          className={toolActivityHeadline({
            isError: call.status === "error",
            isRunning: call.status === "running",
          })}
        >
          <ToolCallStatusIcon name={call.name} status={call.status} />
          <div className="flex flex-row items-center gap-3">
            <span className="font-medium">{displayName}</span>
            <span>{summary}</span>
          </div>
          <FoldChevron />
        </span>
      </Button>
      {isOpen ? (
        <div className={toolActivityPayloadClass}>
          <div className="flex flex-col gap-2">
            <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.tool`)} text={call.name} />
            {inputText ? <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.input`)} text={inputText} /> : null}
            {outputText ? (
              <ToolPayloadBlock
                label={bounded ? _(msg`ai.chat.tool-activity.output-truncated`) : _(msg`ai.chat.tool-activity.output`)}
                text={outputText}
              />
            ) : null}
            {errorText ? <ToolPayloadBlock label={_(msg`ai.chat.tool-activity.failed`)} text={errorText} /> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function FoldChevron() {
  return (
    <HugeiconsIcon
      className="size-5 min-w-5 group-aria-expanded/tool:rotate-90 transition-transform duration-250 ease-in-out"
      strokeWidth={2}
      icon={ChevronRightIcon}
      aria-hidden="true"
    />
  );
}

type ToolCallStatusIconProps = {
  name: string;
  status: AIToolCallRecord["status"];
};

function ToolCallStatusIcon({ name, status }: ToolCallStatusIconProps) {
  const { _ } = useLingui();

  if (status === "error") {
    return (
      <HugeiconsIcon
        className="size-6 min-w-6"
        strokeWidth={1.75}
        icon={AlertCircleIcon}
        aria-label={_(msg`ai.chat.tool-activity.failed`)}
      />
    );
  }

  return (
    <HugeiconsIcon
      className="size-6 min-w-6"
      strokeWidth={1.75}
      icon={toolCallIcon(name)}
      aria-hidden={status === "running" ? undefined : true}
      aria-label={status === "running" ? _(msg`ai.chat.tool-activity.running`) : undefined}
    />
  );
}

function toolCallIcon(name: string): IconSvgElement {
  if (name === "list_decks") return InvestigationIcon;
  if (name === "get_deck_cards" || name === "propose_cards") return CardsIcon;
  // WHY: unknown protocol ids still render; they keep the generic search glyph.
  return WrenchIcon;
}

type ToolPayloadBlockProps = {
  label: string;
  text: string;
};

function ToolPayloadBlock({ label, text }: ToolPayloadBlockProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono">{label}</span>
      <pre className="whitespace-pre-wrap break-all">{text}</pre>
    </div>
  );
}

function toolCallLabel(name: string, translate: I18n["_"]): string {
  // WHY: labels exist only for the shipped tools; unknown names stay the protocol id
  // so a new tool still renders instead of a missing catalog string.
  if (name === "list_decks") return translate(msg`ai.chat.tool-activity.list-decks`);
  if (name === "get_deck_cards") return translate(msg`ai.chat.tool-activity.get-deck-cards`);
  if (name === "propose_cards") return translate(msg`ai.chat.tool-activity.propose-cards`);
  return name;
}

function toolCallSummary(call: AIToolCallRecord, translate: I18n["_"]): string | null {
  // WHY: the translator param must not be named `_`. Lingui treats `_()` as the
  // t-macro and extracts nested `plural()` as `{0}`, which does not match the SWC runtime id.
  if (call.status === "error") return translate(msg`ai.chat.tool-activity.failed`);
  if (call.status !== "success") return null;
  // WHY: compact counts exist only for these output shapes; unknown tools
  // must stay name-only (commit 5 copy decision / Visibility UI).
  if (call.name === "list_decks") {
    const deckCount = namedArrayLength(call.output, "decks");
    if (deckCount !== null) return translate(msg`${plural(deckCount, { other: "ai.chat.tool-activity.decks" })}`);
  }
  if (call.name === "get_deck_cards") {
    const cardCount = namedArrayLength(call.output, "cards") ?? namedNumber(call.output, "totalCards");
    if (cardCount !== null) return translate(msg`${plural(cardCount, { other: "ai.chat.tool-activity.cards" })}`);
  }
  if (call.name === "propose_cards") {
    const cardCount = namedArrayLength(call.output, "cards");
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

/**
 * Detects the bounded summary the conversation reducer persists for oversized
 * tool outputs: the live full output never reaches the run record, only
 * `{ isTruncated: true, itemCount, preview }` does.
 */
function boundedToolOutput(value: unknown): { itemCount: number; preview: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.isTruncated !== true) return null;
  const itemCount = typeof record.itemCount === "number" && Number.isFinite(record.itemCount) ? record.itemCount : null;
  const preview = typeof record.preview === "string" ? record.preview : null;
  if (itemCount === null || preview === null) return null;
  return { itemCount, preview };
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
