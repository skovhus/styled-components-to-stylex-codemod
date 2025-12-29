import styled from 'styled-components';

// Multiple selectors (comma-separated)
const MultiSelector = styled.button`
  &:hover,
  &:focus {
    background: #BF4F74;
    color: white;
  }

  &:active,
  &:focus-visible {
    outline: 2px solid #4F74BF;
    outline-offset: 2px;
  }

  &.active,
  &[aria-selected="true"] {
    background: #4F74BF;
    color: white;
  }
`;

// Compound selectors
const CompoundSelector = styled.div`
  &.card.highlighted {
    border: 2px solid gold;
  }

  &.card.error {
    border: 2px solid red;
    background: #fee;
  }
`;

// Chained pseudo-selectors
const ChainedPseudo = styled.input`
  &:focus:not(:disabled) {
    border-color: #BF4F74;
  }

  &:hover:not(:disabled):not(:focus) {
    border-color: #999;
  }

  &:checked:not(:disabled) {
    background: #BF4F74;
  }
`;

// Complex nested selectors
const ComplexNested = styled.nav`
  & a {
    color: #333;
    text-decoration: none;

    &:hover,
    &:focus {
      color: #BF4F74;
    }

    &.active {
      font-weight: bold;
      color: #4F74BF;
    }
  }
`;

// Group and descendant combination
const GroupDescendant = styled.div`
  & h1,
  & h2,
  & h3 {
    margin-bottom: 0.5em;
    line-height: 1.2;
  }

  & p,
  & li {
    margin-bottom: 1em;
    line-height: 1.6;
  }
`;

export const App = () => (
  <div>
    <MultiSelector>Multi Selector</MultiSelector>
    <CompoundSelector className="card highlighted">Compound</CompoundSelector>
    <ChainedPseudo type="checkbox" />
    <ComplexNested>
      <a href="#" className="active">Active Link</a>
      <a href="#">Normal Link</a>
    </ComplexNested>
    <GroupDescendant>
      <h1>Heading</h1>
      <p>Paragraph</p>
    </GroupDescendant>
  </div>
);
