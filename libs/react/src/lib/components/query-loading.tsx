import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

interface QueryLoadingProps {
  message?: string;
}

export function QueryLoading({ message }: QueryLoadingProps) {
  const { _ } = useLingui();

  return (
    <div className="flex items-center justify-center py-4">
      <p className="fg-level-4">{message ?? _(msg`query-loading.message`)}</p>
    </div>
  );
}
