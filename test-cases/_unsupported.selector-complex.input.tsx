// @expected-warning: Unsupported selector: comma-separated selectors must all be simple pseudos
import styled from "styled-components";

// Class selectors with comma-separated (not pure pseudo-selectors)
// Note: Pure pseudo-selectors like "&:hover, &:focus" ARE supported
// but mixing with class/attribute selectors is not
const MultiSelector = styled.button`
  &.active,
  &[aria-selected="true"] {
    background: #4f74bf;
    color: white;
  }
`;

// Compound class selectors (multiple classes on same element)
const CompoundSelector = styled.div`
  &.card.highlighted {
    border: 2px solid gold;
  }

  &.card.error {
    border: 2px solid red;
    background: #fee;
  }
`;

// Complex nested selectors (descendant element selectors)
const ComplexNested = styled.nav`
  & a {
    color: #333;
    text-decoration: none;

    &:hover,
    &:focus {
      color: #bf4f74;
    }

    &.active {
      font-weight: bold;
      color: #4f74bf;
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
    <ComplexNested>
      <a href="#" className="active">
        Active Link
      </a>
      <a href="#">Normal Link</a>
    </ComplexNested>
    <GroupDescendant>
      <h1>Heading</h1>
      <p>Paragraph</p>
    </GroupDescendant>
  </div>
);
