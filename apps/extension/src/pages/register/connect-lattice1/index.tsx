import React, { FunctionComponent, useMemo, useState } from "react";
import { RegisterSceneBox } from "../components/register-scene-box";
import {
  useSceneEvents,
  useSceneTransition,
} from "../../../components/transition";
import { useRegisterHeader } from "../components/header";
import { Gutter } from "../../../components/gutter";
import { Box } from "../../../components/box";
import { XAxis, YAxis } from "../../../components/axis";
import { Body1, H2 } from "../../../components/typography";
import { ColorPalette } from "../../../styles";
import { Stack } from "../../../components/stack";
import { Button } from "../../../components/button";
import { observer } from "mobx-react-lite";
import { FormattedMessage, useIntl } from "react-intl";
import { useTheme } from "styled-components";
import {
  connectLattice1Client,
  createLattice1Client,
  fetchLattice1PubKeys,
  requestLattice1Credentials,
} from "../../../utils/lattice1";
import { Lattice1Accounts } from "@keplr-wallet/background";
import { Lattice1Icon } from "../../../components/icon/lattice1";
import { GuideBox } from "../../../components/guide-box";

type Step = "unknown" | "paired" | "connected" | "app";

const DEFAULT_LATTICE1_PATHS = [
  "m/44'/118'/0'/0/0",
  "m/44'/60'/0'/0/0",
  "m/44'/529'/0'/0/0",
  "m/44'/394'/0'/0/0",
  "m/44'/564'/0'/0/0",
  "m/44'/459'/0'/0/0",
  "m/44'/330'/0'/0/0",
  "m/44'/505'/0'/0/0",
  "m/44'/931'/0'/0/0",
];

const DEFAULT_COIN_TYPES = [118, 60, 529, 394, 564, 459, 330, 505, 931];
const DEFAULT_BITCOIN_COIN_TYPES = [0, 1];
const DEFAULT_BITCOIN_PURPOSE = 84;
const DEFAULT_LATTICE1_BITCOIN_PATHS = [
  "m/84'/0'/0'/0/0",
  "m/84'/1'/0'/0/0",
];

const isDefaultPath = (bip44Path: {
  account: number;
  change: number;
  addressIndex: number;
}) => {
  return (
    bip44Path.account === 0 &&
    bip44Path.change === 0 &&
    bip44Path.addressIndex === 0
  );
};

const getChainTypeFromPath = (path: string) => {
  const match = /^m\/\d+'\/(\d+)'\/\d+'\/\d+\/\d+$/i.exec(path);
  if (!match) {
    return "cosmos";
  }
  const coinType = Number(match[1]);
  if (coinType === 0 || coinType === 1) {
    return "bitcoin";
  }
  return coinType === 60 ? "evm" : "cosmos";
};

export const ConnectLattice1Scene: FunctionComponent<{
  name: string;
  password: string;
  bip44Path: {
    account: number;
    change: number;
    addressIndex: number;
  };
  stepPrevious: number;
  stepTotal: number;
}> = observer(({ name, password, bip44Path, stepPrevious, stepTotal }) => {
  const intl = useIntl();
  const theme = useTheme();

  const sceneTransition = useSceneTransition();

  const header = useRegisterHeader();
  useSceneEvents({
    onWillVisible: () => {
      header.setHeader({
        mode: "step",
        title: intl.formatMessage({
          id: "pages.register.connect-lattice1.title",
        }),
        paragraphs: [
          intl.formatMessage({
            id: "pages.register.connect-lattice1.paragraph",
          }),
        ],
        stepCurrent: stepPrevious + 1,
        stepTotal: stepTotal,
      });
    },
  });

  const [step, setStep] = useState<Step>("unknown");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const paths = useMemo(() => {
    const basePaths = isDefaultPath(bip44Path)
      ? DEFAULT_LATTICE1_PATHS
      : DEFAULT_COIN_TYPES.map(
          (each) =>
            `m/44'/${each}'/${bip44Path.account}'/${bip44Path.change}/${bip44Path.addressIndex}`
        );
    const bitcoinPaths = isDefaultPath(bip44Path)
      ? DEFAULT_LATTICE1_BITCOIN_PATHS
      : DEFAULT_BITCOIN_COIN_TYPES.map(
          (coinType) =>
            `m/${DEFAULT_BITCOIN_PURPOSE}'/${coinType}'/${bip44Path.account}'/${bip44Path.change}/${bip44Path.addressIndex}`
        );
    return [...basePaths, ...bitcoinPaths];
  }, [bip44Path]);

  const connectLattice1 = async () => {
    setIsLoading(true);
    setError(undefined);

    try {
      const creds = await requestLattice1Credentials();
      setStep("paired");

      const client = createLattice1Client(creds);
      const walletInfo = await connectLattice1Client(client, creds);
      setStep("connected");

      const pubKeysByPath = await fetchLattice1PubKeys(client, paths);
      setStep("app");

      const keys = paths.map((path) => ({
        path,
        publicKey: pubKeysByPath[path],
        chain: getChainTypeFromPath(path),
      }));

      const accounts: Lattice1Accounts = {
        keys,
        deviceId: creds.deviceId,
        walletUid: walletInfo.walletUid,
        walletName: walletInfo.walletName,
        endpoint: creds.endpoint,
        bip44Path: {
          account: bip44Path.account ?? 0,
          change: bip44Path.change ?? 0,
          addressIndex: bip44Path.addressIndex ?? 0,
        },
        connectionType: "WIFI",
        creds: {
          deviceId: creds.deviceId,
          password: creds.password,
          endpoint: creds.endpoint,
        },
      };

      sceneTransition.replaceAll("finalize-key", {
        name,
        password,
        lattice1: accounts,
        stepPrevious: stepPrevious + 1,
        stepTotal,
      });
    } catch (e) {
      console.log(e);
      setStep("unknown");
      setError(e?.message || "Failed to connect to Lattice1.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <RegisterSceneBox>
      <Stack gutter="1.25rem">
        <StepView
          step={1}
          paragraph={intl.formatMessage({
            id: "pages.register.connect-lattice1.step-1",
          })}
          icon={
            <Box style={{ opacity: step !== "unknown" ? 0.5 : 1 }}>
              <Lattice1Icon color={theme.mode} />
            </Box>
          }
          focused={step === "unknown"}
          completed={step !== "unknown"}
        />
        <StepView
          step={2}
          paragraph={intl.formatMessage({
            id: "pages.register.connect-lattice1.step-2",
          })}
          icon={
            <Box style={{ opacity: step !== "paired" ? 0.5 : 1 }}>
              <Lattice1Icon color={theme.mode} />
            </Box>
          }
          focused={step === "paired"}
          completed={step === "connected" || step === "app"}
        />
      </Stack>
      {error ? (
        <React.Fragment>
          <Gutter size="1rem" />
          <GuideBox
            color="warning"
            title={intl.formatMessage({
              id: "pages.register.connect-lattice1.error-title",
            })}
            paragraph={error}
          />
        </React.Fragment>
      ) : null}
      <Gutter size="1.25rem" />
      <Box width="22.5rem" marginX="auto">
        <Button
          text={intl.formatMessage({
            id: "button.next",
          })}
          size="large"
          isLoading={isLoading}
          onClick={connectLattice1}
        />
      </Box>
    </RegisterSceneBox>
  );
});

const StepView: FunctionComponent<{
  step: number;
  paragraph: string;
  icon?: React.ReactNode;

  focused: boolean;
  completed: boolean;
}> = ({ step, paragraph, icon, focused, completed }) => {
  const theme = useTheme();

  return (
    <Box
      paddingX="2rem"
      paddingY="1.25rem"
      borderRadius="1.125rem"
      backgroundColor={
        focused
          ? theme.mode === "light"
            ? ColorPalette["gray-50"]
            : ColorPalette["gray-500"]
          : theme.mode === "light"
          ? "none"
          : "transparent"
      }
    >
      <XAxis alignY="center">
        <div>{icon}</div>
        <Gutter size="1.25rem" />
        <YAxis>
          <XAxis>
            <H2
              style={{
                color: focused
                  ? theme.mode === "light"
                    ? ColorPalette["gray-400"]
                    : ColorPalette["gray-10"]
                  : theme.mode === "light"
                  ? ColorPalette["gray-200"]
                  : ColorPalette["gray-300"],
              }}
            >
              <FormattedMessage
                id="pages.register.connect-ledger.step-text"
                values={{ step }}
              />
            </H2>
            {completed ? (
              <React.Fragment>
                <Gutter size="0.25rem" />
                <CheckIcon
                  color={
                    focused ? ColorPalette["gray-10"] : ColorPalette["gray-300"]
                  }
                />
              </React.Fragment>
            ) : null}
          </XAxis>
          <Gutter size="0.5rem" />
          <Body1
            style={{
              color: focused
                ? theme.mode === "light"
                  ? ColorPalette["gray-300"]
                  : ColorPalette["gray-200"]
                : theme.mode === "light"
                ? ColorPalette["gray-200"]
                : ColorPalette["gray-300"],
            }}
          >
            {paragraph}
          </Body1>
        </YAxis>
      </XAxis>
    </Box>
  );
};

const CheckIcon: FunctionComponent<{
  color: string;
}> = ({ color }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="25"
      fill="none"
      viewBox="0 0 24 25"
    >
      <path
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="m5 14.25 4.5 4.5L19 9.25"
      />
    </svg>
  );
};
