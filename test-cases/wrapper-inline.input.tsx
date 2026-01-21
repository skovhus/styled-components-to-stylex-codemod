import * as React from "react";
import styled from "styled-components";

import { ExternalComponent } from "./lib/external-component";

const StyledExternalComponent = styled(ExternalComponent)`
  margin: 0 -8px 0 -8px;
`;

export function App() {
  return (
    <div>
      <StyledExternalComponent isOpen />
    </div>
  );
}
