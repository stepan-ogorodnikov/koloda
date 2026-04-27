import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";

const period = "flex flex-row gap-0.5";

export function AiChatElapsedTimer() {
  const { _ } = useLingui();
  const startRef = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);

  const sLabel = _(msg`ai.chat.elapsed-time.periods.seconds`);
  const mLabel = _(msg`ai.chat.elapsed-time.periods.minutes`);
  const hLabel = _(msg`ai.chat.elapsed-time.periods.hours`);

  useEffect(() => {
    const update = () => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return (
    <span className="flex flex-row gap-1 fg-level-4">
      {h > 0 && (
        <span className={period}>
          <span>{h}</span>
          <span>{hLabel}</span>
        </span>
      )}
      {(h > 0 || m > 0) && (
        <span className={period}>
          <span>{m}</span>
          <span>{mLabel}</span>
        </span>
      )}
      <span className={period}>
        <span>{s}</span>
        <span>{sLabel}</span>
      </span>
    </span>
  );
}

export function AiChatMessageStatusPending({ label }: { label: string }) {
  return (
    <div className="self-start flex flex-row flex-wrap items-center gap-4">
      <p className="animate-shimmer-text--fg-level-4/fg-level-1">{label}</p>
      <AiChatElapsedTimer />
    </div>
  );
}
