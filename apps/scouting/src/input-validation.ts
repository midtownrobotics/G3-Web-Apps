import type { FormEvent } from "react";

export function showTeamNumberError(event: FormEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  input.setCustomValidity(
    input.validity.valueMissing
      ? "Enter a team number."
      : "Team numbers can contain digits only—for example, 1648.",
  );
}

export function clearInputError(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.setCustomValidity("");
}
