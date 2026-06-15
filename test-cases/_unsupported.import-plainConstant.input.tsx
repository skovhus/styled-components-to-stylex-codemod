// @expected-warning: Imported constant cannot be referenced inside stylex.create() — move it into a `.stylex` defineConsts/defineVars group (or map it via adapter.resolveValue)
// An imported scalar constant from a plain (non-`.stylex`) module is not
// statically resolvable by the StyleX compiler inside `stylex.create()`.
// The codemod must bail (not silently inline the value, which would destroy
// the shared source of truth) — the correct migration is to move COLUMN_WIDTH
// into a `.stylex` defineConsts group and reference that instead.
import styled from "styled-components";
import { COLUMN_WIDTH } from "./lib/helpers";

const Column = styled.div`
  width: ${COLUMN_WIDTH}px;
  height: 40px;
  background-color: #ddd6fe;
`;

export const App = () => <Column>Plain imported constant</Column>;
