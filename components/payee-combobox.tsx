"use client";

import { Input } from "@/components/ui/input";

type PayeeOption = {
  id: string;
  name: string;
};

type PayeeComboboxProps = {
  id: string;
  value: string;
  payees: PayeeOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export const PayeeCombobox = ({
  id,
  value,
  payees,
  onChange,
  disabled,
  placeholder = "Merchant name",
}: PayeeComboboxProps) => {
  const listId = `${id}-payees`;
  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {payees.map((payee) => (
          <option key={payee.id} value={payee.name} />
        ))}
      </datalist>
    </>
  );
};
