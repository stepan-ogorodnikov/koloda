import { AppError, toFormErrors } from "@koloda/app";
import type { FormError } from "@koloda/app";
import { queriesAtom } from "@koloda/core-react";
import type { AddAttachmentData, TemplateFieldType } from "@koloda/srs";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIMES, getAttachmentBytesError } from "@koloda/srs";
import { Button, ImageIcon, TextField, useFieldContext } from "@koloda/ui";
import type { TextFieldTextAreaProps } from "@koloda/ui";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import { FileTrigger } from "react-aria-components";
import { altFromFileName, insertAtSelection, toAttachmentImageMarkdown } from "./image-insertion";

type CardContentTextAreaProps = TextFieldTextAreaProps & { fieldType: TemplateFieldType };

export function CardContentTextArea({ fieldType, ...props }: CardContentTextAreaProps) {
  if (fieldType === "markdown") return <CardMarkdownTextArea {...props} />;
  return <TextField.TextArea {...props} />;
}

async function readImageFile(file: File): Promise<AddAttachmentData> {
  if (file.size > ATTACHMENT_MAX_BYTES) throw new AppError("validation.attachments.too-large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const code = getAttachmentBytesError(bytes);
  if (code) throw new AppError(code);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AppError("validation.attachments.format");
  }
  const { width, height } = bitmap;
  bitmap.close();
  return { bytes, width, height };
}

function getImageFiles(files: FileList | null) {
  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
}

function CardMarkdownTextArea({ ref, ...props }: TextFieldTextAreaProps) {
  const { _ } = useLingui();
  const field = useFieldContext<string>();
  const { addAttachmentMutation } = useAtomValue(queriesAtom);
  const { mutateAsync } = useMutation(addAttachmentMutation());
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [isInserting, setIsInserting] = useState(false);

  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textAreaRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref && "current" in ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  const insertFiles = async (files: File[], getAlt: (file: File) => string) => {
    if (files.length === 0) return;
    const textArea = textAreaRef.current;
    const end = field.state.value.length;
    const selectionStart = textArea?.selectionStart ?? end;
    const selectionEnd = textArea?.selectionEnd ?? end;
    setErrors([]);
    setIsInserting(true);

    const images: string[] = [];
    const failures: FormError[] = [];
    for (const file of files) {
      try {
        const attachment = await mutateAsync(await readImageFile(file));
        images.push(toAttachmentImageMarkdown(getAlt(file), attachment.id));
      } catch (error) {
        failures.push(...Object.values(toFormErrors(error)).flat());
      }
    }

    setIsInserting(false);
    setErrors(failures);
    if (images.length === 0) return;
    const { value, cursor } = insertAtSelection(field.state.value, selectionStart, selectionEnd, images.join("\n"));
    field.handleChange(value);
    requestAnimationFrame(() => {
      textArea?.focus();
      textArea?.setSelectionRange(cursor, cursor);
    });
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = getImageFiles(event.clipboardData.files);
    if (files.length === 0) return;
    // WHY: a browser "Copy image" also puts HTML on the clipboard; the image data wins.
    // A pasted image's file name is always a generic one, so its alt stays empty.
    event.preventDefault();
    void insertFiles(files, () => "");
  };

  const handleDragOver = (event: DragEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.dataTransfer.items);
    if (items.some((item) => item.kind === "file" && item.type.startsWith("image/"))) event.preventDefault();
  };

  const handleDrop = (event: DragEvent<HTMLTextAreaElement>) => {
    const files = getImageFiles(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    void insertFiles(files, (file) => altFromFileName(file.name));
  };

  return (
    <>
      <TextField.TextArea
        {...props}
        ref={setRef}
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      />
      <div className="flex flex-row pt-1">
        <FileTrigger
          acceptedFileTypes={[...ATTACHMENT_MIMES]}
          allowsMultiple
          onSelect={(files) => void insertFiles(getImageFiles(files), (file) => altFromFileName(file.name))}
        >
          <Button variants={{ style: "ghost", size: "small" }} isDisabled={isInserting}>
            <ImageIcon className="size-4 min-w-4" aria-hidden="true" />
            {_(msg`card.content.insert-image`)}
          </Button>
        </FileTrigger>
      </div>
      {errors.length > 0 && <TextField.Errors errors={errors} />}
    </>
  );
}
