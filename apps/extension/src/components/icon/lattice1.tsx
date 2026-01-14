import React, { FunctionComponent } from "react";
import { IconProps } from "./types";

export const Lattice1Icon: FunctionComponent<IconProps> = ({
  width = "auto",
  height = "0.875rem",
  color,
}) => {
  const colors: { [key: string]: { color1: string } } = {
    dark: {
      color1: "#f5f8ff",
    },
    light: {
      color1: "#000000",
    },
  };

  const colorValue = color && color in colors ? colors[color].color1 : color;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 71 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill={colorValue || "currentColor"}
        d="M70.815 5.016H66.46V.73h-3.64v4.285h-4.356v3.43h4.356v4.285h3.64V8.447h4.355zM14.195 20.616c-.9.436-2.1.735-3.544.735-3.629 0-6.568-2.616-6.568-6.432 0-3.815 2.806-6.323 6.595-6.323 2.645 0 4.252.981 4.743 1.308l1.662-2.999c-.708-.462-2.725-1.825-6.568-1.825-6.048 0-10.33 4.3-10.33 9.84 0 5.538 4.278 9.81 10.248 9.81 4.007 0 6.27-1.445 7.305-2.235v-7.549h-3.543zM36.613 12.133c0-4.403-3.199-7.123-7.994-7.123h-7.04v19.722h3.87v-5.638h3.395l3.842 5.638h4.57l-4.516-6.507c2.442-1.15 3.873-3.282 3.873-6.093m-8.332 3.562h-2.832V8.408h2.861c2.554 0 4.291 1.374 4.291 3.73 0 2.16-1.71 3.563-4.32 3.563zM44.512 5.015h-3.87v19.718h3.87z"
      />
      <path
        fill={colorValue || "currentColor"}
        d="M66.441 15.038v-.593h-3.61v.593s-.039 1.436-.102 1.909c-.37 2.757-2.987 4.363-6.331 4.363h-3.563V8.435h3.582V5.01h-7.453v19.722h7.602c5.462 0 9.444-2.985 9.875-7.785.043-.475 0-1.909 0-1.909"
      />
    </svg>
  );
};
