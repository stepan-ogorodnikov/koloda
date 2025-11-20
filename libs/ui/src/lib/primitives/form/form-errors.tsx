import type { StandardSchemaV1Issue } from "@tanstack/react-form";

type FormErrorsProps = { errors: Record<string, StandardSchemaV1Issue[]> };

export function FormErrors({ errors }: FormErrorsProps) {
  const errorsArray = Object.values(errors).flat();

  return (
    <div className="flex flex-col" role="alert">
      {errorsArray.map((error, i) => <em key={i}>{error.message}</em>)}
    </div>
  );
}
