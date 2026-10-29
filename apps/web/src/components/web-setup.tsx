import { ERROR_MESSAGES, formatAppError } from "@koloda/app";
import { LanguagePicker } from "@koloda/settings-react";
import { langAtom, schemeAtom } from "@koloda/core-react";
import {
  Button,
  Dialog,
  ErrorMessage,
  KolodaLogo,
  LanguageIcon,
  MoonIcon,
  overlayFrame,
  RefreshIcon,
  SetupBackground,
  SunIcon,
  SystemThemeIcon,
  ToggleGroup,
} from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { Fragment } from "react";
import { tv } from "tailwind-variants";
import { getWebBrowserSupport } from "../app/browser-support";
import { webSetupMutationOptions } from "../app/queries";

const setupCard = overlayFrame({ class: "relative z-1 w-full max-w-lg p-6 wd:p-10 rounded-2xl border-main" });

// WHY: the prefs card sits behind the setup card's bottom edge: a negative top margin tucks it under.
// WHY: the prefs card is 2rem narrower than the setup card on each side, so its max width tracks the setup card's max-w-lg.
const setupPrefs = tv({
  base: [
    "relative z-0 -mt-14 p-3 pt-11 w-[calc(100%-4rem)] max-w-[calc(var(--container-lg)-4rem)] flex flex-row flex-wrap items-center justify-center gap-2 rounded-2xl",
    "bg-level-1 border-2 border-main shadow-setup-card",
    "motion:transition-opacity duration-200 motion:animate-in motion:slide-in-from-top-24 motion:animation-duration-600",
  ],
  variants: {
    isDisabled: { true: "opacity-45 pointer-events-none" },
  },
  defaultVariants: { isDisabled: false },
});

const setupTitle = tv({
  base: "font-bold tracking-tight text-balance fg-level-1",
  variants: {
    isVisible: {
      true: "text-[1.625rem] leading-tight",
      false: "sr-only",
    },
  },
  defaultVariants: { isVisible: false },
});

const SCHEME_ITEMS = [
  { id: "system", label: msg`scheme.system`, Icon: SystemThemeIcon },
  { id: "light", label: msg`scheme.light`, Icon: SunIcon },
  { id: "dark", label: msg`scheme.dark`, Icon: MoonIcon },
] as const;

const DIFFS = [
  { id: "storage", term: msg`web.setup.diff.storage.term`, detail: msg`web.setup.diff.storage.detail` },
  { id: "sync", term: msg`web.setup.diff.sync.term`, detail: msg`web.setup.diff.sync.detail` },
  { id: "ai", term: msg`web.setup.diff.ai.term`, detail: msg`web.setup.diff.ai.detail` },
  { id: "optimization", term: msg`web.setup.diff.optimization.term`, detail: msg`web.setup.diff.optimization.detail` },
  { id: "images", term: msg`web.setup.diff.images.term`, detail: msg`web.setup.diff.images.detail` },
  { id: "hotkeys", term: msg`web.setup.diff.hotkeys.term`, detail: msg`web.setup.diff.hotkeys.detail` },
];

export function WebSetup() {
  const { _ } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutate, isPending, isError, error } = useMutation(webSetupMutationOptions);
  const language = useAtomValue(langAtom);
  const scheme = useAtomValue(schemeAtom);
  const setScheme = useSetAtom(schemeAtom);
  const support = getWebBrowserSupport();
  const canSubmit = support.canRun && !isPending;
  const setupError = isError && error ? formatAppError(error, _, ERROR_MESSAGES.unknown) : null;

  const handleClick = () => {
    if (!canSubmit) return;
    mutate(
      { language, scheme },
      {
        onSuccess: () => {
          queryClient.resetQueries({ queryKey: ["app"] });
          navigate({ to: "/dashboard" });
        },
      },
    );
  };

  return (
    <div className="relative grow flex flex-col items-center justify-center gap-6 px-4 py-6 bg-body">
      <SetupBackground />
      <section className={setupCard} aria-labelledby="setup-title">
        <div className="flex flex-row items-center justify-between mb-10">
          <KolodaLogo className="h-6 w-auto" />
          <span className="fg-level-2 text-sm font-bold tracking-widest">{_(msg`web.setup.demo`)}</span>
        </div>
        <h1 id="setup-title" className={setupTitle({ isVisible: !support.canRun })}>
          {support.canRun ? _(msg`web.setup.title`) : _(msg`web.setup.unsupported.title`)}
        </h1>
        {support.canRun ? (
          <div className="flex flex-col gap-1 mt-3 fg-level-2 text-pretty">
            <p className="flex flex-row gap-3">{_(msg`web.setup.storage`)}</p>
            <Dialog.Root>
              <p>{_(msg`web.setup.diff.trigger`)}</p>
              <Button variants={{ style: "inline", size: "inline", class: "self-start" }} isDisabled={isPending}>
                {_(msg`web.setup.diff.link`)}
              </Button>
              <Dialog.Overlay>
                <Dialog.Modal variants={{ class: "w-full max-w-lg" }}>
                  <Dialog.Body>
                    <Dialog.Header>
                      <Dialog.Title>{_(msg`web.setup.diff.title`)}</Dialog.Title>
                      <Dialog.Close
                        slot="close"
                        aria-label={_(msg`web.setup.diff.close`)}
                        variants={{ class: "ml-auto" }}
                      />
                    </Dialog.Header>
                    <Dialog.Content variants={{ class: "p-6" }}>
                      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-4 leading-normal">
                        {DIFFS.map(({ id, term, detail }) => (
                          <Fragment key={id}>
                            <dt className="fg-level-1 font-semibold">{_(term)}</dt>
                            <dd className="fg-level-2 text-pretty">{_(detail)}</dd>
                          </Fragment>
                        ))}
                      </dl>
                    </Dialog.Content>
                  </Dialog.Body>
                </Dialog.Modal>
              </Dialog.Overlay>
            </Dialog.Root>
          </div>
        ) : (
          <p className="mt-3 fg-level-2 leading-relaxed text-pretty">{_(msg`web.setup.unsupported`)}</p>
        )}
        {setupError && (
          <div className="flex justify-center mt-6">
            <ErrorMessage message={setupError.message} details={setupError.details} />
          </div>
        )}
        {support.canRun && (
          <div className="mt-8">
            {/* INVARIANT: the button keeps its size while setup runs; only its label and spinner change, so it never moves under the pointer. */}
            <Button variants={{ style: "primary", class: "w-full" }} onClick={handleClick} isDisabled={!canSubmit}>
              {isPending && (
                <RefreshIcon className="size-5 min-w-5 animate-spin" strokeWidth={1.75} aria-hidden="true" />
              )}
              {isPending ? _(msg`web.setup.loading`) : _(msg`web.setup.submit`)}
            </Button>
            {!support.isChromiumBased && (
              <p className="mt-3 fg-level-3 text-center text-sm">{_(msg`web.setup.browser`)}</p>
            )}
          </div>
        )}
      </section>
      <div className={setupPrefs({ isDisabled: isPending })}>
        <ToggleGroup
          aria-label={_(msg`color-scheme-picker.label`)}
          isDisabled={isPending}
          selectedKeys={[scheme]}
          onSelectionChange={([value]) => setScheme(value.toString())}
        >
          {SCHEME_ITEMS.map(({ id, label, Icon }) => (
            <ToggleGroup.Item id={id} key={id} aria-label={_(label)} variants={{ size: "icon" }}>
              <Icon className="size-5 min-w-5" strokeWidth={1.75} aria-hidden="true" />
            </ToggleGroup.Item>
          ))}
        </ToggleGroup>
        <div className="grow" />
        <LanguagePicker
          buttonVariants={{ class: "w-48" }}
          icon={<LanguageIcon className="size-5 min-w-5" strokeWidth={1.75} aria-hidden="true" />}
          isPersisted={false}
          isDisabled={isPending}
        />
      </div>
    </div>
  );
}
