import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";

const period = "flex flex-row gap-0.5";

export function AiChatElapsedTimeDisplay({ seconds: totalSeconds }: { seconds: number }) {
  const { _ } = useLingui();

  const sLabel = _(msg`ai.chat.elapsed-time.periods.seconds`);
  const mLabel = _(msg`ai.chat.elapsed-time.periods.minutes`);
  const hLabel = _(msg`ai.chat.elapsed-time.periods.hours`);

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

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

export function AiChatElapsedTimer() {
  const startRef = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return <AiChatElapsedTimeDisplay seconds={seconds} />;
}
