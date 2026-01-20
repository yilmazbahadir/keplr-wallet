import React, { useMemo } from "react";
import { useTheme } from "styled-components";
import { ColorPalette } from "../../../../styles";
import { Caption1 } from "../../../../components/typography";
import { KeyInfo } from "@keplr-wallet/background";
import { stringLengthByGrapheme } from "../../../../utils/string";

export const AccountNameIcon = ({
  keyInfoType,
  name,
  style,
}: {
  keyInfoType?: KeyInfo["type"];
  name: string;
  style?: React.CSSProperties;
}) => {
  const theme = useTheme();

  const firstLetter = useMemo(() => {
    if (stringLengthByGrapheme(name) !== name.length) {
      return "A";
    }
    return name[0].toUpperCase();
  }, [name]);

  const content = useMemo(() => {
    switch (keyInfoType) {
      case "ledger":
        return theme.mode === "light" ? <_LedgerIconLM /> : <_LedgerIconDM />;
      case "lattice1":
        return theme.mode === "light" ? (
          <_Lattice1IconLM />
        ) : (
          <_Lattice1IconDM />
        );
      case "keystone":
        return theme.mode === "light" ? (
          <_KeystoneIconLM />
        ) : (
          <_KeystoneIconDM />
        );
      default:
        return (
          <Caption1
            color={
              theme.mode === "light"
                ? ColorPalette["gray-300"]
                : ColorPalette["gray-200"]
            }
          >
            {firstLetter}
          </Caption1>
        );
    }
  }, [firstLetter, keyInfoType, theme.mode]);

  return (
    <div
      style={{
        width: "1.5rem",
        height: "1.5rem",
        borderRadius: "9999px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor:
          theme.mode === "light"
            ? ColorPalette["gray-100"]
            : ColorPalette["gray-550"],
        flexShrink: 0,
        ...(style ?? {}),
      }}
    >
      {content}
    </div>
  );
};

const _LedgerIconLM = () => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="12" fill="#DCDCE3" />
      <g clipPath="url(#clip0_2649_11332)">
        <path
          d="M5 14.6259V18.0465H10.266V17.2879H5.76727V14.6259H5ZM18.2327 14.6259V17.2879H13.734V18.0463H19V14.6259H18.2327ZM10.2736 9.42057V14.6258H13.734V13.9417H11.0409V9.42057H10.2736ZM5 6V9.42057H5.76727V6.75841H10.266V6H5ZM13.734 6V6.75841H18.2327V9.42057H19V6H13.734Z"
          fill="black"
        />
      </g>
      <defs>
        <clipPath id="clip0_2649_11332">
          <rect
            width="14"
            height="12.0465"
            fill="white"
            transform="translate(5 6)"
          />
        </clipPath>
      </defs>
    </svg>
  );
};

const _LedgerIconDM = () => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="12" fill="#242428" />
      <g clipPath="url(#clip0_2649_11348)">
        <path
          d="M5 14.6259V18.0465H10.266V17.2879H5.76727V14.6259H5ZM18.2327 14.6259V17.2879H13.734V18.0463H19V14.6259H18.2327ZM10.2736 9.42057V14.6258H13.734V13.9417H11.0409V9.42057H10.2736ZM5 6V9.42057H5.76727V6.75841H10.266V6H5ZM13.734 6V6.75841H18.2327V9.42057H19V6H13.734Z"
          fill="#FEFEFE"
        />
      </g>
      <defs>
        <clipPath id="clip0_2649_11348">
          <rect
            width="14"
            height="12.0465"
            fill="white"
            transform="translate(5 6)"
          />
        </clipPath>
      </defs>
    </svg>
  );
};

const _KeystoneIconLM = () => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="12" fill="#DCDCE3" />
      <path d="M7 6.5H13L9 15H6L7 6.5Z" fill="black" />
      <path d="M17 17.5H11L15 9H18L17 17.5Z" fill="#1F5AFF" />
    </svg>
  );
};

const _KeystoneIconDM = () => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="12" fill="#242428" />
      <path d="M7 6.5H13L9 15H6L7 6.5Z" fill="#F5F8FF" />
      <path d="M17 17.5H11L15 9H18L17 17.5Z" fill="#3D71FF" />
    </svg>
  );
};

const _Lattice1IconLM = () => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="12" fill="#DCDCE3" />
      <g transform="translate(3 8.83) scale(0.2535)">
        <path
          fill="#000000"
          d="M70.815 5.016H66.46V.73h-3.64v4.285h-4.356v3.43h4.356v4.285h3.64V8.447h4.355zM14.195 20.616c-.9.436-2.1.735-3.544.735-3.629 0-6.568-2.616-6.568-6.432 0-3.815 2.806-6.323 6.595-6.323 2.645 0 4.252.981 4.743 1.308l1.662-2.999c-.708-.462-2.725-1.825-6.568-1.825-6.048 0-10.33 4.3-10.33 9.84 0 5.538 4.278 9.81 10.248 9.81 4.007 0 6.27-1.445 7.305-2.235v-7.549h-3.543zM36.613 12.133c0-4.403-3.199-7.123-7.994-7.123h-7.04v19.722h3.87v-5.638h3.395l3.842 5.638h4.57l-4.516-6.507c2.442-1.15 3.873-3.282 3.873-6.093m-8.332 3.562h-2.832V8.408h2.861c2.554 0 4.291 1.374 4.291 3.73 0 2.16-1.71 3.563-4.32 3.563zM44.512 5.015h-3.87v19.718h3.87z"
        />
        <path
          fill="#000000"
          d="M66.441 15.038v-.593h-3.61v.593s-.039 1.436-.102 1.909c-.37 2.757-2.987 4.363-6.331 4.363h-3.563V8.435h3.582V5.01h-7.453v19.722h7.602c5.462 0 9.444-2.985 9.875-7.785.043-.475 0-1.909 0-1.909"
        />
      </g>
    </svg>
  );
};

const _Lattice1IconDM = () => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="12" fill="#242428" />
      <g transform="translate(3 8.83) scale(0.2535)">
        <path
          fill="#F5F8FF"
          d="M70.815 5.016H66.46V.73h-3.64v4.285h-4.356v3.43h4.356v4.285h3.64V8.447h4.355zM14.195 20.616c-.9.436-2.1.735-3.544.735-3.629 0-6.568-2.616-6.568-6.432 0-3.815 2.806-6.323 6.595-6.323 2.645 0 4.252.981 4.743 1.308l1.662-2.999c-.708-.462-2.725-1.825-6.568-1.825-6.048 0-10.33 4.3-10.33 9.84 0 5.538 4.278 9.81 10.248 9.81 4.007 0 6.27-1.445 7.305-2.235v-7.549h-3.543zM36.613 12.133c0-4.403-3.199-7.123-7.994-7.123h-7.04v19.722h3.87v-5.638h3.395l3.842 5.638h4.57l-4.516-6.507c2.442-1.15 3.873-3.282 3.873-6.093m-8.332 3.562h-2.832V8.408h2.861c2.554 0 4.291 1.374 4.291 3.73 0 2.16-1.71 3.563-4.32 3.563zM44.512 5.015h-3.87v19.718h3.87z"
        />
        <path
          fill="#F5F8FF"
          d="M66.441 15.038v-.593h-3.61v.593s-.039 1.436-.102 1.909c-.37 2.757-2.987 4.363-6.331 4.363h-3.563V8.435h3.582V5.01h-7.453v19.722h7.602c5.462 0 9.444-2.985 9.875-7.785.043-.475 0-1.909 0-1.909"
        />
      </g>
    </svg>
  );
};
