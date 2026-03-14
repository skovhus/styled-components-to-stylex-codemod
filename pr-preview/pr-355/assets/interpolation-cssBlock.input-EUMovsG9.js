import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r,u as i}from"./index-BEHMEpNn.js";e(t(),1);var a=n(),o=r.button`
  padding: 8px 16px;
  border-radius: 4px;

  ${e=>e.$primary?i`
          background: blue;
          color: white;

          &:after {
            content: "";
            position: absolute;
            inset: 0 4px;
            background-color: hotpink;
            z-index: -1;
            border-radius: 6px;
          }
        `:i`
          background: ${e.theme.color.bgBase};
          color: black;
        `}
`;function s(){return(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{children:`Normal`}),(0,a.jsx)(o,{$primary:!0,children:`Primary`})]})}export{s as App,o as Button};