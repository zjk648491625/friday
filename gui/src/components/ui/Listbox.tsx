import {
  ListboxButton as HLButton,
  ListboxOption as HLOption,
  ListboxOptions as HLOptions,
  Listbox,
} from "@headlessui/react";
import * as React from "react";
import { defaultBorderRadius, vscCommandCenterInactiveBorder } from "..";
import { cn } from "../../util/cn";
import { FontSizeModifier, useFontSize } from "./font";

type ListboxButtonProps = React.ComponentProps<typeof HLButton> & {
  fontSizeModifier?: FontSizeModifier;
};

const ListboxButton = React.forwardRef<HTMLButtonElement, ListboxButtonProps>(
  ({ fontSizeModifier = -3, ...props }, ref) => {
    const fontSize = useFontSize(fontSizeModifier);
    return (
      <HLButton
        ref={ref}
        {...props}
        className={cn(
          "bg-vsc-input-background text-vsc-foreground border-border m-0 flex flex-1 cursor-pointer flex-row items-center gap-1 rounded-md border border-solid px-1 py-0.5 text-left transition-all duration-200 hover:brightness-105",
          props.className,
        )}
        style={{
          fontSize,
          borderRadius: defaultBorderRadius,
          ...props.style,
        }}
      />
    );
  },
);

type ListboxOptionsProps = React.ComponentProps<typeof HLOptions> & {
  fontSizeModifier?: FontSizeModifier;
};
const ListboxOptions = React.forwardRef<HTMLUListElement, ListboxOptionsProps>(
  ({ fontSizeModifier = -3, ...props }, ref) => {
    const fontSize = useFontSize(fontSizeModifier);
    return (
      <HLOptions
        ref={ref}
        anchor={"bottom start"}
        {...props}
        className={cn(
          "bg-vsc-input-background flex w-max min-w-[160px] max-w-[400px] flex-col overflow-auto px-0",
          props.className,
        )}
        style={{
          border: `1px solid ${vscCommandCenterInactiveBorder}`,
          fontSize,
          borderRadius: "0.5rem",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)",
          zIndex: 200000,
          ...props.style,
        }}
      />
    );
  },
);

type ListboxOptionProps = React.ComponentProps<typeof HLOption> & {
  fontSizeModifier?: FontSizeModifier;
};
const ListboxOption = React.forwardRef<HTMLLIElement, ListboxOptionProps>(
  ({ fontSizeModifier = -3, ...props }, ref) => {
    const fontSize = useFontSize(fontSizeModifier);
    return (
      <HLOption
        ref={ref}
        {...props}
        className={cn(
          "text-foreground flex select-none flex-row items-center justify-between px-2 py-1 first:rounded-t-md last:rounded-b-md",
          props.disabled
            ? "opacity-50"
            : "bg-transparent hover:bg-gray-200/70 dark:hover:bg-gray-600/70 cursor-pointer opacity-100 transition-colors duration-150",
          props.className,
        )}
        style={{
          fontSize,
          ...props.style,
        }}
      />
    );
  },
);

export { Listbox, ListboxButton, ListboxOption, ListboxOptions };
