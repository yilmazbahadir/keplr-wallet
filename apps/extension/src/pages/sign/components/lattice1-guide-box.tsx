import React, { FunctionComponent } from "react";
import { VerticalCollapseTransition } from "../../../components/transition/vertical-collapse";
import { Gutter } from "../../../components/gutter";
import { GuideBox } from "../../../components/guide-box";
import { useIntl } from "react-intl";

export const Lattice1GuideBox: FunctionComponent<{
  isLattice1Interacting: boolean;
  lattice1InteractingError: Error | undefined;
}> = ({ isLattice1Interacting, lattice1InteractingError }) => {
  const intl = useIntl();

  const hasError = lattice1InteractingError != null;
  const title = hasError
    ? intl.formatMessage({
        id: "page.sign.components.lattice1-guide.box.error-title",
      })
    : intl.formatMessage({
        id: "page.sign.components.lattice1-guide.box.sign-on-lattice1-title",
      });
  const paragraph = hasError
    ? lattice1InteractingError?.message ||
      intl.formatMessage({
        id: "page.sign.components.lattice1-guide.box.connect-lattice1-paragraph",
      })
    : intl.formatMessage({
        id: "page.sign.components.lattice1-guide.box.sign-on-lattice1-paragraph",
      });

  return (
    <VerticalCollapseTransition
      collapsed={!isLattice1Interacting && !lattice1InteractingError}
      transitionAlign="bottom"
    >
      <Gutter size="0.75rem" />
      <GuideBox
        color={hasError ? "warning" : undefined}
        title={title}
        paragraph={paragraph}
      />
    </VerticalCollapseTransition>
  );
};
