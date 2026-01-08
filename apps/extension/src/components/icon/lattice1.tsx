import React, { FunctionComponent } from "react";
import { IconProps } from "./types";

export const Lattice1Icon: FunctionComponent<IconProps> = ({
  width = "auto",
  height = "1.5rem",
  color,
}) => {
  const colors: { [key: string]: { color1: string; color2: string } } = {
    dark: {
      color1: "#f5f8ff",
      color2: "#3d71ff",
    },
    light: {
      color1: "#000000",
      color2: "#1f5aff",
    },
  };

  const color1 = color && color in colors ? colors[color].color1 : color;
  const color2 = color && color in colors ? colors[color].color2 : color;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="5" y="4" width="5" height="16" rx="1" fill={color1} />
      <rect x="5" y="15" width="14" height="5" rx="1" fill={color2} />
    </svg>
  );
};
